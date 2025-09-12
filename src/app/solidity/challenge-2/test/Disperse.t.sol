// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "forge-std/StdCheats.sol";
import "../src/Disperse.sol";

/// Test suite for Disperse.sol covering ETH & ERC-20 flows,
/// validation errors, events, refund path, and fuzzing.
contract DisperseTest is Test {
    Disperse internal disperse;

    // Common actors
    address internal alice; // sender in most tests
    address internal bob;
    address internal carol;

    // Re-declare events to use expectEmit
    event TransferOut(address indexed token, address indexed to, uint256 amount);
    event BatchSent(address indexed token, address indexed sender, uint256 total, uint256 count);

    function setUp() public {
        disperse = new Disperse();
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        carol = makeAddr("carol");
    }

    // ----------------------
    // ETH: Success cases
    // ----------------------

    function testDisperseEther_Success_ExactNoRefund() public {
        address[] memory recipients = new address[](2);
        recipients[0] = bob;
        recipients[1] = carol;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 0.5 ether;
        amounts[1] = 1 ether;

        uint256 total = amounts[0] + amounts[1];

        vm.deal(alice, 10 ether);

        // Expect events (order matters)
        vm.startPrank(alice);
        vm.expectEmit(true, true, false, true);
        emit TransferOut(address(0), bob, amounts[0]);
        vm.expectEmit(true, true, false, true);
        emit TransferOut(address(0), carol, amounts[1]);
        vm.expectEmit(true, true, false, true);
        emit BatchSent(address(0), alice, total, 2);

        disperse.disperseEther{value: total}(recipients, amounts);
        vm.stopPrank();

        assertEq(bob.balance, amounts[0], "bob got amount");
        assertEq(carol.balance, amounts[1], "carol got amount");
        assertEq(address(disperse).balance, 0, "contract drained");
    }

    function testDisperseEther_Success_WithRefund() public {
        address[] memory recipients = new address[](2);
        recipients[0] = bob;
        recipients[1] = carol;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 0.25 ether;
        amounts[1] = 0.75 ether;

        uint256 total = amounts[0] + amounts[1];
        uint256 extra = 0.1 ether;
        uint256 supplied = total + extra;

        vm.deal(alice, 5 ether);
        vm.prank(alice);
        disperse.disperseEther{value: supplied}(recipients, amounts);

        // Recipients paid, leftover refunded, contract has 0
        assertEq(bob.balance, amounts[0]);
        assertEq(carol.balance, amounts[1]);
        assertEq(address(disperse).balance, 0);
    }

    // ----------------------
    // ETH: Error cases
    // ----------------------

    function testDisperseEther_Revert_NothingToSend() public {
        address[] memory recipients = new address[](0);
        uint256[] memory amounts = new uint256[](0);

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NothingToSend.selector));
        disperse.disperseEther{value: 0}(recipients, amounts);
    }

    function testDisperseEther_Revert_ArrayLengthMismatch() public {
        address[] memory recipients = new address[](2);
        recipients[0] = bob;
        recipients[1] = carol;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1;

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArrayLengthMismatch.selector));
        disperse.disperseEther{value: 1 ether}(recipients, amounts);
    }

    function testDisperseEther_Revert_InvalidRecipientZero() public {
        address[] memory recipients = new address[](2);
        recipients[0] = address(0);
        recipients[1] = carol;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 123;
        amounts[1] = 456;

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(InvalidRecipient.selector));
        disperse.disperseEther{value: 1 ether}(recipients, amounts);
    }

    function testDisperseEther_Revert_InvalidAmountZero() public {
        address[] memory recipients = new address[](2);
        recipients[0] = bob;
        recipients[1] = carol;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 0;
        amounts[1] = 456;

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(InvalidAmount.selector));
        disperse.disperseEther{value: 1 ether}(recipients, amounts);
    }

    function testDisperseEther_Revert_InsufficientMsgValue() public {
        address[] memory recipients = new address[](2);
        recipients[0] = bob;
        recipients[1] = carol;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1 ether;
        amounts[1] = 1 ether;

        vm.deal(alice, 1.5 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(InsufficientMsgValue.selector, 1.5 ether, 2 ether));
        disperse.disperseEther{value: 1.5 ether}(recipients, amounts);
    }

    function testDisperseEther_Revert_EthSendFailed_OnRecipient() public {
        // Recipient reverts on receive
        RevertingReceiver bad = new RevertingReceiver();

        address[] memory recipients = new address[](2);
        recipients[0] = bob;
        recipients[1] = address(bad);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1 wei;
        amounts[1] = 2 wei;

        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(EthSendFailed.selector, address(bad), 2));
        disperse.disperseEther{value: 3}(recipients, amounts);

        // whole tx reverted; recipients unchanged
        assertEq(bob.balance, 0);
        assertEq(address(bad).balance, 0);
    }

    function testDisperseEther_Revert_EthSendFailed_OnRefund() public {
        // Sender that rejects refunds
        RefundRevertingSender sender = new RefundRevertingSender(disperse);

        address[] memory recipients = new address[](1);
        recipients[0] = bob;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;

        vm.deal(address(sender), 3 ether);
        // call with more than needed to trigger refund
        vm.expectRevert(abi.encodeWithSelector(EthSendFailed.selector, address(sender), 1 ether));
        sender.callDisperseEther{value: 2 ether}(recipients, amounts);

        // whole tx reverted; bob not paid
        assertEq(bob.balance, 0);
    }

    // ----------------------
    // ETH: Fuzz
    // ----------------------

    function testFuzz_DisperseEther_Succeeds(
        address a,
        address b,
        uint96 x,
        uint96 y,
        uint96 extra
    ) public {
        // Constrain addresses and amounts
        vm.assume(a != address(0) && b != address(0) && a != b);
        // Ensure EOAs (no code) so they can receive ETH via .call
        vm.assume(a.code.length == 0 && b.code.length == 0);
        // Exclude precompiles (have no code but reject value transfers). Safe upper bound: > 0xFF
        vm.assume(uint160(a) > 0xFF && uint160(b) > 0xFF);

        uint256 amt1 = bound(uint256(x), 1, 1e18);
        uint256 amt2 = bound(uint256(y), 1, 1e18);
        uint256 extraEth = bound(uint256(extra), 0, 1e18);

        address[] memory recipients = new address[](2);
        recipients[0] = a;
        recipients[1] = b;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = amt1;
        amounts[1] = amt2;

        uint256 total = amt1 + amt2;
        uint256 supplied = total + extraEth;

        uint256 aBefore = a.balance;
        uint256 bBefore = b.balance;

        vm.deal(alice, 100 ether);
        vm.prank(alice);
        disperse.disperseEther{value: supplied}(recipients, amounts);

        assertEq(a.balance - aBefore, amt1);
        assertEq(b.balance - bBefore, amt2);
        assertEq(address(disperse).balance, 0);
    }

    // ----------------------
    // ERC-20: mocks
    // ----------------------

    function _mintAndApprove(MockERC20 token, address owner, uint256 amt) internal {
        token.mint(owner, amt);
        vm.prank(owner);
        token.approve(address(disperse), type(uint256).max);
    }

    // ----------------------
    // ERC-20: Success & events
    // ----------------------

    function testDisperseToken_Success_WithEvents() public {
        MockERC20 token = new MockERC20();
        _mintAndApprove(token, alice, 10_000 ether);

        address[] memory recipients = new address[](3);
        recipients[0] = bob;
        recipients[1] = carol;
        recipients[2] = makeAddr("dave");

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 100;
        amounts[1] = 200;
        amounts[2] = 300;
        uint256 total = 600;

        vm.startPrank(alice);
        vm.expectEmit(true, true, false, true);
        emit TransferOut(address(token), bob, amounts[0]);
        vm.expectEmit(true, true, false, true);
        emit TransferOut(address(token), carol, amounts[1]);
        vm.expectEmit(true, true, false, true);
        emit TransferOut(address(token), recipients[2], amounts[2]);
        vm.expectEmit(true, true, false, true);
        emit BatchSent(address(token), alice, total, 3);

        disperse.disperseToken(IERC20(address(token)), recipients, amounts);
        vm.stopPrank();

        assertEq(token.balanceOf(address(disperse)), 0, "contract drained");
        assertEq(token.balanceOf(bob), 100);
        assertEq(token.balanceOf(carol), 200);
    }

    // ----------------------
    // ERC-20: Error cases
    // ----------------------

    function testDisperseToken_Revert_NothingToSend() public {
        MockERC20 token = new MockERC20();
        _mintAndApprove(token, alice, 1 ether);

        address[] memory recipients = new address[](0);
        uint256[] memory amounts = new uint256[](0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NothingToSend.selector));
        disperse.disperseToken(IERC20(address(token)), recipients, amounts);
    }

    function testDisperseToken_Revert_ArrayLengthMismatch() public {
        MockERC20 token = new MockERC20();
        _mintAndApprove(token, alice, 1000);

        address[] memory recipients = new address[](2);
        recipients[0] = bob;
        recipients[1] = carol;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ArrayLengthMismatch.selector));
        disperse.disperseToken(IERC20(address(token)), recipients, amounts);
    }

    function testDisperseToken_Revert_InvalidRecipientZero() public {
        MockERC20 token = new MockERC20();
        _mintAndApprove(token, alice, 1000);

        address[] memory recipients = new address[](2);
        recipients[0] = address(0);
        recipients[1] = carol;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1;
        amounts[1] = 1;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(InvalidRecipient.selector));
        disperse.disperseToken(IERC20(address(token)), recipients, amounts);
    }

    function testDisperseToken_Revert_InvalidAmountZero() public {
        MockERC20 token = new MockERC20();
        _mintAndApprove(token, alice, 1000);

        address[] memory recipients = new address[](2);
        recipients[0] = bob;
        recipients[1] = carol;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 0;
        amounts[1] = 1;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(InvalidAmount.selector));
        disperse.disperseToken(IERC20(address(token)), recipients, amounts);
    }

    function testDisperseToken_Revert_TransferFromFailed_ReturnsFalse() public {
        // Token returns false on transferFrom
        FalseTransferFromToken token = new FalseTransferFromToken();
        token.mint(alice, 1_000);
        vm.prank(alice);
        token.approve(address(disperse), type(uint256).max);

        address[] memory recipients = new address[](1);
        recipients[0] = bob;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TransferFromFailed.selector));
        disperse.disperseToken(IERC20(address(token)), recipients, amounts);
    }

    function testDisperseToken_Revert_FeeOnTransferNotSupported() public {
        // Token pulls less than requested via transferFrom
        FeeOnTransferToken token = new FeeOnTransferToken(1); // fee = 1 unit per pull
        token.mint(alice, 1_000);
        vm.prank(alice);
        token.approve(address(disperse), type(uint256).max);

        address[] memory recipients = new address[](2);
        recipients[0] = bob;
        recipients[1] = carol;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 10;
        amounts[1] = 10;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FeeOnTransferNotSupported.selector));
        disperse.disperseToken(IERC20(address(token)), recipients, amounts);
    }

    function testDisperseToken_Revert_TransferFailed_ReturnsFalse() public {
        // Token returns true on transferFrom but false on transfer
        FalseTransferToken token = new FalseTransferToken();
        token.mint(alice, 1_000);
        vm.prank(alice);
        token.approve(address(disperse), type(uint256).max);

        address[] memory recipients = new address[](1);
        recipients[0] = bob;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TransferFailed.selector));
        disperse.disperseToken(IERC20(address(token)), recipients, amounts);
    }

    // ----------------------
    // ERC-20: Fuzz
    // ----------------------

    function testFuzz_DisperseToken_Succeeds(
        uint8 count,
        uint96 a0,
        uint96 a1,
        uint96 a2
    ) public {
        // Bound count between 1 and 3 to keep it light
        uint256 n = bound(uint256(count), 1, 3);
        address[] memory recipients = new address[](n);
        uint256[] memory amounts = new uint256[](n);

        address r0 = makeAddr("r0");
        address r1 = makeAddr("r1");
        address r2 = makeAddr("r2");
        if (n >= 1) { recipients[0] = r0; amounts[0] = bound(uint256(a0), 1, 1e18); }
        if (n >= 2) { recipients[1] = r1; amounts[1] = bound(uint256(a1), 1, 1e18); }
        if (n == 3) { recipients[2] = r2; amounts[2] = bound(uint256(a2), 1, 1e18); }

        MockERC20 token = new MockERC20();
        _mintAndApprove(token, alice, 1e24);

        uint256 total;
        for (uint256 i; i < n; i++) total += amounts[i];

        vm.prank(alice);
        disperse.disperseToken(IERC20(address(token)), recipients, amounts);

        // spot-check balances and contract drainage
        assertEq(token.balanceOf(address(disperse)), 0);
        assertEq(token.balanceOf(r0), amounts[0]);
        if (n >= 2) assertEq(token.balanceOf(r1), amounts[1]);
        if (n == 3) assertEq(token.balanceOf(r2), amounts[2]);
    }

    // ----------------------
    // Reentrancy surface
    // ----------------------

    function testReentrancy_Guard_OnTokenTransfer() public {
        // Token attempts to re-enter disperse during transfer
        ReentrantOnTransferToken token = new ReentrantOnTransferToken(disperse);
        token.mint(alice, 1_000);
        vm.prank(alice);
        token.approve(address(disperse), type(uint256).max);

        address[] memory recipients = new address[](1);
        recipients[0] = bob;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100;

        token.setReenter(true);
        vm.prank(alice);
        // The inner call will revert with Reentrancy(), bubbling up through token.transfer
        vm.expectRevert();
        disperse.disperseToken(IERC20(address(token)), recipients, amounts);
    }
}

// ----------------------
// Helper contracts
// ----------------------

contract RevertingReceiver {
    receive() external payable {
        revert("nope");
    }
}

contract RefundRevertingSender {
    Disperse immutable d;
    constructor(Disperse _d) payable { d = _d; }
    // Proxies a call to Disperse.disperseEther, but refuses refunds
    function callDisperseEther(address[] memory recipients, uint256[] memory values) external payable {
        d.disperseEther{value: msg.value}(recipients, values);
    }
    receive() external payable { revert("refund rejected"); }
}

// Minimal ERC20 implementation for testing
contract MockERC20 {
    string public name = "Mock";
    string public symbol = "MOCK";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 value) external {
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) public virtual returns (bool) {
        require(balanceOf[msg.sender] >= value, "bal");
        unchecked { balanceOf[msg.sender] -= value; }
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public virtual returns (bool) {
        require(balanceOf[from] >= value, "bal");
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= value, "allow");
        unchecked { allowance[from][msg.sender] = allowed - value; }
        unchecked { balanceOf[from] -= value; }
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }
}

// Token that always returns false on transferFrom
contract FalseTransferFromToken is MockERC20 {
    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}

// Token that returns true on transferFrom but false on transfer
contract FalseTransferToken is MockERC20 {
    function transfer(address, uint256) public pure override returns (bool) {
        return false;
    }
}

// Token that charges a flat fee on transferFrom (simulates fee-on-transfer pull)
contract FeeOnTransferToken is MockERC20 {
    uint256 public fee;
    constructor(uint256 _fee) { fee = _fee; }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        require(balanceOf[from] >= value, "bal");
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= value, "allow");
        unchecked { allowance[from][msg.sender] = allowed - value; }
        unchecked { balanceOf[from] -= value; }
        // only value - fee is transferred in
        uint256 credited = value > fee ? value - fee : 0;
        balanceOf[to] += credited;
        emit Transfer(from, to, credited);
        return true;
    }
}

// Token that re-enters Disperse during transfer
contract ReentrantOnTransferToken is MockERC20 {
    Disperse public immutable d;
    bool public reenter;
    constructor(Disperse _d) { d = _d; }
    function setReenter(bool v) external { reenter = v; }
    function transfer(address to, uint256 value) public override returns (bool) {
        if (reenter) {
            // Attempt to re-enter with minimal payload; will hit nonReentrant
            address[] memory r = new address[](1); r[0] = to;
            uint256[] memory vls = new uint256[](1); vls[0] = 1;
            // This call is expected to revert with Reentrancy() and bubble up
            d.disperseToken(IERC20(address(this)), r, vls);
        }
        return super.transfer(to, value);
    }
}
