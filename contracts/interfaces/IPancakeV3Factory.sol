// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.7.6;

interface IPancakeV3Factory {

    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external view returns (address pool);

}