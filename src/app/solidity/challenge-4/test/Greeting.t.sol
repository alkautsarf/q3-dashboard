// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";

// Interfaces copied from the target contract for type checks
interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

interface IERC20Permit {
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}


// Target
import {Greeting, IPermit2, ForwardFailed} from "src/Greeting.sol";

// ---------------------------------------------
// Test Helpers & Mocks
// ---------------------------------------------

contract Receiver {
    uint256 public total;
    event Received(address indexed from, uint256 amount);
    receive() external payable { total += msg.value; emit Received(msg.sender, msg.value); }
    function balance() external view returns (uint256) { return address(this).balance; }
}

contract RevertingReceiver {
    receive() external payable { revert("NO"); }
    fallback() external payable { revert("NO"); }
}

contract MockERC20Permit is IERC20, IERC20Permit {
    string public name = "MockToken";
    string public symbol = "MOCK";
    uint8 public decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public failTransfers;
    bool public invalidSignature;
    bool public invalidDomain;
    bool public expiredPermit;
    bool public wrongOwner;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function setFailTransfers(bool v) external { failTransfers = v; }
    function setInvalidSignature(bool v) external { invalidSignature = v; }
    function setInvalidDomain(bool v) external { invalidDomain = v; }
    function setExpiredPermit(bool v) external { expiredPermit = v; }
    function setWrongOwner(bool v) external { wrongOwner = v; }

    // Simplified transferFrom respecting allowances (no signature checks here)
    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        if (failTransfers) return false;
        uint256 a = allowance[from][msg.sender];
        require(a >= value, "ALLOW");
        require(balanceOf[from] >= value, "BAL");
        unchecked { allowance[from][msg.sender] = a - value; }
        balanceOf[from] -= value;
        balanceOf[to] += value;
        return true;
    }

    // Minimal EIP-2612-like behavior: set allowance(owner => spender) directly
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 /*deadline*/,
        uint8 /*v*/, bytes32 /*r*/, bytes32 /*s*/
    ) external {
        if (invalidSignature) revert("INVALID_SIG");
        if (invalidDomain) revert("INVALID_DOMAIN");
        if (expiredPermit) revert("EXPIRED");
        if (wrongOwner) revert("WRONG_OWNER");
        allowance[owner][spender] = value;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value; return true;
    }
}

contract MockPermit2 is IPermit2 {
    // If true, do not perform any transfer (to simulate faulty integration)
    bool public skipTransfers;
    bool public invalidSignature;
    bool public invalidDomain;
    bool public expiredPermit;
    bool public wrongOwner;
    event Permit2Used(address indexed owner, address indexed token, address to, uint256 requestedAmount);
    function setSkipTransfers(bool v) external { skipTransfers = v; }
    function setInvalidSignature(bool v) external { invalidSignature = v; }
    function setInvalidDomain(bool v) external { invalidDomain = v; }
    function setExpiredPermit(bool v) external { expiredPermit = v; }
    function setWrongOwner(bool v) external { wrongOwner = v; }

    function permitTransferFrom(
        PermitTransferFrom calldata permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata /*signature*/
    ) external {
        if (invalidSignature) revert("INVALID_SIG");
        if (invalidDomain) revert("INVALID_DOMAIN");
        if (expiredPermit) revert("EXPIRED");
        if (wrongOwner) revert("WRONG_OWNER");
        emit Permit2Used(owner, permit.permitted.token, transferDetails.to, transferDetails.requestedAmount);
        if (skipTransfers) return;
        // pull using ERC20 allowance granted to this mock
        require(
            IERC20(permit.permitted.token).transferFrom(owner, transferDetails.to, transferDetails.requestedAmount),
            "P2_XFER"
        );
    }
}

contract GreetingTest is Test {
    event GreetingLogged(address indexed user, string fullMessage, bytes32 messageHash, bool premium, uint256 fee, address indexed token);

    Receiver feeReceiver;
    MockERC20Permit token;
    MockPermit2 permit2;
    Greeting greet;

    address user = address(0xA11CE);

    function _assertNoStateChange() internal view {
        assertEq(greet.lastGreetingHash(), bytes32(0));
        assertEq(greet.totalCounter(), 0);
        assertEq(greet.userGreetingCounter(user), 0);
        assertEq(address(feeReceiver).balance, 0);
        assertEq(token.balanceOf(address(feeReceiver)), 0);
    }

    function setUp() public {
        feeReceiver = new Receiver();
        token = new MockERC20Permit();
        permit2 = new MockPermit2();
        greet = new Greeting(address(feeReceiver), address(permit2));

        vm.deal(user, 100 ether);
        token.mint(user, 1_000_000 ether);
    }

    function test_constructor_RevertOnZeroFeeReceiver() public {
        vm.expectRevert(abi.encodeWithSignature("ZeroAddress(string)", "FEE_RECEIVER"));
        new Greeting(address(0), address(permit2));
    }

    // -------------------- ETH path --------------------
    function test_ETH_NoFee_UpdatesHashAndCounters() public {
        string memory msgText = "hello world";
        bytes32 h = keccak256(bytes(msgText));

        vm.expectEmit(true, true, true, true);
        emit GreetingLogged(user, msgText, h, false, 0, address(0));

        vm.prank(user);
        greet.setGreetingETH{value: 0}(msgText);

        assertEq(greet.lastGreetingHash(), h);
        assertEq(greet.totalCounter(), 1);
        assertEq(greet.userGreetingCounter(user), 1);
        assertEq(address(feeReceiver).balance, 0);
    }

    function test_ETH_WithFee_ForwardsAndLogs() public {
        string memory msgText = unicode"gm ☕";
        uint256 amt = 1.23 ether;
        bytes32 h = keccak256(bytes(msgText));

        uint256 beforeBal = address(feeReceiver).balance;

        vm.expectEmit(true, true, true, true);
        emit GreetingLogged(user, msgText, h, true, amt, address(0));

        vm.prank(user);
        greet.setGreetingETH{value: amt}(msgText);

        assertEq(address(feeReceiver).balance, beforeBal + amt);
        assertEq(greet.lastGreetingHash(), h);
        assertEq(greet.totalCounter(), 1);
        assertEq(greet.userGreetingCounter(user), 1);
    }

    function test_fallback_ForwardsETHToReceiver() public {
        uint256 amt = 0.5 ether;
        uint256 before = address(feeReceiver).balance;

        vm.prank(user);
        (bool ok,) = address(greet).call{value: amt}("");
        assertTrue(ok);
        assertEq(address(feeReceiver).balance, before + amt);
        assertEq(address(greet).balance, 0);
    }

    function test_fallback_WithData_ForwardsETHToReceiver() public {
        uint256 amt = 0.25 ether;
        uint256 before = address(feeReceiver).balance;
        vm.prank(user);
        // non-empty calldata to guarantee fallback path
        (bool ok,) = address(greet).call{value: amt}(hex"01");
        assertTrue(ok);
        assertEq(address(feeReceiver).balance, before + amt);
        assertEq(address(greet).balance, 0);
    }

    function test_ETH_RevertWhenReceiverReverts() public {
        RevertingReceiver bad = new RevertingReceiver();
        Greeting g2 = new Greeting(address(bad), address(permit2));
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSignature("EthTransferFailed(address,uint256)", address(bad), 1 ether));
        g2.setGreetingETH{value: 1 ether}("x");
    }

    function test_fallback_RevertWhenReceiverReverts() public {
        RevertingReceiver bad = new RevertingReceiver();
        Greeting g2 = new Greeting(address(bad), address(permit2));
        vm.prank(user);
        vm.expectRevert(ForwardFailed.selector);
        (bool ok,) = address(g2).call{value: 1 ether}("");
        ok; // silence
    }

    function test_fallback_WithData_RevertWhenReceiverReverts() public {
        RevertingReceiver bad = new RevertingReceiver();
        Greeting g2 = new Greeting(address(bad), address(permit2));
        vm.prank(user);
        vm.expectRevert(ForwardFailed.selector);
        (bool ok,) = address(g2).call{value: 1 ether}(hex"01");
        ok; // silence
    }

    // -------------------- 2612 path --------------------
    function test_2612_SucceedsAndLogs() public {
        uint256 fee = 10 ether;
        // permit will set allowance(user => address(greet))
        bytes32 r; bytes32 s; uint8 v;

        vm.expectEmit(true, true, true, true);
        emit GreetingLogged(user, "hi", keccak256(bytes("hi")), true, fee, address(token));

        vm.prank(user);
        greet.setGreetingWithPermit2612(address(token), fee, type(uint256).max, v, r, s, "hi");

        assertEq(token.balanceOf(address(feeReceiver)), fee);
        assertEq(greet.totalCounter(), 1);
        assertEq(greet.userGreetingCounter(user), 1);
    }

    function test_2612_RevertOnZeroToken() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSignature("ZeroAddress(string)", "token"));
        greet.setGreetingWithPermit2612(address(0), 1, 0, 0, bytes32(0), bytes32(0), "x");
    }

    function test_2612_RevertOnZeroFee() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSignature("InvalidFee(uint256)", 0));
        greet.setGreetingWithPermit2612(address(token), 0, 0, 0, bytes32(0), bytes32(0), "x");
    }

    function test_2612_RevertWhenTransferReturnsFalse() public {
        token.setFailTransfers(true);
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSignature(
            "PullFailed(address,address,address,uint256)", address(token), user, address(feeReceiver), 1
        ));
        greet.setGreetingWithPermit2612(address(token), 1, 0, 0, bytes32(0), bytes32(0), "x");
    }

    function test_2612_RevertOnInvalidSignature() public {
        uint256 fee = 5 ether;

        token.setInvalidSignature(true);
        vm.prank(user);
        vm.expectRevert("INVALID_SIG");
        greet.setGreetingWithPermit2612(address(token), fee, block.timestamp + 1, 0, bytes32(0), bytes32(0), "invalid");
        _assertNoStateChange();

        token.setInvalidSignature(false);
        token.setInvalidDomain(true);
        vm.prank(user);
        vm.expectRevert("INVALID_DOMAIN");
        greet.setGreetingWithPermit2612(address(token), fee, block.timestamp + 1, 0, bytes32(0), bytes32(0), "domain");
        _assertNoStateChange();

        token.setInvalidDomain(false);
        token.setWrongOwner(true);
        vm.prank(user);
        vm.expectRevert("WRONG_OWNER");
        greet.setGreetingWithPermit2612(address(token), fee, block.timestamp + 1, 0, bytes32(0), bytes32(0), "owner");
        _assertNoStateChange();

        token.setWrongOwner(false);
    }

    function test_2612_RevertOnExpiredDeadline() public {
        uint256 fee = 3 ether;
        token.setExpiredPermit(true);
        vm.prank(user);
        vm.expectRevert("EXPIRED");
        greet.setGreetingWithPermit2612(address(token), fee, block.timestamp - 1, 0, bytes32(0), bytes32(0), "expired");
        _assertNoStateChange();
        token.setExpiredPermit(false);
    }

    // -------------------- Permit2 path --------------------
    function test_Permit2_SucceedsAndLogs() public {
        uint256 fee = 7 ether;
        // Owner (user) approves Permit2 to spend on their behalf
        vm.prank(user);
        token.approve(address(permit2), type(uint256).max);

        IPermit2.PermitTransferFrom memory p;
        p.permitted = IPermit2.TokenPermissions({ token: address(token), amount: fee });
        p.nonce = 0; p.deadline = type(uint256).max;

        IPermit2.SignatureTransferDetails memory td = IPermit2.SignatureTransferDetails({ to: address(feeReceiver), requestedAmount: fee });

        vm.expectEmit(true, true, true, true);
        emit GreetingLogged(user, "p2", keccak256(bytes("p2")), true, fee, address(token));

        vm.prank(user);
        greet.setGreetingWithPermit2(address(token), fee, p, bytes("sig"), "p2");

        assertEq(token.balanceOf(address(feeReceiver)), fee);
        assertEq(greet.totalCounter(), 1);
        assertEq(greet.userGreetingCounter(user), 1);
    }

    function test_Permit2_RevertWhenNotConfigured() public {
        Greeting g2 = new Greeting(address(feeReceiver), address(0));
        IPermit2.PermitTransferFrom memory p;
        p.permitted = IPermit2.TokenPermissions({ token: address(token), amount: 1 });
        p.nonce = 0; p.deadline = type(uint256).max;
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSignature("Permit2NotConfigured()"));
        g2.setGreetingWithPermit2(address(token), 1, p, bytes("sig"), "x");
    }

    function test_Permit2_RevertOnWrongToken() public {
        IPermit2.PermitTransferFrom memory p;
        p.permitted = IPermit2.TokenPermissions({ token: address(0xBEEF), amount: 1 });
        p.nonce = 0; p.deadline = type(uint256).max;
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSignature("WrongPermitToken(address,address)", address(token), address(0xBEEF)));
        greet.setGreetingWithPermit2(address(token), 1, p, bytes("sig"), "x");
    }

    function test_Permit2_RevertOnZeroToken() public {
        IPermit2.PermitTransferFrom memory p;
        p.permitted = IPermit2.TokenPermissions({ token: address(token), amount: 1 });
        p.nonce = 0; p.deadline = type(uint256).max;
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSignature("ZeroAddress(string)", "token"));
        greet.setGreetingWithPermit2(address(0), 1, p, bytes("sig"), "x");
    }

    function test_Permit2_RevertOnZeroFee() public {
        IPermit2.PermitTransferFrom memory p;
        p.permitted = IPermit2.TokenPermissions({ token: address(token), amount: 0 });
        p.nonce = 0; p.deadline = type(uint256).max;
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSignature("InvalidFee(uint256)", 0));
        greet.setGreetingWithPermit2(address(token), 0, p, bytes("sig"), "x");
    }

    function test_Permit2_RevertOnInvalidSignature() public {
        uint256 fee = 11 ether;

        IPermit2.PermitTransferFrom memory p;
        p.permitted = IPermit2.TokenPermissions({ token: address(token), amount: fee });
        p.nonce = 0; p.deadline = block.timestamp + 1;

        permit2.setInvalidSignature(true);
        vm.prank(user);
        vm.expectRevert("INVALID_SIG");
        greet.setGreetingWithPermit2(address(token), fee, p, abi.encodePacked(bytes32(uint256(1))), "invalid");
        _assertNoStateChange();

        permit2.setInvalidSignature(false);
        permit2.setInvalidDomain(true);
        p.deadline = block.timestamp + 1;
        vm.prank(user);
        vm.expectRevert("INVALID_DOMAIN");
        greet.setGreetingWithPermit2(address(token), fee, p, abi.encodePacked(bytes32(uint256(2))), "domain");
        _assertNoStateChange();

        permit2.setInvalidDomain(false);
        permit2.setWrongOwner(true);
        p.deadline = block.timestamp + 1;
        vm.prank(user);
        vm.expectRevert("WRONG_OWNER");
        greet.setGreetingWithPermit2(address(token), fee, p, abi.encodePacked(bytes32(uint256(3))), "owner");
        _assertNoStateChange();

        permit2.setWrongOwner(false);
    }

    function test_Permit2_RevertOnExpiredDeadline() public {
        uint256 fee = 9 ether;
        IPermit2.PermitTransferFrom memory p;
        p.permitted = IPermit2.TokenPermissions({ token: address(token), amount: fee });
        p.nonce = 0; p.deadline = block.timestamp - 1;
        permit2.setExpiredPermit(true);
        vm.prank(user);
        vm.expectRevert("EXPIRED");
        greet.setGreetingWithPermit2(address(token), fee, p, abi.encodePacked(bytes32(uint256(4))), "expired");
        _assertNoStateChange();
        permit2.setExpiredPermit(false);
    }

    // -------------------- Fuzzing --------------------
    function testFuzz_ETH_GreetingAndForward(string memory msgText, uint96 rawAmt) public {
        // bound fee up to 5 ether for speed
        uint256 amt = uint256(rawAmt) % (5 ether);
        vm.deal(user, 10 ether + amt);
        uint256 before = address(feeReceiver).balance;
        vm.prank(user);
        greet.setGreetingETH{value: amt}(msgText);

        assertEq(greet.lastGreetingHash(), keccak256(bytes(msgText)));
        assertEq(address(feeReceiver).balance, before + amt);
        assertEq(greet.userGreetingCounter(user), 1);
        assertEq(greet.totalCounter(), 1);
    }

    function testFuzz_2612_Greeting(string memory msgText, uint96 rawFee) public {
        uint256 fee = (uint256(rawFee) % 1_000 ether) + 1; // at least 1 wei
        token.mint(user, fee);
        bytes32 r; bytes32 s; uint8 v;
        vm.prank(user);
        greet.setGreetingWithPermit2612(address(token), fee, type(uint256).max, v, r, s, msgText);
        assertEq(token.balanceOf(address(feeReceiver)), fee);
        assertEq(greet.lastGreetingHash(), keccak256(bytes(msgText)));
    }

    function testFuzz_Permit2_Greeting(string memory msgText, uint96 rawFee) public {
        uint256 fee = (uint256(rawFee) % 1_000 ether) + 1;
        token.mint(user, fee);
        vm.prank(user); token.approve(address(permit2), type(uint256).max);
        IPermit2.PermitTransferFrom memory p;
        p.permitted = IPermit2.TokenPermissions({ token: address(token), amount: fee });
        p.nonce = 0; p.deadline = type(uint256).max;
        IPermit2.SignatureTransferDetails memory td = IPermit2.SignatureTransferDetails({ to: address(feeReceiver), requestedAmount: fee });
        vm.prank(user);
        greet.setGreetingWithPermit2(address(token), fee, p, bytes("sig"), msgText);
        assertEq(token.balanceOf(address(feeReceiver)), fee);
        assertEq(greet.lastGreetingHash(), keccak256(bytes(msgText)));
    }

    function testFuzz_2612_InvalidSignature_NoStateChange(uint8 v, bytes32 r, bytes32 s) public {
        uint256 fee = 2 ether;
        token.setInvalidSignature(true);
        vm.prank(user);
        vm.expectRevert("INVALID_SIG");
        greet.setGreetingWithPermit2612(address(token), fee, block.timestamp + 100, v, r, s, "fuzz_fail");
        _assertNoStateChange();
        token.setInvalidSignature(false);
    }

    function testFuzz_Permit2_InvalidSignature_NoStateChange(uint8 v, bytes32 r, bytes32 s) public {
        uint256 fee = 4 ether;
        permit2.setInvalidSignature(true);
        IPermit2.PermitTransferFrom memory p;
        p.permitted = IPermit2.TokenPermissions({ token: address(token), amount: fee });
        p.nonce = 0; p.deadline = block.timestamp + 100;
        bytes memory signature = abi.encodePacked(r, s, bytes32(uint256(v)));
        vm.prank(user);
        vm.expectRevert("INVALID_SIG");
        greet.setGreetingWithPermit2(address(token), fee, p, signature, "fuzz_fail");
        _assertNoStateChange();
        permit2.setInvalidSignature(false);
    }
}
