// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';
import '@aave/core-v3/contracts/interfaces/IPool.sol';
import '@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/math/SafeCast.sol';
import '@uniswap/universal-router/contracts/interfaces/IUniversalRouter.sol';
import 'forge-std/console2.sol';
import './interfaces/IFlashLoan.sol';
import './interfaces/IPermit2.sol';

contract FlashArbitrageWithDebug is IFlashLoan, FlashLoanSimpleReceiverBase {
    using SafeERC20 for IERC20;

    // Custom errors for debugging
    error DebugLog(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    error ApprovalFailed(address token, address spender, uint256 amount);
    error Permit2ApprovalFailed(address token, address router, uint256 amount);
    error SwapExecutionFailed(
        address router,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    );
    error TransferFailed(address token, address recipient, uint256 amount);

    // Events for tracing
    event ApprovalSuccess(
        address indexed token,
        address indexed spender,
        uint256 amount
    );
    event Permit2ApprovalSuccess(
        address indexed token,
        address indexed router,
        uint256 amount
    );
    event SwapSuccess(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    event TransferSuccess(
        address indexed token,
        address indexed recipient,
        uint256 amount
    );
    event OperationStepFailedEvent(uint8 step, string reason);

    constructor(
        address provider
    ) FlashLoanSimpleReceiverBase(IPoolAddressesProvider(provider)) {}

    function executeFlashLoan(
        address borrowToken,
        uint256 amountIn,
        SwapDetail[] calldata swapDetails
    ) external {
        bytes memory params = abi.encode(swapDetails);
        uint16 referralCode = 0;
        // No try-catch here as POOL.flashLoanSimple is expected to revert on failure
        POOL.flashLoanSimple(
            address(this),
            borrowToken,
            amountIn,
            params,
            referralCode
        );
    }

    function _swap(
        address routerAddress,
        address permit2Address,
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) internal returns (uint256 amountOut, bool success) {
        console2.log('_swap amountIn: ', amountIn);

        // Step 1: Approve Permit2 to spend tokenIn
        try IERC20(tokenIn).approve(permit2Address, amountIn) {
            emit ApprovalSuccess(tokenIn, permit2Address, amountIn);
        } catch Error(string memory reason) {
            console2.log('Permit2 approval failed:', reason);
            emit OperationStepFailedEvent(1, reason);
            return (0, false);
        } catch {
            console2.log('Permit2 approval failed: unknown error');
            emit OperationStepFailedEvent(1, 'Unknown error');
            return (0, false);
        }

        // Step 2: Approve Universal Router via Permit2
        try
            IPermit2(permit2Address).approve(
                tokenIn,
                routerAddress,
                SafeCast.toUint160(amountIn),
                uint48(block.timestamp + 2 * 60)
            )
        {
            emit Permit2ApprovalSuccess(tokenIn, routerAddress, amountIn);
        } catch Error(string memory reason) {
            console2.log('Permit2 router approval failed:', reason);
            emit OperationStepFailedEvent(2, reason);
            return (0, false);
        } catch {
            console2.log('Permit2 router approval failed: unknown error');
            emit OperationStepFailedEvent(2, 'Unknown error');
            return (0, false);
        }

        // Step 3: Execute swap via Universal Router
        bytes memory commands = abi.encodePacked(bytes1(0x00));
        bytes memory path = abi.encodePacked(tokenIn, fee, tokenOut);
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(
            address(this),
            amountIn,
            amountOutMinimum,
            path,
            true
        );

        try
            IUniversalRouter(routerAddress).execute(
                commands,
                inputs,
                block.timestamp + 10
            )
        {
            amountOut = IERC20(tokenOut).balanceOf(address(this));
            console2.log('_swap amountOut: ', amountOut);
            emit SwapSuccess(tokenIn, tokenOut, amountIn, amountOut);
            success = true;
        } catch Error(string memory reason) {
            console2.log('Swap execution failed:', reason);
            emit OperationStepFailedEvent(3, reason);
            return (0, false);
        } catch {
            console2.log('Swap execution failed: unknown error');
            emit OperationStepFailedEvent(3, 'Unknown error');
            return (0, false);
        }

        return (amountOut, success);
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        SwapDetail[] memory swapDetails = abi.decode(params, (SwapDetail[]));
        uint256 repayAmount = amount + premium;
        uint256 currentAmount = amount;
        bool success = true;

        // Execute swaps in loop
        for (uint8 i = 0; i < swapDetails.length; i++) {
            SwapDetail memory detail = swapDetails[i];
            (uint256 swapAmountOut, bool swapSuccess) = _swap(
                detail.routerAddress,
                detail.permit2Address,
                detail.tokenIn,
                detail.tokenOut,
                detail.fee,
                currentAmount,
                0
            );

            if (!swapSuccess) {
                console2.log('Swap failed at index:', i);
                emit OperationStepFailedEvent(4 + i, 'Swap failed');
                success = false;
                break;
            }

            currentAmount = swapAmountOut;
        }

        // Check profitability
        if (success && currentAmount <= repayAmount) {
            console2.log(
                'Arbitrage not profitable:',
                repayAmount,
                currentAmount
            );
            emit OperationStepFailedEvent(100, 'Arbitrage not profitable');
            revert ArbitrageNotProfitable(repayAmount, currentAmount);
        }

        if (!success) {
            // Return false to indicate failure
            return false;
        }

        // Transfer profit to initiator
        try IERC20(asset).transfer(initiator, currentAmount - repayAmount) {
            emit TransferSuccess(asset, initiator, currentAmount - repayAmount);
        } catch Error(string memory reason) {
            console2.log('Profit transfer failed:', reason);
            emit OperationStepFailedEvent(101, reason);
            return false;
        } catch {
            console2.log('Profit transfer failed: unknown error');
            emit OperationStepFailedEvent(101, 'Unknown error');
            return false;
        }

        // Repay flash loan
        try IERC20(asset).transfer(msg.sender, repayAmount) {
            emit TransferSuccess(asset, msg.sender, repayAmount);
        } catch Error(string memory reason) {
            console2.log('Repay transfer failed:', reason);
            emit OperationStepFailedEvent(102, reason);
            return false;
        } catch {
            console2.log('Repay transfer failed: unknown error');
            emit OperationStepFailedEvent(102, 'Unknown error');
            return false;
        }

        emit ArbitrageProfitable(repayAmount, currentAmount);
        return true;
    }
}
