// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';
import '@aave/core-v3/contracts/interfaces/IPool.sol';
import '@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/math/SafeCast.sol';
import '@uniswap/universal-router/contracts/interfaces/IUniversalRouter.sol';
import './interfaces/IFlashLoan.sol';
import './interfaces/IPermit2.sol';
import 'forge-std/console2.sol';

contract FlashArbitrageWithDebug is IFlashLoan, FlashLoanSimpleReceiverBase {
    using SafeERC20 for IERC20;

    constructor(
        address provider
    ) FlashLoanSimpleReceiverBase(IPoolAddressesProvider(provider)) {
        console2.log('Step 0: Contract initialized');
    }

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
        
        console2.log('Step 1: Starting flash loan execution');
        bytes memory params = abi.encode(swapDetails);
        uint16 referralCode = 0;
        try
            POOL.flashLoanSimple(
                address(this),
                borrowToken,
                amountIn,
                params,
                referralCode
            )
        {
            console2.log('Step 2: Flash loan initiated successfully');
        } catch {
            console2.log('Step 3: Flash loan initiation failed');
            revert OperationStepFailed(0);
        }
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
        console2.log('Step 4: Starting swap operation');
        // Approve Permit2 to spend tokenIn
        try IERC20(tokenIn).approve(permist2Address, amountIn) {
            console2.log('Step 5: Permit2 approval successful');
        } catch {
            console2.log('Step 6: Permit2 approval failed');
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
        {
            console2.log('Step 7: Universal Router approval successful');
        } catch {
            console2.log('Step 8: Universal Router approval failed');
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
        {
            console2.log('Step 9: Swap execution successful');
        } catch {
            console2.log('Step 10: Swap execution failed');
            revert OperationStepFailed(3);
        }
        amountOut = IERC20(tokenOut).balanceOf(address(this));
        console2.log('Step 11: Swap completed, amountIn: ', amountIn);
        console2.log('Step 11: Swap completed, amountOut: ', amountOut);
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 permium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        console2.log('Step 12: Starting executeOperation');
        SwapDetail[] memory swapDetails = abi.decode(params, (SwapDetail[]));
        uint256 repayAmount = amount + permium;
        uint256 currentAmount = amount;
        for (uint8 i = 0; i < swapDetails.length; i++) {
            console2.log('Step 13: Processing swap ', i);
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
            console2.log(
                'Step 14: Swap ',
                i,
                ' completed, currentAmount: ',
                currentAmount
            );
        }

        if (currentAmount <= repayAmount) {
            console2.log('Step 15: Arbitrage not profitable');
            revert ArbitrageNotProfitable(repayAmount, currentAmount);
        }

        console2.log('Step 16: Arbitrage profitable, emitting event');
        emit ArbitrageProfitable(repayAmount, currentAmount, block.number);

        try IERC20(asset).transfer(initiator, currentAmount - repayAmount) {
            console2.log('Step 17: Profit transfer to initiator successful');
        } catch {
            console2.log('Step 18: Profit transfer to initiator failed');
            revert OperationStepFailed(4);
        }
        try IERC20(asset).transfer(msg.sender, repayAmount) {
            console2.log('Step 19: Repayment transfer successful');
        } catch {
            console2.log('Step 20: Repayment transfer failed');
            revert OperationStepFailed(5);
        }
        console2.log('Step 21: Operation completed successfully');
        return true;
    }
}
