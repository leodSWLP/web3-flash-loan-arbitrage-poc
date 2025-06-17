//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IFlashLoan {
    error ArbitrageNotProfitable(
        uint256 repayAmountRequired,
        uint256 actualAmountOut
    );
    error OperationStepFailed(uint8 step);

    event SwapExecuted(
        address tokenIn,
        address tokenOut,
        uint256 fee,
        uint256 amountIn,
        uint256 amountOut
    );

    event ArbitrageProfitable(uint256 repayAmount, uint256 actualAmountOut);

    struct BorrowDetail {
        address caller;
        address borrowToken;
        uint256 amountIn;
    }

    struct SwapDetail {
        address routerAddress;
        address permit2Address; //Pancakeswap use a custome Permit2 contract
        address tokenIn;
        address tokenOut;
        uint24 fee;
    }
}
