//SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';
import '@aave/core-v3/contracts/interfaces/IPool.sol';
import '@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/math/SafeCast.sol';
import '@uniswap/universal-router/contracts/interfaces/IUniversalRouter.sol';
import 'forge-std/console2.sol';
import './interfaces/IFlashLoan.sol';
import './interfaces/IPermit2.sol';

contract FlashArbitrage is IFlashLoan, FlashLoanSimpleReceiverBase {
    using SafeERC20 for IERC20;

    error debugLog(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);
    constructor(
        address provider
    ) FlashLoanSimpleReceiverBase(IPoolAddressesProvider(provider)) {}

    function flashLoanSimple(
        address borrowToken,
        uint256 amountIn,
        SwapDetail[] calldata swapDetails
    ) external {
        bytes memory params = abi.encode(msg.sender, swapDetails);
        uint16 referralCode = 0;
        POOL.flashLoanSimple(
            address(this),
            borrowToken,
            amountIn,
            params,
            referralCode
        );
    }

    function _swap(
        address routerAddress,
        address permist2Address,
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) internal returns (uint256 amountOut){
        // Approve Permit2 to spend tokenIn
        console2.log('_swap amountIn: ', amountIn);
        // IERC20(tokenIn).approve(permist2Address, amountIn);

        // // Approve Universal Router via Permit2
        // IPermit2(permist2Address).approve(tokenIn, routerAddress, SafeCast.toUint160(amountIn), uint48(block.timestamp + 2 * 60));
    
        // Approve Universal Router to spend tokenIn
        IERC20(tokenIn).approve(routerAddress, amountIn + 1000);

        //  SWAP_EXACT_IN command == (0x00)
        bytes memory commands = abi.encodePacked(bytes1(0x00));

        bytes memory path = abi.encodePacked(tokenIn, fee, tokenOut);
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(address(this), amountIn, amountOutMinimum, path, true);

        IUniversalRouter(routerAddress).execute(commands, inputs, block.timestamp + 10);

        amountOut = IERC20(tokenOut).balanceOf(address(this));
                
        // Optional: For Debug only
        emit SwapExecuted(tokenIn, tokenOut, fee, amountIn, amountOut);
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 permium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        (address recipient, SwapDetail[] memory swapDetails) = abi.decode(params, (address, SwapDetail[]));
        uint256 repayAmount = amount + permium;
        uint256 currentAmount = amount;
        for (uint8 i = 0; i < swapDetails.length; i++) {
            SwapDetail memory detail = swapDetails[i];
            currentAmount = _swap(detail.routerAddress, detail.permit2Address, detail.tokenIn, detail.tokenOut, detail.fee, currentAmount, 0);
        }

        if (currentAmount <= repayAmount) {
            revert ArbitrageNotProfitable(repayAmount, currentAmount);
        }

        emit ArbitrageProfitable(repayAmount, currentAmount);

        IERC20(asset).transfer(recipient, currentAmount - repayAmount);
        IERC20(asset).transfer(msg.sender, repayAmount);
    }
}
