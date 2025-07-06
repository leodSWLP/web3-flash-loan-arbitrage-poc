//SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import './interfaces/IV3Quoter.sol';
import '../libraries/Dex.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

contract V3ArbitrageQuoter is Ownable {
    string public constant UNISWAP_DEXNAME = 'uniswap';
    string public constant PANCAKESWAP_DEXNAME = 'pancakeswap';

    address public v3QuoterAddress;
    IV3Quoter public v3Quoter;

    constructor(address _v3QuoterAddress) Ownable(msg.sender) {
        v3QuoterAddress = _v3QuoterAddress;
        v3Quoter = IV3Quoter(_v3QuoterAddress);
    }

    struct QuoterDetail {
        string dexName;
        string version;
        address factoryAddress;
        uint24 fee;
    }

    struct SwapPath {
        address tokenIn;
        address tokenOut;
        bytes quoterDetails;
    }

    struct OutputPath {
        string dexName;
        string version;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        address factoryAddress;
        uint24 fee;
        uint160 sqrtPriceX96;
        uint32 initializedTicksCrossed;
        uint256 gasEstimate;
    }

    struct QuotePriceParams {
        string dexName;
        string version;
        address factorAddress;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
    }

    error QuoteFailed(
        address factory,
        address tokenIn,
        address tokenOut,
        uint24 fee,
        string reason
    );
    error NoValidQuote(address tokenIn, address tokenOut, uint256 amountIn);

    error InvalidDexName(string dexName);

    function setV3Quoter(address _v3QuoterAddress) external onlyOwner {
        v3QuoterAddress = _v3QuoterAddress;
        v3Quoter = IV3Quoter(_v3QuoterAddress);
    }

    function quoteBestRoute(
        uint256 initialAmount,
        SwapPath[] calldata swapPaths
    ) external view returns (OutputPath[] memory outputPaths) {
        outputPaths = new OutputPath[](swapPaths.length);
        uint256 currentAmount = initialAmount;

        for (uint256 i; i < swapPaths.length; ++i) {
            outputPaths[i] = _findBestQuote(currentAmount, swapPaths[i]);
            currentAmount = outputPaths[i].amountOut;
        }

        return outputPaths;
    }

    function _findBestQuote(
        uint256 amountIn,
        SwapPath memory path
    ) private view returns (OutputPath memory bestPath) {
        QuoterDetail[] memory quoters = abi.decode(
            path.quoterDetails,
            (QuoterDetail[])
        );
        uint256 bestAmountOut;

        for (uint256 i; i < quoters.length; ++i) {
            QuoterDetail memory quoter = quoters[i];

            QuotePriceParams memory params = QuotePriceParams({
                dexName: quoter.dexName,
                version: quoter.version,
                factorAddress: quoter.factoryAddress,
                tokenIn: path.tokenIn,
                tokenOut: path.tokenOut,
                amountIn: amountIn,
                fee: quoter.fee
            });
            (
                uint256 amountOut,
                uint160 sqrtPriceX96,
                uint32 ticksCrossed,
                uint256 gasEstimate
            ) = _quotePrice(params);

            if (amountOut > bestAmountOut) {
                bestPath = OutputPath({
                    dexName: quoter.dexName,
                    version: quoter.version,
                    tokenIn: path.tokenIn,
                    tokenOut: path.tokenOut,
                    amountIn: amountIn,
                    amountOut: amountOut,
                    factoryAddress: quoter.factoryAddress,
                    fee: quoter.fee,
                    sqrtPriceX96: sqrtPriceX96,
                    initializedTicksCrossed: ticksCrossed,
                    gasEstimate: gasEstimate
                });
                bestAmountOut = amountOut;
            }
        }

        if (bestAmountOut == 0) {
            revert NoValidQuote(path.tokenIn, path.tokenOut, amountIn);
        }
    }

    function _quotePrice(
        QuotePriceParams memory _params
    )
        private
        view
        returns (
            uint256 amountOut,
            uint160 sqrtPriceX96,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        )
    {
        Dex dex;
        if (
            keccak256(abi.encodePacked(_params.dexName)) ==
            keccak256(abi.encodePacked(PANCAKESWAP_DEXNAME))
        ) {
            dex = Dex.PancakeSwap;
        } else if (
            keccak256(abi.encodePacked(_params.dexName)) ==
            keccak256(abi.encodePacked(UNISWAP_DEXNAME))
        ) {
            dex = Dex.Uniswap;
        } else {
            revert InvalidDexName(_params.dexName);
        }

        IV3Quoter.QuoteExactInputSingleParams memory params = IV3Quoter
            .QuoteExactInputSingleParams({
                dex: dex,
                factory: _params.factorAddress,
                tokenIn: _params.tokenIn,
                tokenOut: _params.tokenOut,
                amountIn: _params.amountIn,
                fee: _params.fee,
                sqrtPriceLimitX96: 0
            });

        try v3Quoter.quoteExactInputSingle(params) returns (
            uint256 _amountOut,
            uint160 _sqrtPriceX96,
            uint32 _initializedTicksCrossed,
            uint256 _gasEstimate
        ) {
            return (
                _amountOut,
                _sqrtPriceX96,
                _initializedTicksCrossed,
                _gasEstimate
            );
        } catch Error(string memory reason) {
            revert QuoteFailed(
                _params.factorAddress,
                _params.tokenIn,
                _params.tokenOut,
                _params.fee,
                reason
            );
        }
    }
}
