// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPancakeV3Pool} from '@pancakeswap/v3-core/contracts/interfaces/IPancakeV3Pool.sol';
import {IPancakeV3FlashCallback} from '@pancakeswap/v3-core/contracts/interfaces/callback/IPancakeV3FlashCallback.sol';
import {IPancakeV3SwapCallback} from '@pancakeswap/v3-core/contracts/interfaces/callback/IPancakeV3SwapCallback.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {console2} from 'forge-std/console2.sol';

contract TestAmountInOut is IPancakeV3FlashCallback, IPancakeV3SwapCallback {
    /**
     * @notice Initiates a flash loan from the specified pool and prepares for a swap on another pool.
     * @param flashPool The address of the pool to flash loan from.
     * @param flashZeroForOne The direction of the flash loan (true for token0->token1, false for token1->token0).
     * @param swapPool The address of the pool to perform the swap on.
     * @param swapZeroForOne The direction of the swap (true for token0->token1, false for token1->token0).
     * @param amount The amount to borrow in the flash loan.
     */
    function init(
        address flashPool,
        bool flashZeroForOne,
        address swapPool,
        bool swapZeroForOne,
        uint256 amount
    ) external {
        address token0 = IPancakeV3Pool(flashPool).token0();
        address token1 = IPancakeV3Pool(flashPool).token1();
        uint256 amount0 = flashZeroForOne ? amount : 0;
        uint256 amount1 = flashZeroForOne ? 0 : amount;

        IPancakeV3Pool(flashPool).flash(
            address(this),
            amount0,
            amount1,
            abi.encode(swapPool, swapZeroForOne)
        );
    }

    /**
     * @notice Callback for the PancakeSwap V3 flash loan.
     * Performs a swap using the borrowed amount and logs the swap details.
     */
    function pancakeV3FlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external override {
        (address swapPool, bool swapZeroForOne) = abi.decode(
            data,
            (address, bool)
        );

        // Verify caller is the flash pool (for security, in production add check: msg.sender == flashPool)
        IPancakeV3Pool flashPool = IPancakeV3Pool(msg.sender);
        address token0 = flashPool.token0();
        address token1 = flashPool.token1();

        uint256 amountReceived;
        address tokenReceived;
        address tokenToPay;
        uint256 fee;

        if (fee0 > 0) {
            amountReceived = IERC20(token0).balanceOf(address(this));
            tokenReceived = token0;
            tokenToPay = token1;
            fee = fee0;
        } else {
            amountReceived = IERC20(token1).balanceOf(address(this));
            tokenReceived = token1;
            tokenToPay = token0;
            fee = fee1;
        }

        // Approve tokens for swap
        IERC20(tokenReceived).approve(swapPool, amountReceived);

        // Perform the swap
        uint160 sqrtPriceLimitX96 = swapZeroForOne ? 0 : type(uint160).max;
        IPancakeV3Pool(swapPool).swap(
            address(this),
            swapZeroForOne,
            int256(amountReceived),
            sqrtPriceLimitX96,
            abi.encode(tokenToPay, fee)
        );

        // Note: Swap callback will handle logging
    }

    /**
     * @notice Callback for the PancakeSwap V3 swap.
     * Logs the swap amountIn and amountOut, then repays the flash loan.
     */
    function pancakeV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external override {
        (address tokenToPay, uint256 fee) = abi.decode(
            data,
            (address, uint256)
        );

        // Verify caller is the swap pool (for security, in production add check: msg.sender == swapPool)
        IPancakeV3Pool swapPool = IPancakeV3Pool(msg.sender);
        address token0 = swapPool.token0();
        address token1 = swapPool.token1();

        uint256 amountIn;
        uint256 amountOut;

        if (amount0Delta > 0) {
            amountIn = uint256(amount0Delta); // Input token0
            amountOut = uint256(-amount1Delta); // Output token1
            IERC20(token0).transfer(msg.sender, amountIn);
        } else {
            amountIn = uint256(amount1Delta); // Input token1
            amountOut = uint256(-amount0Delta); // Output token0
            IERC20(token1).transfer(msg.sender, amountIn);
        }

        (, int24 tick, , , , , ) = swapPool.slot0();
        // Log swap details
        console2.log('Tick: ');
        console2.logInt(int256(tick));
        console2.log('swap amountIn', amountIn);
        console2.log('swap amountOut', amountOut);

        // Repay flash loan (including fee)
        uint256 amountToRepay = amountOut + fee;
        IERC20(tokenToPay).transfer(msg.sender, amountToRepay);
    }
}
