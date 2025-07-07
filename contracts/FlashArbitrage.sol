//SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';
import '@aave/core-v3/contracts/interfaces/IPool.sol';
import '@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/math/SafeCast.sol';
import '@uniswap/universal-router/contracts/interfaces/IUniversalRouter.sol';
import './interfaces/IFlashLoan.sol';
import './interfaces/IPermit2.sol';

contract FlashArbitrage is IFlashLoan, FlashLoanSimpleReceiverBase {
    using SafeERC20 for IERC20;

    constructor(
        address provider
    ) FlashLoanSimpleReceiverBase(IPoolAddressesProvider(provider)) {}

    function executeFlashLoan(
        address borrowToken,
        uint256 amountIn,
        SwapDetail[] calldata swapDetails,
        uint64 maxBlockNumber
    ) external {

        // maxBlockNumber == 0 means skip block number validation
        if (maxBlockNumber != 0 && maxBlockNumber > block.number) {
            revert BlockNumberExceedsCurrent(maxBlockNumber, uint64(block.number));
        }
        bytes memory params = abi.encode(swapDetails);
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
    ) internal returns (uint256 amountOut) {
        // Approve Permit2 to spend tokenIn
        try IERC20(tokenIn).approve(permist2Address, amountIn) {} catch {
            revert OperationStepFailed(1);
        }
        // Approve Universal Router via Permit2
        try
            IPermit2(permist2Address).approve(
                tokenIn,
                routerAddress,
                SafeCast.toUint160(amountIn),
                uint48(block.timestamp + 2 * 60)
            )
        {} catch {
            revert OperationStepFailed(2);
        }
        //  SWAP_EXACT_IN command == (0x00)
        bytes memory commands = abi.encodePacked(bytes1(0x00));

        bytes memory path = abi.encodePacked(tokenIn, fee, tokenOut);
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(
            address(this),
            amountIn,
            amountOutMinimum,
            path,
            true
        );

        try
            IUniversalRouter(routerAddress).execute(
                commands,
                inputs,
                block.timestamp + 10
            )
        {} catch {
            revert OperationStepFailed(3);
        }
        amountOut = IERC20(tokenOut).balanceOf(address(this));
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 permium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        SwapDetail[] memory swapDetails = abi.decode(params, (SwapDetail[]));
        uint256 repayAmount = amount + permium;
        uint256 currentAmount = amount;
        for (uint8 i = 0; i < swapDetails.length; i++) {
            SwapDetail memory detail = swapDetails[i];
            uint256 swapAmountOut = _swap(
                detail.routerAddress,
                detail.permit2Address,
                detail.tokenIn,
                detail.tokenOut,
                detail.fee,
                currentAmount,
                0
            );

            currentAmount = swapAmountOut;
        }

        if (currentAmount <= repayAmount) {
            revert ArbitrageNotProfitable(repayAmount, currentAmount);
        }

        emit ArbitrageProfitable(repayAmount, currentAmount);

        try
            IERC20(asset).transfer(initiator, currentAmount - repayAmount)
        {} catch {
            revert OperationStepFailed(4);
        }
        try IERC20(asset).transfer(msg.sender, repayAmount) {} catch {
            revert OperationStepFailed(5);
        }
        return true;
    }
}
