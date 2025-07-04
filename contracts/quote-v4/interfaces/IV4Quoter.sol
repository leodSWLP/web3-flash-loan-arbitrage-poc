//SPDX-License-Identifier: MIT
pragma solidity >=0.8.24 <=0.9.0;

import '../../libraries/Dex.sol';

interface IV4Quoter {

    struct QuoteExactInputSingleWithPoolParams {
        Dex dex;
        address stateView;
        address positionManager;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        bytes32 poolId;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingleWithPool(
        QuoteExactInputSingleWithPoolParams memory params
    )
        external
        view
        returns (
            uint256 amountOut,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        );
}
