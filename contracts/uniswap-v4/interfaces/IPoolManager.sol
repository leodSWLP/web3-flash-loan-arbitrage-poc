// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICommonPoolManager {
    function getTickBitmap(
        bytes32 poolId,
        int16 tick
    ) external view returns (uint256 tickBitmap);
}
