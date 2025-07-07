import { ethers } from 'ethers';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { RouteDetail } from './smart-quoter.swap-path.util';
import { ConfigUtil } from '../config/config.util';
import { Address } from 'viem';
import { FlashArbitrage__factory } from '../../typechain-types/factories/contracts/FlashArbitrage__factory';
import { IFlashLoan } from '../../typechain-types/contracts/FlashArbitrage';
import { BscContractConstant } from '../common/bsc-contract.constant';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
export type QuoteResult = {
  dexName: string;
  version: string;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  amountOut: bigint;
  factoryAddress: `0x${string}`;
  fee: number;
  sqrtPriceX96: bigint;
  initializedTicksCrossed: number;
  gasEstimate: bigint;
};

export class V3FlashLoanArbitrageUtil {
  static MAX_GAS_PRICE = ethers.parseUnits('5', 9);
  static async executeFlashLoanSwap(
    routeDetail: RouteDetail,
    quoteResults: QuoteResult[],
    blockNumber: number,
    gasPriceGWei? = '0.11',
  ) {
    let gasPrice = ethers.parseUnits(gasPriceGWei, 9);
    if (gasPrice > this.MAX_GAS_PRICE) {
      gasPrice = this.MAX_GAS_PRICE;
    }

    const borrowToken = routeDetail.swapPaths[0].tokenIn as Address;
    const borrowAmount = routeDetail.initialAmount;
    const swapDetails: {
      routerAddress: Address;
      permit2Address: Address;
      tokenIn: Address;
      tokenOut: Address;
      fee: number;
    }[] = [];

    quoteResults.forEach((quote) => {
      swapDetails.push({
        routerAddress:
          quote.dexName === 'uniswap'
            ? (BscContractConstant.uniswap.universalRouter as Address)
            : (BscContractConstant.pancakeswap.universalRouter as Address),
        permit2Address:
          quote.dexName === 'uniswap'
            ? (BscContractConstant.uniswap.permit2 as Address)
            : (BscContractConstant.pancakeswap.permit2 as Address),
        tokenIn: quote.tokenIn as Address,
        tokenOut: quote.tokenOut as Address,
        fee: quote.fee,
      });
    });
      
      //todo error handling and event handling
    const hash =
      await ShareContentLocalStore.getStore().viemWalletClient!.writeContract({
        address: ConfigUtil.getConfig().AAVE_FLASH_LOAN_ADDRESS! as Address,
        abi: FlashArbitrage__factory.abi,
        functionName: 'executeFlashLoan',
        args: [borrowToken, borrowAmount, swapDetails, gasPrice],
        chain: bsc,
        account: privateKeyToAccount(
          process.env.WALLET_PRIVATE_KEY as `0x${string}`,
          ),
        gasPrice,
      });

    console.log('Transaction hash:', hash);

    // Wait for the transaction to be mined
    const receipt =
      await ShareContentLocalStore.getStore().viemChainClient.waitForTransactionReceipt(
        {
          hash,
          pollingInterval: 500,
        },
      );
    const contractAddress = receipt.contractAddress;

    if (!contractAddress) {
      throw new Error(
        'Contract deployment failed: No contract address in receipt',
      );
    }
    console.log('Contract deployed to:', contractAddress);
    return contractAddress;
  }
}
