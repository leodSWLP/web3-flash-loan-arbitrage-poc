// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {SwapMath} from '@uniswap/v4-core/src/libraries/SwapMath.sol';
import {FullMath} from '@uniswap/v4-core/src/libraries/FullMath.sol';
import {TickMath} from '@uniswap/v4-core/src/libraries/TickMath.sol';
import {SafeCast} from '@uniswap/v4-core/src/libraries/SafeCast.sol';
import {SqrtPriceMath} from '@uniswap/v4-core/src/libraries/SqrtPriceMath.sol';
import {LiquidityMath} from '@uniswap/v4-core/src/libraries/LiquidityMath.sol';
import {PoolId} from '@uniswap/v4-core/src/types/PoolId.sol';
import {TickBitmap} from './TickBitmap.sol';
import {Dex} from '../../libraries/Dex.sol';
import {ICLPoolManager} from '../../pancake-v4/interfaces/ICLPoolManager.sol';
import {IStateView} from '../interfaces/IStateView.sol';
import {IPositionManager} from '../interfaces/IPositionManager.sol';
import {ICommonPoolManager} from '../interfaces/ICommonPoolManager.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';

library V4QuoterMath {
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

    function toBytes25(bytes32 input) internal pure returns (bytes25) {
        bytes25 result;
        assembly {
            // Copy the first 25 bytes of input to result
            // Since bytes32 is 32 bytes, we take the first 25 bytes
            result := input
            // Note: In assembly, assigning bytes32 to bytes25 truncates to the first 25 bytes
        }
        return result;
    }

    function getPancakeTickSpacing(
        bytes32 params
    ) internal pure returns (int24 tickSpacing) {
        uint32 offsetTickSpacing = 16;
        uint256 maskUint24 = 0xffffff;
        assembly ('memory-safe') {
            tickSpacing := and(shr(offsetTickSpacing, params), maskUint24)
        }
    }

    function fillSlot0(
        Dex dex,
        address stateView,
        address positionManager,
        bytes32 poolId
    ) private view returns (Slot0 memory slot0) {
        if (dex == Dex.PancakeSwap) {
            ICLPoolManager pancakePoolManager = ICLPoolManager(stateView);
            (slot0.sqrtPriceX96, slot0.tick, , ) = pancakePoolManager.getSlot0(
                poolId
            );

            (, , , , , bytes32 parameters) = pancakePoolManager.poolIdToPoolKey(
                poolId
            );
            slot0.tickSpacing = getPancakeTickSpacing(parameters);
        } else if (dex == Dex.Uniswap) {
            IStateView uniswapStateView = IStateView(stateView);
            (slot0.sqrtPriceX96, slot0.tick, , ) = uniswapStateView.getSlot0(
                poolId
            );
            PoolKey memory poolKey = IPositionManager(positionManager).poolKeys(
                toBytes25(poolId)
            );

            slot0.tickSpacing = poolKey.tickSpacing;
        }
        return slot0;
    }

    function getLiquidity(
        Dex dex,
        address stateView,
        bytes32 poolId
    ) private view returns (uint128 liquidity) {
        if (dex == Dex.PancakeSwap) {
            liquidity = ICLPoolManager(stateView).getLiquidity(poolId);
        } else if (dex == Dex.Uniswap) {
            liquidity = IStateView(stateView).getLiquidity(poolId);
        }
        return liquidity;
    }

    function getTicks(
        Dex dex,
        address stateView,
        bytes32 poolId,
        int24 tickNext
    )
        private
        view
        returns (
            uint128 liquidityGross,
            int128 liquidityNet,
            uint256 feeGrowthOutside0X128,
            uint256 feeGrowthOutside1X128
        )
    {
        if (dex == Dex.PancakeSwap) {
            ICLPoolManager.TickInfo memory tickInfo = ICLPoolManager(stateView)
                .getPoolTickInfo(poolId, tickNext);
            liquidityGross = tickInfo.liquidityGross;
            liquidityNet = tickInfo.liquidityNet;
            feeGrowthOutside0X128 = tickInfo.feeGrowthOutside0X128;
            feeGrowthOutside1X128 = tickInfo.feeGrowthOutside1X128;
        } else if (dex == Dex.Uniswap) {
            (
                liquidityGross,
                liquidityNet,
                feeGrowthOutside0X128,
                feeGrowthOutside1X128
            ) = IStateView(stateView).getTickInfo(poolId, tickNext);
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
    /// @param poolId the Uniswap v4 / PancakeSwap v4 pool id
    /// @param amount the input amount calculated
    /// @param quoteParams a packed dataset of flags/inputs used to get around stack limit
    /// @return amount0 the amount of token0 sent in or out of the pool
    /// @return amount1 the amount of token1 sent in or out of the pool
    /// @return sqrtPriceAfterX96 the price of the pool after the swap
    /// @return initializedTicksCrossed the number of initialized ticks LOADED IN
    function quote(
        Dex dex,
        address stateView,
        address positionManager,
        bytes32 poolId,
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

        Slot0 memory slot0 = fillSlot0(dex, stateView, positionManager, poolId);

        SwapState memory state = SwapState({
            amountSpecifiedRemaining: amount,
            amountCalculated: 0,
            sqrtPriceX96: slot0.sqrtPriceX96,
            tick: slot0.tick,
            feeGrowthGlobalX128: 0,
            protocolFee: 0,
            liquidity: getLiquidity(dex, stateView, poolId)
        });

        while (
            state.amountSpecifiedRemaining != 0 &&
            state.sqrtPriceX96 != quoteParams.sqrtPriceLimitX96
        ) {
            StepComputations memory step;

            step.sqrtPriceStartX96 = state.sqrtPriceX96;

            (step.tickNext, step.initialized) = TickBitmap
                .nextInitializedTickWithinOneWord(
                    dex,
                    stateView,
                    poolId,
                    state.tick,
                    slot0.tickSpacing,
                    quoteParams.zeroForOne
                );

            // ensure that we do not overshoot the min/max tick, as the tick bitmap is not aware of these bounds
            if (step.tickNext < TickMath.MIN_TICK) {
                step.tickNext = TickMath.MIN_TICK;
            } else if (step.tickNext > TickMath.MAX_TICK) {
                step.tickNext = TickMath.MAX_TICK;
            }

            // get the price for the next tick
            step.sqrtPriceNextX96 = TickMath.getSqrtPriceAtTick(step.tickNext);

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
                state.amountCalculated -= step.amountOut.toInt256();
            } else {
                state.amountSpecifiedRemaining += step.amountOut.toInt256();
                state.amountCalculated += (step.amountIn + step.feeAmount)
                    .toInt256();
            }

            // shift tick if we reached the next price
            if (state.sqrtPriceX96 == step.sqrtPriceNextX96) {
                // if the tick is initialized, run the tick transition
                if (step.initialized) {
                    (, int128 liquidityNet, , ) = getTicks(
                        dex,
                        stateView,
                        poolId,
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
                state.tick = TickMath.getTickAtSqrtPrice(state.sqrtPriceX96);
            }
        }

        (amount0, amount1) = quoteParams.zeroForOne == quoteParams.exactInput
            ? (amount - state.amountSpecifiedRemaining, state.amountCalculated)
            : (state.amountCalculated, amount - state.amountSpecifiedRemaining);

        sqrtPriceAfterX96 = state.sqrtPriceX96;
    }
}
