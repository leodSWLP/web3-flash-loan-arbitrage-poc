//SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol';
import '@aave/core-v3/contracts/interfaces/IPool.sol';
import '@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@uniswap/universal-router/contracts/libraries/Commands.sol';
import '@uniswap/universal-router/contracts/interfaces/IUniversalRouter.sol';
import '@uniswap/v4-periphery/src/libraries/Actions.sol';
import '@uniswap/v4-periphery/src/interfaces/IV4Router.sol';
import './uniswap-v4/interfaces/IPositionManager.sol';
import 'forge-std/console2.sol';
import './interfaces/IFlashLoan.sol';
import './uniswap-v4/libraries/SafeCast.sol';
import './interfaces/IPermit2.sol';

contract AaveFlashLoanTest is IFlashLoan, FlashLoanSimpleReceiverBase {
    using SafeCast for *;

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

    function executeFlashLoan(
        address borrowToken,
        uint256 amountIn,
        SwapDetail[] calldata swapDetails
    ) external {
        BorrowDetail memory borrowDetail = BorrowDetail({
            caller: msg.sender,
            borrowToken: borrowToken,
            amountIn: amountIn
        });

        bytes memory params = abi.encode(borrowDetail, swapDetails);
        uint16 referralCode = 0;
        POOL.flashLoanSimple(
            address(this),
            borrowToken,
            amountIn,
            params,
            referralCode
        );
    }

    function swapNativeToken(
        address router,
        address positonManager,
        address permit2,
        bytes32 poolId,
        address tokenIn,
        address tokenOut,
        uint128 amountIn
    ) external payable {
        console2.log('swapNativeToken start');
        console2.log('before - msg.sender balance:', msg.sender.balance);
        console2.log(
            'before - tokenOut balance:',
            IERC20(tokenOut).balanceOf(msg.sender)
        );
        bytes memory commands = abi.encodePacked(uint8(Commands.V4_SWAP));
        bytes memory actions = abi.encodePacked(
            uint8(Actions.SWAP_EXACT_IN_SINGLE),
            uint8(Actions.SETTLE_ALL),
            uint8(Actions.TAKE_ALL)
        );

        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: IPositionManager(positonManager).poolKeys(
                    toBytes25(poolId)
                ),
                zeroForOne: true, // true if we're swapping token0 for token1
                amountIn: amountIn, // amount of tokens we're swapping
                amountOutMinimum: 0, // minimum amount we expect to receive
                hookData: bytes('') // no hook data needed
            })
        );
        params[1] = abi.encode(tokenIn, amountIn);
        params[2] = abi.encode(tokenOut, 0);

        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);
        if (tokenIn == address(0)) {
            IUniversalRouter(router).execute{value: amountIn}(
                commands,
                inputs,
                block.timestamp + 10
            );
        } else {
            try IERC20(tokenIn).approve(permit2, amountIn) {} catch {
                revert OperationStepFailed(1);
            }
            try
                IPermit2(permit2).approve(
                    tokenIn,
                    router,
                    SafeCast.toUint160(amountIn),
                    uint48(block.timestamp + 2 * 60)
                )
            {} catch {
                revert OperationStepFailed(2);
            }

            IUniversalRouter(router).execute(
                commands,
                inputs,
                block.timestamp + 10
            );
        }

        console2.log('after - msg.sender balance:', msg.sender.balance);
        console2.log(
            'after - tokenOut balance:',
            IERC20(tokenOut).balanceOf(msg.sender)
        );
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external view override returns (bool) {
        (
            BorrowDetail memory borrowDetail,
            SwapDetail[] memory swapDetails
        ) = abi.decode(params, (BorrowDetail, SwapDetail[]));

        uint256 totalDebt = amount + premium;

        console2.log('Trade - asset: %s, amount: %s', asset, amount);
        console2.log('Trade - premium: %s, totalDebt: %s', premium, totalDebt);

        revert DebugLog(borrowDetail.amountIn, amount, premium, totalDebt);
        // IERC20(asset).approve(address(POOL), totalDebt);

        return true;
    }

    function toBytes25(bytes32 input) internal pure returns (bytes25) {
        bytes25 result;
        assembly {
            // Copy the first 25 bytes of input to result
            // Since bytes32 is 32 bytes, we take the first 25 bytes
            result := input
            // Note: In assembly, assigning bytes32 to bytes25 truncates to the first 25 bytes
        }
        return result;
    }
}
