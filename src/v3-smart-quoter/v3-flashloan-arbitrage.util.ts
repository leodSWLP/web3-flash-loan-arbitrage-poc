import { ethers } from 'ethers';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { RouteDetail } from './smart-quoter.swap-path.util';
import { ConfigUtil } from '../config/config.util';
import {
  Address,
  ContractFunctionRevertedError,
  decodeErrorResult,
  Log,
  parseEventLogs,
  parseGwei,
  TransactionReceipt,
} from 'viem';
import { FlashArbitrage__factory } from '../../typechain-types/factories/contracts/FlashArbitrage__factory';
import { FlashArbitrage } from '../../typechain-types/contracts/FlashArbitrage';

import { IFlashLoan } from '../../typechain-types/contracts/FlashArbitrage';
import { BscContractConstant } from '../common/bsc-contract.constant';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { TypedEventLog } from '../../typechain-types/common';
import TradeHistoryUtil, {
  IArbitrageResult,
  ITradeMeta,
} from '../trade-history/trade-history-util';
import { LogUtil } from '../log/log.util';
import * as JSONbig from 'json-bigint';
import { ViemClientUtil } from '../common/viem.client.util';

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
  actualTradeResult?: ITradeMeta;
  gasPrice?: string;
  gasUsed?: string;
  transactionHash?: string;
  error?: any;
};

export class V3FlashLoanArbitrageUtil {
  static MAX_PRIORITY_FEE_PER_GAS = '5';
  static DEFAULT_PRIORITY_FEE_PER_GAS = '1';
  static MAX_BASE_FEE = '0.3';
  static IS_EXECUTING_TRADE = false;

  static ESTIMATED_GAS = 900000n;
  static async executeFlashLoanSwap(
    routeDetail: RouteDetail,
    quoteResults: QuoteResult[],
    blockNumber: bigint,
    writeContractOptions?: {
      maxPriorityFeePerGas?: string;
    },
  ) {
    // const maxBlockNumber = blockNumber + 4n;
    const maxBlockNumber = 0n;
    const gasFees = this.calculateGasFees(writeContractOptions);

    const borrowToken = routeDetail.swapPaths[0].tokenIn as Address;
    const borrowAmount = routeDetail.initialAmount;
    const swapDetails = this.parseSwapDetails(quoteResults);

    let flashLoanResult;
    let hash;
    if (!this.IS_EXECUTING_TRADE) {
      try {
        this.IS_EXECUTING_TRADE = true;
        hash = await ViemClientUtil.getRotatingViemWalletClient().writeContract(
          {
            address: ConfigUtil.getConfig()
              .V3_FLASH_LOAN_ARBITRAGE_ADDRESS! as Address,
            abi: FlashArbitrage__factory.abi,
            functionName: 'executeFlashLoan',
            args: [borrowToken, borrowAmount, swapDetails, maxBlockNumber],
            chain: bsc,
            account: privateKeyToAccount(
              process.env.WALLET_PRIVATE_KEY as `0x${string}`,
            ),
            maxFeePerGas: gasFees.maxFeePerGas,
            maxPriorityFeePerGas: gasFees.maxPriorityFeePerGas,
            gas: this.ESTIMATED_GAS,
          },
        );

        console.log('Transaction hash:', hash);
        // Wait for the transaction to be mined
        const receipt =
          await ViemClientUtil.getRotatingViemClient().waitForTransactionReceipt(
            {
              hash,
              timeout: 30000, // 60 seconds
              pollingInterval: 500,
            },
          );

        const logs = receipt.logs;
        const event = parseEventLogs({
          abi: FlashArbitrage__factory.abi,
          logs,
          eventName: 'ArbitrageProfitable',
        });

        flashLoanResult = this.parseFlashLoanResult(
          routeDetail,
          hash,
          receipt,
          event[0].args,
          undefined,
        );

        this.IS_EXECUTING_TRADE = false;
      } catch (err) {
        if (err instanceof ContractFunctionRevertedError) {
          console.log('Decoded Custom Error:', err);
        } else {
          console.error('An unexpected error occurred:', err);
        }
        flashLoanResult = this.parseFlashLoanResult(
          routeDetail,
          hash,
          undefined,
          undefined,
          err,
        );
        LogUtil.debug(
          `Error flashLoanResult: ${JSONbig.stringify(flashLoanResult)}`,
        );
      } finally {
        this.IS_EXECUTING_TRADE = false;
      }
    } else {
      LogUtil.info(
        `executeFlashLoanSwap(): Profitable Trade ${routeDetail.routingSymbol} Found, but is executing other trade`,
      );
    }

    await this.saveFlashLoanResult(
      routeDetail,
      blockNumber,
      quoteResults,
      flashLoanResult,
    );
  }

  private static async saveFlashLoanResult(
    routeDetail: RouteDetail,
    expectedBlockNumber: bigint,
    quoteResults: QuoteResult[],
    flashLoanResult?: FlashLoanResult,
  ) {
    const finalAmount = quoteResults[quoteResults.length - 1].amountOut;
    const netProfit = finalAmount - routeDetail.initialAmount;
    const isProfitable = netProfit > 0n;
    const readableNetProfit = ethers.formatUnits(netProfit, 18); //todo handle token in is not 18 decimals
    const profitRate =
      ethers.formatUnits(
        (netProfit * ethers.parseUnits('1', 5)) / routeDetail.initialAmount,
        3,
      ) + '%';
    const tradePrediction: ITradeMeta = {
      blockNumber: Number(expectedBlockNumber),
      isProfitable,
      finalAmount: finalAmount.toString(),
      readableNetProfit,
      profitRate,
    };

    const repayAmount = this.calculateRepayAmount(routeDetail.initialAmount);

    const arbitrageResult: Partial<IArbitrageResult> = {
      routingSymbol: routeDetail.routingSymbol,
      initialAmount: routeDetail.initialAmount.toString(),
      repayAmount: repayAmount.toString(),
      tradePrediction,
      actualTradeResult: flashLoanResult?.actualTradeResult, // Use actual result if available
      quotePath: quoteResults,
      swapPath: this.parseSwapDetails(quoteResults),
      isTradeExecuted: !!flashLoanResult,
      transactionHash: flashLoanResult?.transactionHash, // Explicitly include transaction hash
      error: flashLoanResult?.error,
    };

    const result = await TradeHistoryUtil.createTradeHistory(arbitrageResult);
    console.log(
      `TradeHistoryUtil.createTradeHistory result: ${JSONbig.stringify(result)}`,
    );
  }

  static calculateRepayAmount(initialValue: bigint, decimals = 18) {
    return initialValue + this.calculateInterest(initialValue);
  }

  static calculateInterest(initialValue: bigint, decimals = 18) {
    if (initialValue < 100000000n) {
      throw new Error('initialValue must be at least 9 digits');
    }
    // 0.05% = 0.0005 = 5 / 10000
    const percentage = ethers.parseUnits('0.0005', decimals); // 0.05% in wei (or token decimals)
    const result =
      (initialValue * percentage) / ethers.parseUnits('1', decimals);

    return result;
  }

  static parseSwapDetails(quoteResults: QuoteResult[]) {
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

    return swapDetails;
  }

  private static calculateGasFees(writeContractOptions?: {
    maxPriorityFeePerGas?: string;
  }) {
    let maxPriorityFeePerGas = parseGwei(
      writeContractOptions?.maxPriorityFeePerGas ??
        this.DEFAULT_PRIORITY_FEE_PER_GAS,
    );
    if (maxPriorityFeePerGas > parseGwei(this.MAX_PRIORITY_FEE_PER_GAS)) {
      maxPriorityFeePerGas = parseGwei(this.MAX_PRIORITY_FEE_PER_GAS);
    }
    let maxFeePerGas = maxPriorityFeePerGas + parseGwei(this.MAX_BASE_FEE);

    return {
      maxPriorityFeePerGas,
      maxFeePerGas,
    };
  }

  private static parseFlashLoanResult(
    routeDetail: RouteDetail,
    transactionHash?: string, // Add transactionHash parameter
    receipt?: TransactionReceipt,
    profitableEvent?: {
      repayAmount: bigint;
      actualAmountOut: bigint;
    },
    error?: ContractFunctionRevertedError,
  ) {
    if (!profitableEvent && !error) {
      throw new Error(
        'parseFlashLoanResult(): Both receipt and error empty is not allowed',
      );
    }

    if (!!profitableEvent !== !!receipt) {
      throw new Error(
        'parseFlashLoanResult(): please provide ProfitableEvent with receipt',
      );
    }

    const result: FlashLoanResult = { transactionHash }; // Always include transaction hash
    if (receipt && profitableEvent) {
      const finalAmount = profitableEvent.actualAmountOut;
      const netProfit = finalAmount - routeDetail.initialAmount;
      const isProfitable = netProfit > 0n;
      const readableNetProfit = ethers.formatUnits(netProfit, 18); //todo handle token in is not 18 decimals
      const profitRate =
        ethers.formatUnits(
          (netProfit * ethers.parseUnits('1', 5)) / routeDetail.initialAmount,
          3,
        ) + '%';

      result.actualTradeResult = {
        blockNumber: Number(receipt.blockNumber),
        isProfitable,
        finalAmount: finalAmount.toString(),
        readableNetProfit,
        profitRate,
      };
      result.gasPrice = receipt.blobGasPrice?.toString();
      result.gasUsed = receipt.gasUsed?.toString();
    }

    if (error) {
      result.error = error;
    }

    return result;
  }
}
