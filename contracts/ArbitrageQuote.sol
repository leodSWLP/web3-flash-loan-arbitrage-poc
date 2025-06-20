//SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import './interfaces/IQuoterV2.sol';

contract ArbitrageQuote {
    struct QuoterDetail {
        //todo add enum or string to indicate it is belong to which DEX
        address quoterAddress;
        address routerAddress;
        uint24 fee;
    }

    struct SwapPath {
        address tokenIn;
        address tokenOut;
        bytes quoterDetails; 
    }

    struct OutputPath {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        address quoterAddress;
        address routerAddress;
        uint24 fee;
        uint160 sqrtPriceX96;
        uint32 initializedTicksCrossed;
        uint256 gasEstimate;
    }

    error QuoteFailed(
        address quoter,
        address tokenIn,
        address tokenOut,
        uint24 fee
    );
    error NoValidQuote(address tokenIn, address tokenOut, uint256 amountIn);

    function quoteBestRoute(
        uint256 initalAmount,
        SwapPath[] calldata swapPaths
    ) external view returns (OutputPath[] memory outputPaths) {
        outputPaths = new OutputPath[](swapPaths.length);
        uint256 currentAmount = initalAmount;

        for (uint256 i = 0; i < swapPaths.length; i++) {
            SwapPath memory path = swapPaths[i];
            OutputPath memory bestPath = _findBestQuote(currentAmount, path);
            outputPaths[i] = bestPath;
            currentAmount = bestPath.amountOut;
        }

        return outputPaths;
    }

    function _findBestQuote(
        uint256 amountIn,
        SwapPath memory swapPath
    ) internal view returns (OutputPath memory bestPath) {
        uint256 bestAmountOut = 0;
        QuoterDetail[] memory quoterDetails = abi.decode(swapPath.quoterDetails, (QuoterDetail[]));

        for (uint8 i = 0; i < quoterDetails.length; i++) {
            QuoterDetail memory quoter = quoterDetails[i];
            (
                uint256 amountOut,
                uint160 sqrtPriceX96,
                uint32 ticksCrossed,
                uint256 gasEstimate
            ) = _quotePrice(
                    swapPath.tokenIn,
                    swapPath.tokenOut,
                    amountIn,
                    quoter.quoterAddress,
                    quoter.fee
                );

            if (amountOut > bestAmountOut) {
                bestPath.tokenIn = swapPath.tokenIn;
                bestPath.tokenOut = swapPath.tokenOut;
                bestPath.amountIn = amountIn;
                bestPath.amountOut = bestAmountOut;
                bestPath.quoterAddress = quoter.quoterAddress;
                bestPath.routerAddress = quoter.routerAddress;
                bestPath.fee = quoter.fee;
                bestPath.sqrtPriceX96 = sqrtPriceX96;
                bestPath.initializedTicksCrossed = ticksCrossed;
                bestPath.gasEstimate = gasEstimate;
            }
        }

        if (bestAmountOut == 0) {
            revert NoValidQuote(swapPath.tokenIn, swapPath.tokenOut, amountIn);
        }
    }

    function _quotePrice(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address quoterAddress,
        uint24 fee
    )
        internal
        view
        returns (
            uint256 amountOut,
            uint160 sqrtPriceX96,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        )
    {
        IQuoterV2.QuoteExactInputSingleParams memory params = IQuoterV2
            .QuoteExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                fee: fee,
                sqrtPriceLimitX96: 0
            });

        try IQuoterV2(quoterAddress).quoteExactInputSingle(params) returns (
            uint256 _amountOut,
            uint160 _sqrtPriceX96,
            uint32 _initializedTicksCrossed,
            uint256 _gasEstimate
        ) {
            amountOut = _amountOut;
            sqrtPriceX96 = _sqrtPriceX96;
            initializedTicksCrossed = _initializedTicksCrossed;
            gasEstimate = _gasEstimate;
        } catch {
            revert QuoteFailed(quoterAddress, tokenIn, tokenOut, fee);
        }
    }
}
