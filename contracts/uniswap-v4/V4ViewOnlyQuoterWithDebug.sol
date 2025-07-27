// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import {V4QuoteMathWithDebug} from './V4QuoteMathWithDebug.sol';
import {IStateView} from './interfaces/IStateView.sol';
import {IPoolManager} from './interfaces/IPoolManager.sol';
import {IPositionManager} from './interfaces/IPositionManager.sol';
import {TickMath} from './libraries/TickMath.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {SafeCast} from './libraries/SafeCast.sol';
import {BalanceDelta, toBalanceDelta, BalanceDeltaLibrary} from './types/BalanceDelta.sol';
import {console2} from 'forge-std/console2.sol';

contract V4ViewOnlyQuoterWithDebug is V4QuoteMathWithDebug, Ownable {
    using SafeCast for *;

    struct UniswapV4Config {
        IStateView stateView;
        IPositionManager positionManager;
    }

    UniswapV4Config public v4Config;

    error InvalidUniswapAddress(uint8 _address);

    struct V4QuoteExactInputSingle {
        bytes32 poolId;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
    }

    constructor(
        address _stateView,
        address _positionManager
    ) Ownable(msg.sender) {
        if (_stateView == address(0)) {
            revert InvalidUniswapAddress(0);
        }

        if (_positionManager == address(0)) {
            revert InvalidUniswapAddress(2);
        }
        v4Config.stateView = IStateView(_stateView);
        v4Config.positionManager = IPositionManager(_positionManager);
    }

    function quoteExactInput(
        V4QuoteExactInputSingle calldata params
    )
        public
        view
        returns (
            uint256 amountOut,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed
        )
    {
        console2.log('quoteExactInput() start');
        bool zeroForOne = params.tokenIn < params.tokenOut;
        uint160 sqrtPriceLimitX96 = zeroForOne
            ? TickMath.MIN_SQRT_PRICE + 1
            : TickMath.MAX_SQRT_PRICE - 1;
        SwapParams memory swapParams = SwapParams({
            amountSpecified: -params.amountIn.toInt256(),
            tickSpacing: getTickSpacing(params.poolId),
            zeroForOne: zeroForOne,
            sqrtPriceLimitX96: sqrtPriceLimitX96,
            lpFeeOverride: 0 //todo ignore hooks lpFeeOverride
        });

        (
            BalanceDelta swapDelta,
            uint160 _sqrtPriceX96After,
            uint32 _initializedTicksCrossed,

        ) = swap(params.poolId, swapParams);

        amountOut = zeroForOne
            ? uint256(swapDelta.amount1().toUint128())
            : uint256(swapDelta.amount0().toUint128());
        console2.log('swapDelta.amount0()');
        console2.logInt(int256(swapDelta.amount0()));
        console2.log('swapDelta.amount1()');
        console2.logInt(int256(swapDelta.amount1()));
        console2.log('amountToProtocol()', sqrtPriceX96After);
        console2.log('swapFee()', initializedTicksCrossed);

        sqrtPriceX96After = _sqrtPriceX96After;
        initializedTicksCrossed = _initializedTicksCrossed;
        console2.log('quoteExactInput() end');
    }

    function updateV4Config(
        address _stateView,
        address _positionManager
    ) public onlyOwner {
        if (_stateView != address(0)) {
            v4Config.stateView = IStateView(_stateView);
        }
        if (_positionManager != address(0)) {
            v4Config.positionManager = IPositionManager(_positionManager);
        }
    }

    function getFeeGrowthGlobals(
        bytes32 poolId
    )
        public
        view
        virtual
        override
        returns (uint256 feeGrowthGlobal0X128, uint256 feeGrowthGlobal1X128)
    {
        console2.log('getFeeGrowthGlobals() start');

        (
            uint256 _feeGrowthGlobal0X128,
            uint256 _feeGrowthGlobal1X128
        ) = v4Config.stateView.getFeeGrowthGlobals(poolId);
        feeGrowthGlobal0X128 = _feeGrowthGlobal0X128;
        feeGrowthGlobal1X128 = _feeGrowthGlobal1X128;
        console2.log('getFeeGrowthGlobals() end');
    }

    function getLiquidity(
        bytes32 poolId
    ) public view virtual override returns (uint128 liquidity) {
        console2.log('getLiquidity() start');

        liquidity = v4Config.stateView.getLiquidity(poolId);
        console2.log('getLiquidity() end');
    }

    function getTickBitmap(
        bytes32 poolId,
        int16 tick
    ) public view virtual override returns (uint256 tickBitmap) {
        console2.log('getTickBitmap() start');

        tickBitmap = v4Config.stateView.getTickBitmap(poolId, tick);
        console2.log('getTickBitmap() end');
    }

    function getTickInfo(
        bytes32 poolId,
        int24 tick
    )
        public
        view
        virtual
        override
        returns (
            uint128 liquidityGross,
            int128 liquidityNet,
            uint256 feeGrowthOutside0X128,
            uint256 feeGrowthOutside1X128
        )
    {
        console2.log('getTickInfo() start');

        (
            liquidityGross,
            liquidityNet,
            feeGrowthOutside0X128,
            feeGrowthOutside1X128
        ) = v4Config.stateView.getTickInfo(poolId, tick);
        console2.log('getTickInfo() end');
    }

    function getSlot0(
        bytes32 poolId
    )
        public
        view
        virtual
        override
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint24 protocolFee,
            uint24 lpFee
        )
    {
        console2.log('getSlot0() start');

        (sqrtPriceX96, tick, protocolFee, lpFee) = v4Config.stateView.getSlot0(
            poolId
        );
        console2.log('getSlot0() end');
    }

    function getTickSpacing(
        bytes32 poolId
    ) public view returns (int24 tickSpacing) {
        console2.log('getTickSpacing() start');

        PoolKey memory poolKey = v4Config.positionManager.poolKeys(
            toBytes25(poolId)
        );

        tickSpacing = poolKey.tickSpacing;
        console2.log('getTickSpacing() end');
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
}
