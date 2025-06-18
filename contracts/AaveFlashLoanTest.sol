//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';
import '@aave/core-v3/contracts/interfaces/IPool.sol';
import '@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import 'forge-std/console2.sol';
import './interfaces/IFlashLoan.sol';


contract AaveFlashLoanTest is IFlashLoan, FlashLoanSimpleReceiverBase {
    using SafeERC20 for IERC20;

    error DebugLog(
        uint256 borrowAmount,
        uint256 receivedAount,
        uint256 premium,
        uint256 repayAmount
    );

    constructor(
        address provider
    ) FlashLoanSimpleReceiverBase(IPoolAddressesProvider(provider)) {}

    function executeFlashLoan(address borrowToken, uint256 amountIn, SwapDetail[] calldata swapDetails) external {
        BorrowDetail memory borrowDetail = BorrowDetail({
            caller: msg.sender,
            borrowToken: borrowToken,
            amountIn: amountIn
        });

        bytes memory params = abi.encode(borrowDetail, swapDetails);
        uint16 referralCode = 0;
        POOL.flashLoanSimple(address(this), borrowToken, amountIn, params, referralCode);
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override view returns (bool) {
        (BorrowDetail memory borrowDetail, SwapDetail[] memory swapDetails) = abi.decode(params, (BorrowDetail, SwapDetail[]));


        uint256 totalDebt = amount + premium;

        console2.log("Trade - asset: %s, amount: %s", asset, amount);
        console2.log("Trade - premium: %s, totalDebt: %s", premium, totalDebt);

        revert DebugLog(borrowDetail.amountIn, amount, premium, totalDebt);
        // IERC20(asset).approve(address(POOL), totalDebt);

        return true;
        
    }
}
