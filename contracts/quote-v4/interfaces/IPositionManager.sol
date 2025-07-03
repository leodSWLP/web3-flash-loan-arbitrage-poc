// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';

interface IPositionManager {
    function poolKeys(bytes25 poolId) external view returns (PoolKey memory);
}
