import { ethers } from 'ethers';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { RouteDetail } from './smart-quoter.swap-path.util';
import { ConfigUtil } from '../config/config.util';
import {
  Address,
  ContractFunctionRevertedError,
  decodeErrorResult,
  parseEventLogs,
  parseGwei,
} from 'viem';
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

export type FlashLoanResult = {
  actualTradeResult?: {
    blockNumber: number;
    isProfitable: boolean;
    finalAmount: string;
    readableNetProfit: string;
    profitRate: string;
  },
  gasPrice?: string;
  gasUsed?: string;
  error?: any;
}

export class V3FlashLoanArbitrageUtil {
  static MAX_PRIORITY_FEE_PER_GAS = '5';
  static DEFAULT_PRIORITY_FEE_PER_GAS = '1';
  static MAX_BASE_FEE = '0.3';

  static async executeFlashLoanSwap(
    routeDetail: RouteDetail,
    quoteResults: QuoteResult[],
    blockNumber: bigint,
    writeContractOptions?: {
      maxPriorityFeePerGas?: string;
    },
  ) {
    
    const result: FlashLoanResult = {}; 
    let maxPriorityFeePerGas = parseGwei(
      writeContractOptions?.maxPriorityFeePerGas ?? this.DEFAULT_PRIORITY_FEE_PER_GAS,
    );
    if (maxPriorityFeePerGas > parseGwei(this.MAX_PRIORITY_FEE_PER_GAS)) {
      maxPriorityFeePerGas = parseGwei(this.MAX_PRIORITY_FEE_PER_GAS);
    }
    const maxBlockNumber = blockNumber + 2n;
    let maxFeePerGas = maxPriorityFeePerGas + parseGwei(this.MAX_BASE_FEE);

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

    const hash =
      await ShareContentLocalStore.getStore().viemWalletClient!.writeContract({
        address: ConfigUtil.getConfig().AAVE_FLASH_LOAN_ADDRESS! as Address,
        abi: FlashArbitrage__factory.abi,
        functionName: 'executeFlashLoan',
        args: [borrowToken, borrowAmount, swapDetails, maxBlockNumber],
        chain: bsc,
        account: privateKeyToAccount(
          process.env.WALLET_PRIVATE_KEY as `0x${string}`,
        ),
        maxFeePerGas,
        maxPriorityFeePerGas
      });

    console.log('Transaction hash:', hash);
    try {
      // Wait for the transaction to be mined
      const receipt =
        await ShareContentLocalStore.getStore().viemChainClient.waitForTransactionReceipt(
          {
            hash,
            pollingInterval: 500,
          },
        );

      if (receipt.status == 'success') {
        const logs = receipt.logs;
        const event = parseEventLogs({
          abi: FlashArbitrage__factory.abi,
          logs,
          eventName: 'ArbitrageProfitable',
        });

        result.actualTradeResult = {
          blockNumber: receipt.blockNumber,
        }
      }
    } catch (err) {
      if (err instanceof ContractFunctionRevertedError) {
        console.log('Decoded Custom Error:', err);
      } else {
        console.error('An unexpected error occurred:', err);
      }
    }
  }
}
