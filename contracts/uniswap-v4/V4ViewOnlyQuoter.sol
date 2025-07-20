// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import {V4QuoteMath} from './V4QuoteMath.sol';
import {IStateView} from './interfaces/IStateView.sol';
import {IPoolManager} from './interfaces/IPoolManager.sol';
import {IPositionManager} from './interfaces/IPositionManager.sol';
import {TickMath} from './libraries/TickMath.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';
import {Dex} from '../libraries/Dex.sol';
import {SafeCast} from './libraries/SafeCast.sol';

contract V4ViewOnlyQuoter is V4QuoteMath, Ownable {
    using SafeCast for *;

    struct UniswapV4Config {
        IStateView stateView;
        IPoolManager poolManager;
        IPositionManager positionManager;
    }

    UniswapV4Config public v4Config;

    error InvalidUniswapAddress(uint8 _address);

    struct V4QuoteExactInputSingle {
        bytes32 poolId;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        Dex dex;
    }

    constructor(
        address _stateView,
        address _poolManager,
        address _positionManager
    ) Ownable(msg.sender) {
        if (_stateView == address(0)) {
            revert InvalidUniswapAddress(0);
        }
        if (_poolManager == address(0)) {
            revert InvalidUniswapAddress(1);
        }
        if (_positionManager == address(0)) {
            revert InvalidUniswapAddress(2);
        }
        v4Config.stateView = IStateView(_stateView);
        v4Config.poolManager = IPoolManager(_poolManager);
        v4Config.positionManager = IPositionManager(_positionManager);
    }

    function quoteExactInput(
        V4QuoteExactInputSingle calldata param
    )
        public
        view
        returns (
            uint256 amountOut,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        )
    {
        bool zeroForOne = param.tokenIn < param.tokenOut;
        uint160 sqrtPriceLimitX96 = zeroForOne
            ? TickMath.MIN_SQRT_PRICE + 1
            : TickMath.MAX_SQRT_PRICE - 1;
        SwapParams memory swapParams = SwapParams({
            amountSpecified: -param.amountIn.toInt256(),
            tickSpacing: getTickSpacing(param.poolId),
            zeroForOne: zeroForOne,
            sqrtPriceLimitX96: sqrtPriceLimitX96,
            lpFeeOverride: 0
        });
    }

    function updateV4Config(
        address _stateView,
        address _poolManager,
        address _positionManager
    ) public onlyOwner {
        if (_stateView != address(0)) {
            v4Config.stateView = IStateView(_stateView);
        }
        if (_poolManager != address(0)) {
            v4Config.poolManager = IPoolManager(_poolManager);
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
        (
            uint256 _feeGrowthGlobal0X128,
            uint256 _feeGrowthGlobal1X128
        ) = v4Config.stateView.getFeeGrowthGlobals(poolId);
        feeGrowthGlobal0X128 = _feeGrowthGlobal0X128;
        feeGrowthGlobal1X128 = _feeGrowthGlobal1X128;
    }

    function getLiquidity(
        bytes32 poolId
    ) public view virtual override returns (uint128 liquidity) {
        liquidity = v4Config.stateView.getLiquidity(poolId);
    }

    function getTickBitmap(
        bytes32 poolId,
        int16 tick
    ) public view virtual override returns (uint256 tickBitmap) {
        tickBitmap = v4Config.poolManager.getTickBitmap(poolId, tick);
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
        (
            liquidityGross,
            liquidityNet,
            feeGrowthOutside0X128,
            feeGrowthOutside1X128
        ) = v4Config.stateView.getTickInfo(poolId, tick);
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
        (sqrtPriceX96, tick, protocolFee, lpFee) = v4Config.stateView.getSlot0(
            poolId
        );
    }

    function getTickSpacing(
        bytes32 poolId
    ) public view returns (int24 tickSpacing) {
        PoolKey memory poolKey = v4Config.positionManager.poolKeys(
            toBytes25(poolId)
        );

        tickSpacing = poolKey.tickSpacing;
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
