//SPDX-License-Identifier: MIT
pragma solidity >=0.7.6 <=0.9.0;
pragma abicoder v2;

import '../../libraries/Dex.sol';

interface IV3Quoter {
    struct QuoteExactInputSingleParams {
        Dex dex;
        address factory;
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

    struct QuoteExactInputSingleWithPoolParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        Dex dex;
        address pool;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingleWithPool(
        QuoteExactInputSingleWithPoolParams memory params
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
