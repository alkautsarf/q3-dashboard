// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @title GreetingWall (Challenge 4: Gas-Lite Multi-Permit Greeting Contract)
/// @notice Users can set greetings with ETH, ERC-20 (EIP-2612 permit), or Permit2 signatures.
///         Stores only the hash of the latest greeting on-chain (cheap).
///         Emits the full greeting text in an event (8 gas/byte).
/// @dev Token == address(0) denotes ETH path.

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

interface IERC20Permit {
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external;
}

interface IPermit2 {
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }

    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external;
}

/// -----------------------------------------------------------------------
/// Custom Errors (typed)
/// -----------------------------------------------------------------------
error ZeroAddress(string param);
error InvalidFee(uint256 fee);
error PullFailed(address token, address from, address to, uint256 amount);
error WrongPermitToken(address expected, address actual);
error Permit2NotConfigured();
error EthTransferFailed(address to, uint256 amount);
error ForwardFailed();

contract Greeting {
    /// -----------------------------------------------------------------------
    /// Events
    /// -----------------------------------------------------------------------
    event GreetingLogged( // off-chain text
        // integrity check
        // address(0) for ETH
    address indexed user, string fullMessage, bytes32 messageHash, bool premium, uint256 fee, address indexed token);

    /// -----------------------------------------------------------------------
    /// Storage
    /// -----------------------------------------------------------------------
    bytes32 public lastGreetingHash; // store only hash on-chain
    uint256 public totalCounter; // total # of greetings
    mapping(address => uint256) public userGreetingCounter;

    address public immutable FEE_RECEIVER;
    IPermit2 public immutable PERMIT2; // optional, address(0) disables Permit2

    /// -----------------------------------------------------------------------
    /// Constructor
    /// -----------------------------------------------------------------------
    /// @dev _feeReceiver should be an EOA or non‑reentrant contract to avoid bounce loops via fallback
    constructor(address _feeReceiver, address permit2) {
        if (_feeReceiver == address(0)) revert ZeroAddress("FEE_RECEIVER");
        FEE_RECEIVER = _feeReceiver;
        PERMIT2 = IPermit2(permit2);
    }

    /// -----------------------------------------------------------------------
    /// ETH path
    /// -----------------------------------------------------------------------
    function setGreetingETH(string calldata newGreeting) external payable {
        _updateGreeting(msg.sender, newGreeting, msg.value > 0, msg.value, address(0));
        if (msg.value > 0) {
            (bool ok,) = payable(FEE_RECEIVER).call{value: msg.value}("");
            if (!ok) revert EthTransferFailed(FEE_RECEIVER, msg.value);
        }
    }

    /// -----------------------------------------------------------------------
    /// EIP-2612 path
    /// -----------------------------------------------------------------------
    function setGreetingWithPermit2612(
        address token,
        uint256 fee,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        string calldata newGreeting
    ) external {
        if (token == address(0)) revert ZeroAddress("token");
        if (fee == 0) revert InvalidFee(fee);

        // 1) Authorize spending
        IERC20Permit(token).permit(msg.sender, address(this), fee, deadline, v, r, s);

        // 2) Pull tokens
        bool ok = IERC20(token).transferFrom(msg.sender, FEE_RECEIVER, fee);
        if (!ok) revert PullFailed(token, msg.sender, FEE_RECEIVER, fee);

        _updateGreeting(msg.sender, newGreeting, true, fee, token);
    }

    /// -----------------------------------------------------------------------
    /// Permit2 path
    /// -----------------------------------------------------------------------
    function setGreetingWithPermit2(
        address token,
        uint256 fee,
        IPermit2.PermitTransferFrom calldata permit,
        bytes calldata signature,
        string calldata newGreeting
    ) external {
        if (address(PERMIT2) == address(0)) revert Permit2NotConfigured();
        if (token == address(0)) revert ZeroAddress("token");
        if (fee == 0) revert InvalidFee(fee);
        if (permit.permitted.token != token) revert WrongPermitToken(token, permit.permitted.token);

        PERMIT2.permitTransferFrom(
            permit, IPermit2.SignatureTransferDetails({to: FEE_RECEIVER, requestedAmount: fee}), msg.sender, signature
        );

        _updateGreeting(msg.sender, newGreeting, true, fee, token);
    }

    /// -----------------------------------------------------------------------
    /// Internal
    /// -----------------------------------------------------------------------
    function _updateGreeting(address user, string calldata newGreeting, bool isPremium, uint256 fee, address token)
        internal
    {
        bytes32 hash = keccak256(bytes(newGreeting));

        // update storage
        lastGreetingHash = hash;
        unchecked {
            totalCounter += 1;
            userGreetingCounter[user] += 1;
        }

        // emit full text (gas-lite)
        emit GreetingLogged(user, newGreeting, hash, isPremium, fee, token);
    }

    /// Immediately route ETH
    receive() external payable {
        (bool ok,) = payable(FEE_RECEIVER).call{value: msg.value}("");
        if(!ok) revert ForwardFailed();
    }

    fallback() external payable {
        (bool ok,) = payable(FEE_RECEIVER).call{value: msg.value}("");
        if(!ok) revert ForwardFailed();
    }
}
