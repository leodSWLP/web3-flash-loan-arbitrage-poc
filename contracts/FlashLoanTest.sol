//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import './interfaces/IUniswap.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

contract FlashLoanTest {
    using SafeERC20 for IERC20;

    uint160 private constant MIN_SQRT_RATIO = 4295128739;
    uint160 private constant MAX_SQRT_RATIO =
        1461446703485210103287273052203988822378723970342;

    error DebugLog(
        uint256 initialAmount,
        uint256 borrowedAmount,
        int256 amount0,
        int amount1
    );

    struct BorrowDetail {
        address caller;
        address borrowPool;
        address borrowToken;
        uint256 amountIn;
        bool zeroForOne;
    }

    struct SwapDetail {
        address routerAddress;
        address tokenIn;
        address tokenOut;
        uint24 fee;
        // uint256 amountIn;
        // uint256 amountOutMin;
        // uint160 sqrtPriceLimitX96;
    }

    function flashArbitrage(
        address borrowPool,
        address borrowToken,
        uint256 amountIn,
        bool zeroForOne,
        SwapDetail[] calldata swapDetails
    ) external {
        uint160 sqrtPriceLimitX96 = zeroForOne
            ? MIN_SQRT_RATIO + 1
            : MAX_SQRT_RATIO - 1;

        BorrowDetail memory borrowDetail = BorrowDetail({
            caller: msg.sender,
            borrowPool: borrowPool,
            borrowToken: borrowToken,
            amountIn: amountIn,
            zeroForOne: zeroForOne
        });

        bytes memory data = abi.encode(borrowDetail, swapDetails);

        IUniswapV3Pool(borrowPool).swap({
            recipient: address(this),
            zeroForOne: zeroForOne,
            amountSpecified: int256(amountIn),
            sqrtPriceLimitX96: sqrtPriceLimitX96,
            data: data
        });
    }

    function uniswapV3SwapCallback(
        int256 amount0,
        int256 amount1,
        bytes calldata data
    ) external view {
        (BorrowDetail memory borrowDetail, SwapDetail[] memory swapDetail) = abi
            .decode(data, (BorrowDetail, SwapDetail[]));

        uint256 borrowedAmount = IERC20(borrowDetail.borrowToken).balanceOf(
            address(this)
        );

        revert DebugLog(
            borrowDetail.amountIn,
            borrowedAmount,
            amount0,
            amount1
        );
    }
}
