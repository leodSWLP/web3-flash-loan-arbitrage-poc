//SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import './interfaces/IQuoter.sol';

contract ArbitrageQuoter {
    struct QuoterDetail {
        string dexName;
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
        string dexName;
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
        uint24 fee,
        string reason
    );
    error NoValidQuote(address tokenIn, address tokenOut, uint256 amountIn);

    function quoteBestRoute(
        uint256 initialAmount,
        SwapPath[] calldata swapPaths
    ) external view returns (OutputPath[] memory outputPaths) {
        outputPaths = new OutputPath[](swapPaths.length);
        uint256 currentAmount = initialAmount;

        for (uint256 i; i < swapPaths.length; ++i) {
            outputPaths[i] = _findBestQuote(currentAmount, swapPaths[i]);
            currentAmount = outputPaths[i].amountOut;
        }

        return outputPaths;
    }

    function _findBestQuote(
        uint256 amountIn,
        SwapPath memory path
    ) private view returns (OutputPath memory bestPath) {
        QuoterDetail[] memory quoters = abi.decode(
            path.quoterDetails,
            (QuoterDetail[])
        );
        uint256 bestAmountOut;

        for (uint256 i; i < quoters.length; ++i) {
            QuoterDetail memory quoter = quoters[i];
            (
                uint256 amountOut,
                uint160 sqrtPriceX96,
                uint32 ticksCrossed,
                uint256 gasEstimate
            ) = _quotePrice(
                    path.tokenIn,
                    path.tokenOut,
                    amountIn,
                    quoter.quoterAddress,
                    quoter.fee
                );

            if (amountOut > bestAmountOut) {
                bestPath = OutputPath({
                    dexName: quoter.dexName,
                    tokenIn: path.tokenIn,
                    tokenOut: path.tokenOut,
                    amountIn: amountIn,
                    amountOut: amountOut,
                    quoterAddress: quoter.quoterAddress,
                    routerAddress: quoter.routerAddress,
                    fee: quoter.fee,
                    sqrtPriceX96: sqrtPriceX96,
                    initializedTicksCrossed: ticksCrossed,
                    gasEstimate: gasEstimate
                });
                bestAmountOut = amountOut;
            }
        }

        if (bestAmountOut == 0) {
            revert NoValidQuote(path.tokenIn, path.tokenOut, amountIn);
        }
    }

    function _quotePrice(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address quoterAddress,
        uint24 fee
    )
        private
        view
        returns (
            uint256 amountOut,
            uint160 sqrtPriceX96,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        )
    {
        IQuoter.QuoteExactInputSingleParams memory params = IQuoter
            .QuoteExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                fee: fee,
                sqrtPriceLimitX96: 0
            });

        try IQuoter(quoterAddress).quoteExactInputSingle(params) returns (
            uint256 _amountOut,
            uint160 _sqrtPriceX96,
            uint32 _initializedTicksCrossed,
            uint256 _gasEstimate
        ) {
            return (
                _amountOut,
                _sqrtPriceX96,
                _initializedTicksCrossed,
                _gasEstimate
            );
        } catch Error(string memory reason) {
            revert QuoteFailed(quoterAddress, tokenIn, tokenOut, fee, reason);
        }
    }
}
