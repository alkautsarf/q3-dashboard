// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @title Disperse (ETH + ERC-20) with reusable validation, safety checks & events
/// @notice ETH uses .call (not transfer) for post-EIP-1884 safety
/// @dev ERC-20 path assumes standard tokens (no fee-on-transfer). Reverts otherwise.
interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

error ArrayLengthMismatch();
error InvalidRecipient();
error InvalidAmount();
error NothingToSend();
error InsufficientMsgValue(uint256 supplied, uint256 required);
error EthSendFailed(address to, uint256 amount);
error TransferFromFailed();
error TransferFailed();
error FeeOnTransferNotSupported();
error Reentrancy();

contract Disperse {
    /// -----------------------------------------------------------------------
    /// Events
    /// -----------------------------------------------------------------------
    /// @dev For ETH, use token = address(0)
    event TransferOut(address indexed token, address indexed to, uint256 amount);
    event BatchSent(address indexed token, address indexed sender, uint256 total, uint256 count);

    /// -----------------------------------------------------------------------
    /// Reentrancy guard (minimal)
    /// -----------------------------------------------------------------------
    uint256 private _locked;
    modifier nonReentrant() {
        if (_locked == 1) revert Reentrancy();
        _locked = 1;
        _;
        _locked = 0;
    }

    /// -----------------------------------------------------------------------
    /// Public functions
    /// -----------------------------------------------------------------------

    /// @notice Sends ETH to each recipient, then refunds any leftover to sender.
    function disperseEther(address[] calldata recipients, uint256[] calldata values)
        external
        payable
        nonReentrant
    {
        // Reusable validation + total calculation
        (uint256 len, uint256 total) = _validateAndSum(recipients, values);

        if (msg.value < total) revert InsufficientMsgValue(msg.value, total);

        // Send ETH via .call
        for (uint256 i; i < len; ) {
            _safeSendETH(recipients[i], values[i]);
            emit TransferOut(address(0), recipients[i], values[i]);
            unchecked { ++i; }
        }

        // Refund any leftover ether
        _refundExcessETH();

        emit BatchSent(address(0), msg.sender, total, len);
    }

    /// @notice ERC-20 batch: requires prior approval of `total` for this contract.
    function disperseToken(
        IERC20 token,
        address[] calldata recipients,
        uint256[] calldata values
    ) external nonReentrant {
        // Reusable validation + total calculation
        (uint256 len, uint256 total) = _validateAndSum(recipients, values);

        // Pull once via transferFrom
        uint256 beforeBal = token.balanceOf(address(this));
        if (!token.transferFrom(msg.sender, address(this), total)) revert TransferFromFailed();
        uint256 afterBal = token.balanceOf(address(this));
        if (afterBal - beforeBal != total) revert FeeOnTransferNotSupported();

        // Fan-out transfers
        for (uint256 i; i < len; ) {
            if (!token.transfer(recipients[i], values[i])) revert TransferFailed();
            emit TransferOut(address(token), recipients[i], values[i]);
            unchecked { ++i; }
        }

        emit BatchSent(address(token), msg.sender, total, len);
    }

    /// -----------------------------------------------------------------------
    /// Internal: reusable validation & helpers
    /// -----------------------------------------------------------------------

    /// @dev Validates non-empty, aligned arrays; non-zero recipients; positive amounts; returns (len, total).
    function _validateAndSum(address[] calldata recipients, uint256[] calldata values)
        internal
        pure
        returns (uint256 len, uint256 total)
    {
        len = recipients.length;
        if (len == 0) revert NothingToSend();
        if (len != values.length) revert ArrayLengthMismatch();

        unchecked {
            for (uint256 i; i < len; ++i) {
                if (recipients[i] == address(0)) revert InvalidRecipient();
                uint256 amt = values[i];
                if (amt == 0) revert InvalidAmount();
                total += amt;
            }
        }
    }

    /// @dev Safe ETH send using call with proper revert bubbling.
    function _safeSendETH(address to, uint256 amount) internal {
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) revert EthSendFailed(to, amount);
    }

    /// @dev Refund any contract ETH balance back to sender.
    function _refundExcessETH() internal {
        uint256 refund = address(this).balance;
        if (refund > 0) {
            (bool ok, ) = payable(msg.sender).call{value: refund}("");
            if (!ok) revert EthSendFailed(msg.sender, refund);
        }
    }
}