// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

import {SafeCast} from './libraries/SafeCast.sol';
import {TickBitmap} from './libraries/TickBitmap.sol';
// import {Position} from './libraries/Position.sol';
import {UnsafeMath} from './libraries/UnsafeMath.sol';
import {FixedPoint128} from './libraries/FixedPoint128.sol';
import {TickMath} from './libraries/TickMath.sol';
import {BitMath} from './libraries/BitMath.sol';
import {SqrtPriceMath} from './libraries/SqrtPriceMath.sol';
import {SwapMath} from './libraries/SwapMath.sol';
import {BalanceDelta, toBalanceDelta, BalanceDeltaLibrary} from './types/BalanceDelta.sol';
import {Slot0} from './types/Slot0.sol';
import {ProtocolFeeLibrary} from './libraries/ProtocolFeeLibrary.sol';
import {LiquidityMath} from './libraries/LiquidityMath.sol';
import {LPFeeLibrary} from './libraries/LPFeeLibrary.sol';
import {CustomRevert} from './libraries/CustomRevert.sol';

abstract contract V4QuoteMath {
    using SafeCast for *;
    using ProtocolFeeLibrary for *;
    using LPFeeLibrary for uint24;
    using CustomRevert for bytes4;

    /// @notice Thrown when tickLower is not below tickUpper
    /// @param tickLower The invalid tickLower
    /// @param tickUpper The invalid tickUpper
    error TicksMisordered(int24 tickLower, int24 tickUpper);

    /// @notice Thrown when tickLower is less than min tick
    /// @param tickLower The invalid tickLower
    error TickLowerOutOfBounds(int24 tickLower);

    /// @notice Thrown when tickUpper exceeds max tick
    /// @param tickUpper The invalid tickUpper
    error TickUpperOutOfBounds(int24 tickUpper);

    /// @notice For the tick spacing, the tick has too much liquidity
    error TickLiquidityOverflow(int24 tick);

    /// @notice Thrown when trying to initialize an already initialized pool
    error PoolAlreadyInitialized();

    /// @notice Thrown when trying to interact with a non-initialized pool
    error PoolNotInitialized();

    /// @notice Thrown when sqrtPriceLimitX96 on a swap has already exceeded its limit
    /// @param sqrtPriceCurrentX96 The invalid, already surpassed sqrtPriceLimitX96
    /// @param sqrtPriceLimitX96 The surpassed price limit
    error PriceLimitAlreadyExceeded(
        uint160 sqrtPriceCurrentX96,
        uint160 sqrtPriceLimitX96
    );

    /// @notice Thrown when sqrtPriceLimitX96 lies outside of valid tick/price range
    /// @param sqrtPriceLimitX96 The invalid, out-of-bounds sqrtPriceLimitX96
    error PriceLimitOutOfBounds(uint160 sqrtPriceLimitX96);

    /// @notice Thrown by donate if there is currently 0 liquidity, since the fees will not go to any liquidity providers
    error NoLiquidityToReceiveFees();

    /// @notice Thrown when trying to swap with max lp fee and specifying an output amount
    error InvalidFeeForExactOut();

    // info stored for each initialized individual tick
    struct TickInfo {
        // the total position liquidity that references this tick
        uint128 liquidityGross;
        // amount of net liquidity added (subtracted) when tick is crossed from left to right (right to left),
        int128 liquidityNet;
        // fee growth per unit of liquidity on the _other_ side of this tick (relative to the current tick)
        // only has relative meaning, not absolute — the value depends on when the tick is initialized
        uint256 feeGrowthOutside0X128;
        uint256 feeGrowthOutside1X128;
    }

    struct State {
        Slot0 slot0;
        uint256 feeGrowthGlobal0X128;
        uint256 feeGrowthGlobal1X128;
        uint128 liquidity;
        // mapping(int24 tick => TickInfo) ticks;
        // mapping(int16 wordPos => uint256) tickBitmap;
        // mapping(bytes32 positionKey => Position.State) positions;
    }

    struct SwapParams {
        /// The desired input amount if negative (exactIn), or the desired output amount if positive (exactOut)
        int256 amountSpecified;
        int24 tickSpacing;
        /// Whether to swap token0 for token1 or vice versa
        bool zeroForOne;
        uint160 sqrtPriceLimitX96;
        uint24 lpFeeOverride;
    }

    struct SwapResult {
        // the current sqrt(price)
        uint160 sqrtPriceX96;
        // the tick associated with the current price
        int24 tick;
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
        // the global fee growth of the input token. updated in storage at the end of swap
        uint256 feeGrowthGlobalX128;
    }

    function getFeeGrowthGlobals(
        bytes32 poolId
    )
        public
        view
        virtual
        returns (uint256 feeGrowthGlobal0, uint256 feeGrowthGlobal1);

    function getLiquidity(
        bytes32 poolId
    ) public view virtual returns (uint128 liquidity);

    function getTickBitmap(
        bytes32 poolId,
        int16 tick
    ) public view virtual returns (uint256 tickBitmap);

    function getTickInfo(
        bytes32 poolId,
        int24 tick
    )
        public
        view
        virtual
        returns (
            uint128 liquidityGross,
            int128 liquidityNet,
            uint256 feeGrowthOutside0X128,
            uint256 feeGrowthOutside1X128
        );

    function getSlot0(
        bytes32 poolId
    )
        public
        view
        virtual
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint24 protocolFee,
            uint24 lpFee
        );

    function getPackedSlot0(bytes32 poolId) public view returns (Slot0 slot0) {
        (
            uint160 sqrtPriceX96,
            int24 tick,
            uint24 protocolFee,
            uint24 lpFee
        ) = getSlot0(poolId);

        assembly ('memory-safe') {
            // Initialize slot0 as 0
            slot0 := 0
            // Pack lpFee (bits 208–231)
            slot0 := or(slot0, shl(208, and(lpFee, 0xFFFFFF)))
            // Pack protocolFee (bits 184–207)
            slot0 := or(slot0, shl(184, and(protocolFee, 0xFFFFFF)))
            // Pack tick (bits 160–183)
            slot0 := or(slot0, shl(160, and(tick, 0xFFFFFF)))
            // Pack sqrtPriceX96 (bits 0–159)
            slot0 := or(
                slot0,
                and(sqrtPriceX96, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            )
        }
    }

    /// @notice Executes a swap against the state, and returns the amount deltas of the pool
    /// @dev PoolManager checks that the pool is initialized before calling
    function swap(
        bytes32 poolId,
        SwapParams memory params
    )
        internal
        view
        returns (
            BalanceDelta swapDelta,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            SwapResult memory result
        )
    {
        Slot0 slot0Start = getPackedSlot0(poolId);
        bool zeroForOne = params.zeroForOne;

        uint256 amountToProtocol;
        uint24 swapFee;
        (
            uint256 feeGrowthGlobal0,
            uint256 feeGrowthGlobal1
        ) = getFeeGrowthGlobals(poolId);

        uint256 protocolFee = zeroForOne
            ? slot0Start.protocolFee().getZeroForOneFee()
            : slot0Start.protocolFee().getOneForZeroFee();

        // the amount remaining to be swapped in/out of the input/output asset. initially set to the amountSpecified
        int256 amountSpecifiedRemaining = params.amountSpecified;
        // the amount swapped out/in of the output/input asset. initially set to 0
        int256 amountCalculated = 0;
        // initialize to the current sqrt(price)
        result.sqrtPriceX96 = slot0Start.sqrtPriceX96();
        // initialize to the current tick
        result.tick = slot0Start.tick();
        // initialize to the current liquidity
        result.liquidity = getLiquidity(poolId);

        // if the beforeSwap hook returned a valid fee override, use that as the LP fee, otherwise load from storage
        // lpFee, swapFee, and protocolFee are all in pips
        {
            uint24 lpFee = params.lpFeeOverride.isOverride()
                ? params.lpFeeOverride.removeOverrideFlagAndValidate()
                : slot0Start.lpFee();

            swapFee = protocolFee == 0
                ? lpFee
                : uint16(protocolFee).calculateSwapFee(lpFee);
        }

        // a swap fee totaling MAX_SWAP_FEE (100%) makes exact output swaps impossible since the input is entirely consumed by the fee
        if (swapFee >= SwapMath.MAX_SWAP_FEE) {
            // if exactOutput
            if (params.amountSpecified > 0) {
                InvalidFeeForExactOut.selector.revertWith();
            }
        }

        // swapFee is the pool's fee in pips (LP fee + protocol fee)
        // when the amount swapped is 0, there is no protocolFee applied and the fee amount paid to the protocol is set to 0
        if (params.amountSpecified == 0)
            return (BalanceDeltaLibrary.ZERO_DELTA, 0, 0, result);

        if (zeroForOne) {
            if (params.sqrtPriceLimitX96 >= slot0Start.sqrtPriceX96()) {
                PriceLimitAlreadyExceeded.selector.revertWith(
                    slot0Start.sqrtPriceX96(),
                    params.sqrtPriceLimitX96
                );
            }
            // Swaps can never occur at MIN_TICK, only at MIN_TICK + 1, except at initialization of a pool
            // Under certain circumstances outlined below, the tick will preemptively reach MIN_TICK without swapping there
            if (params.sqrtPriceLimitX96 <= TickMath.MIN_SQRT_PRICE) {
                PriceLimitOutOfBounds.selector.revertWith(
                    params.sqrtPriceLimitX96
                );
            }
        } else {
            if (params.sqrtPriceLimitX96 <= slot0Start.sqrtPriceX96()) {
                PriceLimitAlreadyExceeded.selector.revertWith(
                    slot0Start.sqrtPriceX96(),
                    params.sqrtPriceLimitX96
                );
            }
            if (params.sqrtPriceLimitX96 >= TickMath.MAX_SQRT_PRICE) {
                PriceLimitOutOfBounds.selector.revertWith(
                    params.sqrtPriceLimitX96
                );
            }
        }

        StepComputations memory step;
        step.feeGrowthGlobalX128 = zeroForOne
            ? feeGrowthGlobal0
            : feeGrowthGlobal1;

        // continue swapping as long as we haven't used the entire input/output and haven't reached the price limit
        while (
            !(amountSpecifiedRemaining == 0 ||
                result.sqrtPriceX96 == params.sqrtPriceLimitX96)
        ) {
            step.sqrtPriceStartX96 = result.sqrtPriceX96;

            (
                step.tickNext,
                step.initialized
            ) = nextInitializedTickWithinOneWord(
                poolId,
                result.tick,
                params.tickSpacing,
                zeroForOne
            );

            // ensure that we do not overshoot the min/max tick, as the tick bitmap is not aware of these bounds
            if (step.tickNext <= TickMath.MIN_TICK) {
                step.tickNext = TickMath.MIN_TICK;
            }
            if (step.tickNext >= TickMath.MAX_TICK) {
                step.tickNext = TickMath.MAX_TICK;
            }

            // get the price for the next tick
            step.sqrtPriceNextX96 = TickMath.getSqrtPriceAtTick(step.tickNext);

            // compute values to swap to the target tick, price limit, or point where input/output amount is exhausted
            (
                result.sqrtPriceX96,
                step.amountIn,
                step.amountOut,
                step.feeAmount
            ) = SwapMath.computeSwapStep(
                result.sqrtPriceX96,
                SwapMath.getSqrtPriceTarget(
                    zeroForOne,
                    step.sqrtPriceNextX96,
                    params.sqrtPriceLimitX96
                ),
                result.liquidity,
                amountSpecifiedRemaining,
                swapFee
            );

            // if exactOutput
            if (params.amountSpecified > 0) {
                unchecked {
                    amountSpecifiedRemaining -= step.amountOut.toInt256();
                }
                amountCalculated -= (step.amountIn + step.feeAmount).toInt256();
            } else {
                // safe because we test that amountSpecified > amountIn + feeAmount in SwapMath
                unchecked {
                    amountSpecifiedRemaining += (step.amountIn + step.feeAmount)
                        .toInt256();
                }
                amountCalculated += step.amountOut.toInt256();
            }

            // if the protocol fee is on, calculate how much is owed, decrement feeAmount, and increment protocolFee
            if (protocolFee > 0) {
                unchecked {
                    // step.amountIn does not include the swap fee, as it's already been taken from it,
                    // so add it back to get the total amountIn and use that to calculate the amount of fees owed to the protocol
                    // cannot overflow due to limits on the size of protocolFee and params.amountSpecified
                    // this rounds down to favor LPs over the protocol
                    uint256 delta = (swapFee == protocolFee)
                        ? step.feeAmount // lp fee is 0, so the entire fee is owed to the protocol instead
                        : ((step.amountIn + step.feeAmount) * protocolFee) /
                            ProtocolFeeLibrary.PIPS_DENOMINATOR;
                    // subtract it from the total fee and add it to the protocol fee
                    step.feeAmount -= delta;
                    amountToProtocol += delta;
                }
            }

            // update global fee tracker
            if (result.liquidity > 0) {
                unchecked {
                    // FullMath.mulDiv isn't needed as the numerator can't overflow uint256 since tokens have a max supply of type(uint128).max
                    step.feeGrowthGlobalX128 += UnsafeMath.simpleMulDiv(
                        step.feeAmount,
                        FixedPoint128.Q128,
                        result.liquidity
                    );
                }
            }

            // Shift tick if we reached the next price, and preemptively decrement for zeroForOne swaps to tickNext - 1.
            // If the swap doesn't continue (if amountRemaining == 0 or sqrtPriceLimit is met), slot0.tick will be 1 less
            // than getTickAtSqrtPrice(slot0.sqrtPrice). This doesn't affect swaps, but donation calls should verify both
            // price and tick to reward the correct LPs.
            if (result.sqrtPriceX96 == step.sqrtPriceNextX96) {
                // if the tick is initialized, run the tick transition
                if (step.initialized) {
                    (
                        uint256 feeGrowthGlobal0X128,
                        uint256 feeGrowthGlobal1X128
                    ) = zeroForOne
                            ? (step.feeGrowthGlobalX128, feeGrowthGlobal1)
                            : (feeGrowthGlobal0, step.feeGrowthGlobalX128);
                    int128 liquidityNet = crossTick(
                        poolId,
                        step.tickNext,
                        feeGrowthGlobal0X128,
                        feeGrowthGlobal1X128
                    );
                    // if we're moving leftward, we interpret liquidityNet as the opposite sign
                    // safe because liquidityNet cannot be type(int128).min
                    unchecked {
                        if (zeroForOne) liquidityNet = -liquidityNet;
                    }

                    result.liquidity = LiquidityMath.addDelta(
                        result.liquidity,
                        liquidityNet
                    );
                }

                unchecked {
                    result.tick = zeroForOne
                        ? step.tickNext - 1
                        : step.tickNext;
                }
            } else if (result.sqrtPriceX96 != step.sqrtPriceStartX96) {
                // recompute unless we're on a lower tick boundary (i.e. already transitioned ticks), and haven't moved
                result.tick = TickMath.getTickAtSqrtPrice(result.sqrtPriceX96);
            }
        }

        unchecked {
            // "if currency1 is specified"
            if (zeroForOne != (params.amountSpecified < 0)) {
                swapDelta = toBalanceDelta(
                    amountCalculated.toInt128(),
                    (params.amountSpecified - amountSpecifiedRemaining)
                        .toInt128()
                );
            } else {
                swapDelta = toBalanceDelta(
                    (params.amountSpecified - amountSpecifiedRemaining)
                        .toInt128(),
                    amountCalculated.toInt128()
                );
            }
        }

        sqrtPriceX96After = result.sqrtPriceX96;
        int absTick = result.tick - slot0Start.tick();
        absTick = absTick > 0 ? absTick : -absTick;
        initializedTicksCrossed = uint32(int32(absTick));
    }

    function crossTick(
        bytes32 poolId,
        int24 tick,
        uint256 feeGrowthGlobal0X128,
        uint256 feeGrowthGlobal1X128
    ) internal view returns (int128 liquidityNet) {
        (, liquidityNet, , ) = getTickInfo(poolId, tick);
    }

    function nextInitializedTickWithinOneWord(
        bytes32 poolId,
        int24 tick,
        int24 tickSpacing,
        bool lte
    ) internal view returns (int24 next, bool initialized) {
        unchecked {
            int24 compressed = TickBitmap.compress(tick, tickSpacing);

            if (lte) {
                (int16 wordPos, uint8 bitPos) = TickBitmap.position(compressed);
                // all the 1s at or to the right of the current bitPos
                uint256 mask = type(uint256).max >>
                    (uint256(type(uint8).max) - bitPos);
                uint256 masked = getTickBitmap(poolId, wordPos) & mask;

                // if there are no initialized ticks to the right of or at the current tick, return rightmost in the word
                initialized = masked != 0;
                // overflow/underflow is possible, but prevented externally by limiting both tickSpacing and tick
                next = initialized
                    ? (compressed -
                        int24(
                            uint24(bitPos - BitMath.mostSignificantBit(masked))
                        )) * tickSpacing
                    : (compressed - int24(uint24(bitPos))) * tickSpacing;
            } else {
                // start from the word of the next tick, since the current tick state doesn't matter
                (int16 wordPos, uint8 bitPos) = TickBitmap.position(
                    ++compressed
                );
                // all the 1s at or to the left of the bitPos
                uint256 mask = ~((1 << bitPos) - 1);
                uint256 masked = getTickBitmap(poolId, wordPos) & mask;

                // if there are no initialized ticks to the left of the current tick, return leftmost in the word
                initialized = masked != 0;
                // overflow/underflow is possible, but prevented externally by limiting both tickSpacing and tick
                next = initialized
                    ? (compressed +
                        int24(
                            uint24(BitMath.leastSignificantBit(masked) - bitPos)
                        )) * tickSpacing
                    : (compressed + int24(uint24(type(uint8).max - bitPos))) *
                        tickSpacing;
            }
        }
    }
}
