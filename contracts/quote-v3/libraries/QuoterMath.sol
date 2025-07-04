// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.7.6;
pragma abicoder v2;

import {
    IUniswapV3Pool
} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import {IPancakeV3Pool} from '../interfaces/IPancakeV3Pool.sol';
import {SwapMath} from '@uniswap/v3-core/contracts/libraries/SwapMath.sol';
import {FullMath} from '@uniswap/v3-core/contracts/libraries/FullMath.sol';
import {TickMath} from '@uniswap/v3-core/contracts/libraries/TickMath.sol';
import '@uniswap/v3-core/contracts/libraries/LowGasSafeMath.sol';
import '@uniswap/v3-core/contracts/libraries/SafeCast.sol';
import '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import {
    SqrtPriceMath
} from '@uniswap/v3-core/contracts/libraries/SqrtPriceMath.sol';
import {
    LiquidityMath
} from '@uniswap/v3-core/contracts/libraries/LiquidityMath.sol';
import {PoolTickBitmap} from '../../libraries/PoolTickBitmap.sol';
import '../../libraries/Dex.sol';

library QuoterMath {
    using LowGasSafeMath for uint256;
    using LowGasSafeMath for int256;
    using SafeCast for uint256;
    using SafeCast for int256;

    struct Slot0 {
        // the current price
        uint160 sqrtPriceX96;
        // the current tick
        int24 tick;
        // tick spacing
        int24 tickSpacing;
    }

    // used for packing under the stack limit
    struct QuoteParams {
        bool zeroForOne;
        bool exactInput;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function fillSlot0(
        Dex dex,
        address pool
    ) private view returns (Slot0 memory slot0) {
        if (dex == Dex.PancakeSwap) {
            IPancakeV3Pool pancakeV3pool = IPancakeV3Pool(pool);
            (slot0.sqrtPriceX96, slot0.tick, , , , , ) = pancakeV3pool.slot0();
            slot0.tickSpacing = pancakeV3pool.tickSpacing();
        } else if (dex == Dex.Uniswap) {
            IUniswapV3Pool uniswapPool = IUniswapV3Pool(pool);
            (slot0.sqrtPriceX96, slot0.tick, , , , , ) = uniswapPool.slot0();
            slot0.tickSpacing = uniswapPool.tickSpacing();
        }
        return slot0;
    }

    function getLiquidity(
        Dex dex,
        address pool
    ) private view returns (uint128 liquidity) {
        if (dex == Dex.PancakeSwap) {
            liquidity = IPancakeV3Pool(pool).liquidity();
        } else if (dex == Dex.Uniswap) {
            liquidity = IUniswapV3Pool(pool).liquidity();
        }
        return liquidity;
    }

    function getTicks(
        Dex dex,
        address pool,
        int24 tickNext
    )
        private
        view
        returns (
            uint128 liquidityGross,
            int128 liquidityNet,
            uint256 feeGrowthOutside0X128,
            uint256 feeGrowthOutside1X128,
            int56 tickCumulativeOutside,
            uint160 secondsPerLiquidityOutsideX128,
            uint32 secondsOutside,
            bool initialized
        )
    {
        if (dex == Dex.PancakeSwap) {
            (
                liquidityGross,
                liquidityNet,
                feeGrowthOutside0X128,
                feeGrowthOutside1X128,
                tickCumulativeOutside,
                secondsPerLiquidityOutsideX128,
                secondsOutside,
                initialized
            ) = IPancakeV3Pool(pool).ticks(tickNext);
        } else if (dex == Dex.Uniswap) {
            (
                liquidityGross,
                liquidityNet,
                feeGrowthOutside0X128,
                feeGrowthOutside1X128,
                tickCumulativeOutside,
                secondsPerLiquidityOutsideX128,
                secondsOutside,
                initialized
            ) = IUniswapV3Pool(pool).ticks(tickNext);
        }
    }

    struct SwapCache {
        // the protocol fee for the input token
        uint8 feeProtocol;
        // liquidity at the beginning of the swap
        uint128 liquidityStart;
        // the timestamp of the current block
        uint32 blockTimestamp;
        // the current value of the tick accumulator, computed only if we cross an initialized tick
        int56 tickCumulative;
        // the current value of seconds per liquidity accumulator, computed only if we cross an initialized tick
        uint160 secondsPerLiquidityCumulativeX128;
        // whether we've computed and cached the above two accumulators
        bool computedLatestObservation;
    }

    // the top level state of the swap, the results of which are recorded in storage at the end
    struct SwapState {
        // the amount remaining to be swapped in/out of the input/output asset
        int256 amountSpecifiedRemaining;
        // the amount already swapped out/in of the output/input asset
        int256 amountCalculated;
        // current sqrt(price)
        uint160 sqrtPriceX96;
        // the tick associated with the current price
        int24 tick;
        // the global fee growth of the input token
        uint256 feeGrowthGlobalX128;
        // amount of input token paid as protocol fee
        uint128 protocolFee;
        // the current liquidity in range
        uint128 liquidity;
    }

    struct StepComputations {
        // the price at the beginning of the step
        uint160 sqrtPriceStartX96;
        // the next tick to swap to from the current tick in the swap direction
        int24 tickNext;
        // whether tickNext is initialized or not
        bool initialized;
        // sqrt(price) for the next tick (1/0)
        uint160 sqrtPriceNextX96;
        // how much is being swapped in in this step
        uint256 amountIn;
        // how much is being swapped out
        uint256 amountOut;
        // how much fee is being paid in
        uint256 feeAmount;
    }

    /// @notice Utility function called by the quote functions to
    /// calculate the amounts in/out for a v3 swap
    /// @param dex the Dex enum
    /// @param poolAddress the Uniswap v3 / PancakeSwap v3 pool address
    /// @param amount the input amount calculated
    /// @param quoteParams a packed dataset of flags/inputs used to get around stack limit
    /// @return amount0 the amount of token0 sent in or out of the pool
    /// @return amount1 the amount of token1 sent in or out of the pool
    /// @return sqrtPriceAfterX96 the price of the pool after the swap
    /// @return initializedTicksCrossed the number of initialized ticks LOADED IN
    function quote(
        Dex dex,
        address poolAddress,
        int256 amount,
        QuoteParams memory quoteParams
    )
        internal
        view
        returns (
            int256 amount0,
            int256 amount1,
            uint160 sqrtPriceAfterX96,
            uint32 initializedTicksCrossed
        )
    {
        quoteParams.exactInput = amount > 0;
        initializedTicksCrossed = 1;

        Slot0 memory slot0 = fillSlot0(dex, poolAddress);
        IUniswapV3Pool pool = IUniswapV3Pool(poolAddress);

        SwapState memory state = SwapState({
            amountSpecifiedRemaining: amount,
            amountCalculated: 0,
            sqrtPriceX96: slot0.sqrtPriceX96,
            tick: slot0.tick,
            feeGrowthGlobalX128: 0,
            protocolFee: 0,
            liquidity: getLiquidity(dex, poolAddress)
        });

        while (
            state.amountSpecifiedRemaining != 0 &&
            state.sqrtPriceX96 != quoteParams.sqrtPriceLimitX96
        ) {
            StepComputations memory step;

            step.sqrtPriceStartX96 = state.sqrtPriceX96;

            (step.tickNext, step.initialized) = PoolTickBitmap
                .nextInitializedTickWithinOneWord(
                    pool,
                    slot0.tickSpacing,
                    state.tick,
                    quoteParams.zeroForOne
                );

            // ensure that we do not overshoot the min/max tick, as the tick bitmap is not aware of these bounds
            if (step.tickNext < TickMath.MIN_TICK) {
                step.tickNext = TickMath.MIN_TICK;
            } else if (step.tickNext > TickMath.MAX_TICK) {
                step.tickNext = TickMath.MAX_TICK;
            }

            // get the price for the next tick
            step.sqrtPriceNextX96 = TickMath.getSqrtRatioAtTick(step.tickNext);

            // compute values to swap to the target tick, price limit, or point where input/output amount is exhausted
            (
                state.sqrtPriceX96,
                step.amountIn,
                step.amountOut,
                step.feeAmount
            ) = SwapMath.computeSwapStep(
                state.sqrtPriceX96,
                (
                    quoteParams.zeroForOne
                        ? step.sqrtPriceNextX96 < quoteParams.sqrtPriceLimitX96
                        : step.sqrtPriceNextX96 > quoteParams.sqrtPriceLimitX96
                )
                    ? quoteParams.sqrtPriceLimitX96
                    : step.sqrtPriceNextX96,
                state.liquidity,
                state.amountSpecifiedRemaining,
                quoteParams.fee
            );

            if (quoteParams.exactInput) {
                state.amountSpecifiedRemaining -= (step.amountIn +
                    step.feeAmount).toInt256();
                state.amountCalculated = state.amountCalculated.sub(
                    step.amountOut.toInt256()
                );
            } else {
                state.amountSpecifiedRemaining += step.amountOut.toInt256();
                state.amountCalculated = state.amountCalculated.add(
                    (step.amountIn + step.feeAmount).toInt256()
                );
            }

            // shift tick if we reached the next price
            if (state.sqrtPriceX96 == step.sqrtPriceNextX96) {
                // if the tick is initialized, run the tick transition
                if (step.initialized) {
                    (, int128 liquidityNet, , , , , , ) = getTicks(
                        dex,
                        poolAddress,
                        step.tickNext
                    );

                    // if we're moving leftward, we interpret liquidityNet as the opposite sign
                    // safe because liquidityNet cannot be type(int128).min
                    if (quoteParams.zeroForOne) liquidityNet = -liquidityNet;

                    state.liquidity = LiquidityMath.addDelta(
                        state.liquidity,
                        liquidityNet
                    );

                    initializedTicksCrossed++;
                }

                state.tick = quoteParams.zeroForOne
                    ? step.tickNext - 1
                    : step.tickNext;
            } else if (state.sqrtPriceX96 != step.sqrtPriceStartX96) {
                // recompute unless we're on a lower tick boundary (i.e. already transitioned ticks), and haven't moved
                state.tick = TickMath.getTickAtSqrtRatio(state.sqrtPriceX96);
            }
        }

        (amount0, amount1) = quoteParams.zeroForOne == quoteParams.exactInput
            ? (amount - state.amountSpecifiedRemaining, state.amountCalculated)
            : (state.amountCalculated, amount - state.amountSpecifiedRemaining);

        sqrtPriceAfterX96 = state.sqrtPriceX96;
    }
}
