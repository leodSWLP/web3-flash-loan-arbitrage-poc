// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@uniswap/v4-core/src/types/PoolId.sol';

// This is for Pancakewap V4 Quote
interface ICommonPoolManager {
    function getTickBitmap(
        bytes32 poolId,
        int16 tick
    ) external view returns (uint256 tickBitmap);

    function getPoolBitmapInfo(
        bytes32 poolId,
        int16 word
    ) external view returns (uint256 tickBitmap);
}
