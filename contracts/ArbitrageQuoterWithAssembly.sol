//SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import './interfaces/IQuoter.sol';

contract ArbitrageQuoterWithAssembly {
    struct QuoterDetail {
        string dexName;
        address quoterAddress;
        address routerAddress;
        uint24 fee;
    }

    struct SwapPath {
        address tokenIn;
        address tokenOut;
        bytes quoterDetails;
    }

    struct OutputPath {
        string dexName;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        address quoterAddress;
        address routerAddress;
        uint24 fee;
        uint160 sqrtPriceX96;
        uint32 initializedTicksCrossed;
        uint256 gasEstimate;
    }

    error QuoteFailed(
        address quoter,
        address tokenIn,
        address tokenOut,
        uint24 fee,
        string reason
    );
    error NoValidQuote(address tokenIn, address tokenOut, uint256 amountIn);

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
            (
                uint256 amountOut,
                uint160 sqrtPriceX96,
                uint32 ticksCrossed,
                uint256 gasEstimate
            ) = _quotePrice(
                    path.tokenIn,
                    path.tokenOut,
                    amountIn,
                    quoter.quoterAddress,
                    quoter.fee
                );

            if (amountOut > bestAmountOut) {
                bestPath = OutputPath({
                    dexName: quoter.dexName,
                    tokenIn: path.tokenIn,
                    tokenOut: path.tokenOut,
                    amountIn: amountIn,
                    amountOut: amountOut,
                    quoterAddress: quoter.quoterAddress,
                    routerAddress: quoter.routerAddress,
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
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address quoterAddress,
        uint24 fee
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
        IQuoter.QuoteExactInputSingleParams memory params = IQuoter
            .QuoteExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                fee: fee,
                sqrtPriceLimitX96: 0
            });

        (
            bool success,
            uint256 _amountOut,
            uint160 _sqrtPriceX96,
            uint32 _initializedTicksCrossed,
            uint256 _gasEstimate
        ) = _callQuoteExactInputSingle(quoterAddress, params);

        if (!success) {
            revert QuoteFailed(
                quoterAddress,
                tokenIn,
                tokenOut,
                fee,
                "Static call failed"
            );
        }

        amountOut = _amountOut;
        sqrtPriceX96 = _sqrtPriceX96;
        initializedTicksCrossed = _initializedTicksCrossed;
        gasEstimate = _gasEstimate;
    }

    function _callQuoteExactInputSingle(
        address quoterAddress,
        IQuoter.QuoteExactInputSingleParams memory params
    )
        internal
        view
        returns (
            bool success,
            uint256 amountOut,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        )
    {
        // Encode the function call
        bytes memory callData = abi.encodeWithSelector(
            IQuoter.quoteExactInputSingle.selector,
            params
        );

        // Prepare variables for assembly
        success;
        bytes memory returnData;

        // Use assembly to perform a static call
        assembly {
            // Perform STATICCALL
            success := staticcall(
                gas(),              // Forward all available gas
                quoterAddress, // Load quoterAddress from storage
                add(callData, 32), // Pointer to callData (skip length prefix)
                mload(callData),   // Length of callData
                0,                 // Output memory pointer (will be set later)
                0                  // Output size (will be set later)
            )

            // Get return data size
            let size := returndatasize()
            // Allocate memory for return data
            returnData := mload(0x40)
            // Update free memory pointer
            mstore(0x40, add(returnData, add(size, 32)))
            // Copy return data
            returndatacopy(returnData, 0, size)
        }

        // Check if the call was successful
        if (!success) {
            amountOut = 0;
            sqrtPriceX96After = 0;
            initializedTicksCrossed = 0;
            gasEstimate = 0;
            return (success, amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate);
        }

        // Decode the return data
        (amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate) =
            abi.decode(returnData, (uint256, uint160, uint32, uint256));
    }
}
