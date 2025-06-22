// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IQuoter {
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
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        );
}

contract MultiQuote {
    address public immutable QUOTER_ADDRESS;
    IQuoter private immutable quoter;

    struct QuoteResult {
        uint256 amountOut;
        uint160 sqrtPriceX96After;
        uint32 initializedTicksCrossed;
        uint256 gasEstimate;
    }

    constructor(address quoterAddress) {
        QUOTER_ADDRESS = quoterAddress;
        quoter = IQuoter(QUOTER_ADDRESS);
    }

    function quoteMultipleInputs(
        IQuoter.QuoteExactInputSingleParams[] memory params,
        uint256 initialAmountIn
    ) external view returns (QuoteResult[] memory results) {
        require(params.length > 0, 'Params array cannot be empty');

        results = new QuoteResult[](params.length);
        uint256 currentAmountIn = initialAmountIn;

        for (uint256 i = 0; i < params.length; i++) {
            IQuoter.QuoteExactInputSingleParams memory currentParams = params[
                i
            ];
            currentParams.amountIn = currentAmountIn;

            (
                uint256 amountOut,
                uint160 sqrtPriceX96After,
                uint32 initializedTicksCrossed,
                uint256 gasEstimate
            ) = quoter.quoteExactInputSingle(currentParams);

            results[i] = QuoteResult({
                amountOut: amountOut,
                sqrtPriceX96After: sqrtPriceX96After,
                initializedTicksCrossed: initializedTicksCrossed,
                gasEstimate: gasEstimate
            });

            currentAmountIn = amountOut; // Use previous output as next input
        }

        return results;
    }
}
