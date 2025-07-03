// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import './IHooks.sol';
import './IPoolManager.sol';
import '../types/Currency.sol';

// This is for Pancakeswap V4 Quote
interface ICLPoolManager {
    function poolIdToPoolKey(
        bytes32 poolId
    )
        external
        view
        returns (
            Currency currency0,
            Currency currency1,
            IHooks hooks,
            IPoolManager poolManager,
            uint24 fee,
            bytes32 parameters
        );

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

    function getPoolTickInfo(
        bytes32 poolId,
        int24 tick
    ) external view returns (TickInfo memory);

    function getLiquidity(
        bytes32 poolId
    ) external view returns (uint128 liquidity);
}
