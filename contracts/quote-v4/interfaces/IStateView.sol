// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@uniswap/v4-core/src/types/PoolId.sol';
import '@uniswap/v4-core/src/interfaces/IPoolManager.sol';

// This is for Uniswap V4 Quote
interface IStateView {
    function getSlot0(
        PoolId poolId
    )
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint24 protocolFee,
            uint24 lpFee
        );

    function getTickInfo(
        PoolId poolId,
        int24 tick
    )
        external
        view
        returns (
            uint128 liquidityGross,
            int128 liquidityNet,
            uint256 feeGrowthOutside0X128,
            uint256 feeGrowthOutside1X128
        );

    function getTickLiquidity(
        PoolId poolId,
        int24 tick
    ) external view returns (uint128 liquidityGross, int128 liquidityNet);

    function getLiquidity(
        PoolId poolId
    ) external view returns (uint128 liquidity);

    function poolManager() external view returns (IPoolManager);
}
