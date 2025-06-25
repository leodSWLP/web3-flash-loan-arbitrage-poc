// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.7.6;
pragma abicoder v2;

import {IUniswapV3Pool} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import {SwapMath} from '@uniswap/v3-core/contracts/libraries/SwapMath.sol';
import {FullMath} from '@uniswap/v3-core/contracts/libraries/FullMath.sol';
import {TickMath} from '@uniswap/v3-core/contracts/libraries/TickMath.sol';
import '@uniswap/v3-core/contracts/libraries/LowGasSafeMath.sol';
import '@uniswap/v3-core/contracts/libraries/SafeCast.sol';
import '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import {SqrtPriceMath} from '@uniswap/v3-core/contracts/libraries/SqrtPriceMath.sol';
import {LiquidityMath} from '@uniswap/v3-core/contracts/libraries/LiquidityMath.sol';
import {PoolTickBitmap} from '../libraries/PoolTickBitmap.sol';
import {IV3Quoter} from '../interfaces/IV3Quoter.sol';
import {PoolAddress} from '../libraries/PoolAddress.sol';
import {QuoterMath} from '../libraries/QuoterMath.sol';

contract V3Quoter is IV3Quoter {
    using QuoterMath for *;
    using LowGasSafeMath for uint256;
    using LowGasSafeMath for int256;
    using SafeCast for uint256;
    using SafeCast for int256;
    using Path for bytes;

    constructor() {}

    function getPool(
        address factory,
        address tokenA,
        address tokenB,
        uint24 fee
    ) private view returns (address pool) {
        pool = PoolAddress.computeAddress(
            factory,
            PoolAddress.getPoolKey(tokenA, tokenB, fee)
        );
    }

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
        IUniswapV3Pool pool = IUniswapV3Pool(params.pool);

        // we need to pack a few variables to get under the stack limit
        QuoterMath.QuoteParams memory quoteParams = QuoterMath.QuoteParams({
            zeroForOne: zeroForOne,
            fee: params.fee,
            sqrtPriceLimitX96: params.sqrtPriceLimitX96 == 0
                ? (
                    zeroForOne
                        ? TickMath.MIN_SQRT_RATIO + 1
                        : TickMath.MAX_SQRT_RATIO - 1
                )
                : params.sqrtPriceLimitX96,
            exactInput: false
        });

        (
            amount0,
            amount1,
            sqrtPriceX96After,
            initializedTicksCrossed
        ) = QuoterMath.quote(pool, params.amountIn.toInt256(), quoteParams);

        amountReceived = amount0 > 0 ? uint256(-amount1) : uint256(-amount0);
    }

    function quoteExactInputSingle(
        QuoteExactInputSingleParams memory params
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
        address pool = getPool(
            params.factory,
            params.tokenIn,
            params.tokenOut,
            params.fee
        );

        QuoteExactInputSingleWithPoolParams
            memory poolParams = QuoteExactInputSingleWithPoolParams({
                tokenIn: params.tokenIn,
                tokenOut: params.tokenOut,
                amountIn: params.amountIn,
                fee: params.fee,
                pool: pool,
                sqrtPriceLimitX96: 0
            });

        (
            amountReceived,
            sqrtPriceX96After,
            initializedTicksCrossed,

        ) = quoteExactInputSingleWithPool(poolParams);
    }
}
