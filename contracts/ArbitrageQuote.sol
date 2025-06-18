//SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ArbitrageQuote {
    // Input structs
    struct QuoterDetail {
        address quoterAddress;
        uint24 fee;
    }

    struct SwapPath {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        QuoterDetail[] quoterDetails;
    }

    // Output struct for off-chain service
    struct OutputPath {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut; // Best output amount
        address quoterAddress; // Quoter providing the best price
        uint24 fee; // Fee tier of the best pool
        uint160 sqrtPriceX96; // Pool price after swap (for verification)
        uint32 initializedTicksCrossed; // Ticks crossed (for slippage checks)
    }

    error QuoteFailed(
        address quoter,
        address tokenIn,
        address tokenOut,
        uint24 fee
    );
    error NoValidQuote(address tokenIn, address tokenOut, uint256 amountIn);

    /**
     * @notice Quotes the best price for each swap path across multiple DEX quoters
     * @param swapPaths Array of swap paths with tokens, amounts, and quoters
     * @return outputPaths Array of optimal paths with best quotes for off-chain execution
     */
    function quoteBestRoute(
        SwapPath[] memory swapPaths
    ) external view returns (OutputPath[] memory outputPaths) {
        outputPaths = new OutputPath[](swapPaths.length);

        for (uint256 i = 0; i < swapPaths.length; i++) {
            SwapPath memory path = swapPaths[i];
            uint256 bestAmountOut = 0;
            address bestQuoter = address(0);
            uint24 bestFee = 0;
            uint160 bestSqrtPriceX96 = 0;
            uint32 bestTicksCrossed = 0;

            for (uint256 j = 0; j < path.quoterDetails.length; j++) {
                QuoterDetail memory quoter = path.quoterDetails[j];
                (
                    uint256 amountOut,
                    uint160 sqrtPriceX96,
                    uint32 ticksCrossed
                ) = _quotePrice(
                        path.tokenIn,
                        path.tokenOut,
                        path.amountIn,
                        quoter.quoterAddress,
                        quoter.fee
                    );

                // Update best quote if amountOut is higher
                if (amountOut > bestAmountOut) {
                    bestAmountOut = amountOut;
                    bestQuoter = quoter.quoterAddress;
                    bestFee = quoter.fee;
                    bestSqrtPriceX96 = sqrtPriceX96;
                    bestTicksCrossed = ticksCrossed;
                }
            }

            if (bestAmountOut == 0) {
                revert NoValidQuote(path.tokenIn, path.tokenOut, path.amountIn);
            }

            outputPaths[i] = OutputPath({
                tokenIn: path.tokenIn,
                tokenOut: path.tokenOut,
                amountIn: path.amountIn,
                amountOut: bestAmountOut,
                quoterAddress: bestQuoter,
                fee: bestFee,
                sqrtPriceX96: bestSqrtPriceX96,
                initializedTicksCrossed: bestTicksCrossed
            });
        }

        return outputPaths;
    }

    /**
     * @notice Quotes the price for a single swap using a specific quoter
     * @param tokenIn Input token
     * @param tokenOut Output token
     * @param amountIn Input amount
     * @param quoterAddress Address of the quoter contract
     * @param fee Pool fee tier
     * @return amountOut Output amount quoted
     * @return sqrtPriceX96 Pool price after swap
     * @return initializedTicksCrossed Number of ticks crossed
     */
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
            uint32 initializedTicksCrossed
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
            uint256 /* gasEstimate */
        ) {
            amountOut = _amountOut;
            sqrtPriceX96 = _sqrtPriceX96;
            initializedTicksCrossed = _initializedTicksCrossed;
        } catch {
            revert QuoteFailed(quoterAddress, tokenIn, tokenOut, fee);
        }
    }
}

interface IQuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(
        QuoteExactInputSingleParams memory params
    )
        external
        view
        returns (
            uint256 amountOut,
            uint160 sqrtPriceX96,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        );
}
