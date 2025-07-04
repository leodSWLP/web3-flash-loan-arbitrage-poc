// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {SafeCast} from '@uniswap/v4-core/src/libraries/SafeCast.sol';
import {TickMath} from '@uniswap/v4-core/src/libraries/TickMath.sol';
import {IV4Quoter} from './interfaces/IV4Quoter.sol';
import {V4QuoterMath} from './libraries/V4QuoterMath.sol';

contract V4Quoter is IV4Quoter {
    using SafeCast for uint256;
    using SafeCast for int256;


    constructor() {}

    function quoteExactInputSingleWithPool(
        QuoteExactInputSingleWithPoolParams memory params
    )
        public
        view
        override
        returns (
            uint256 amountReceived,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        )
    {
        int256 amount0;
        int256 amount1;

        bool zeroForOne = params.tokenIn < params.tokenOut;
        // IUniswapV3Pool pool = IUniswapV3Pool(params.pool);

        // we need to pack a few variables to get under the stack limit
        V4QuoterMath.QuoteParams memory quoteParams = V4QuoterMath.QuoteParams({
            zeroForOne: zeroForOne,
            fee: params.fee,
            sqrtPriceLimitX96: params.sqrtPriceLimitX96 == 0
                ? (
                    zeroForOne
                        ? TickMath.MIN_SQRT_PRICE + 1
                        : TickMath.MAX_SQRT_PRICE - 1
                )
                : params.sqrtPriceLimitX96,
            exactInput: false
        });

        (
            amount0,
            amount1,
            sqrtPriceX96After,
            initializedTicksCrossed
        ) = V4QuoterMath.quote(
                params.dex,
                params.stateView,
                params.positionManager,
                params.poolId,
                params.amountIn.toInt256(),
                quoteParams
        );
    }
}
