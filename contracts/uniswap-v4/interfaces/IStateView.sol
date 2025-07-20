// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@uniswap/v4-core/src/types/PoolId.sol';

// This is for Uniswap V4 Quote
interface IStateView {
    function getSlot0(
        bytes32 poolId
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
        bytes32 poolId,
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
        bytes32 poolId,
        int24 tick
    ) external view returns (uint128 liquidityGross, int128 liquidityNet);

    function getLiquidity(
        bytes32 poolId
    ) external view returns (uint128 liquidity);

    function poolManager() external view returns (address);

    function getFeeGrowthGlobals(
        bytes32 poolId
    )
        external
        view
        returns (uint256 feeGrowthGlobal0, uint256 feeGrowthGlobal1);
}
