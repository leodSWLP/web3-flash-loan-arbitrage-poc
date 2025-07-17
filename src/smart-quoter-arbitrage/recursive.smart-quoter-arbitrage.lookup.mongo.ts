import { ethers } from 'ethers';

import { Address, createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { V3ArbitrageQuoter__factory } from '../../typechain-types/factories/contracts/quote-v3/V3ArbitrageQuoter__factory';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { BscTxTokenConstant } from '../common/bsc-token.constant';
import { ThrottlingUtil } from '../common/throttling.util';
import { ConfigUtil } from '../config/config.util';
import { LogUtil } from '../log/log.util';
import { TokenAmount } from '../subgraph/subgraph-arbitrage.util';
import {
  RouteDetail,
  SmartQuoterSwapPathUtil,
} from '../v3-smart-quoter/smart-quoter.swap-path.util';
import { V3SmartQuoterUtil } from '../v3-smart-quoter/v3-smart-quoter.util';
import { V3FlashLoanArbitrageUtil } from '../v3-smart-quoter/v3-flashloan-arbitrage.util';
import TradeHistoryUtil from '../trade-history/trade-history-util';
import { ViemClientUtil } from '../common/viem.client.util';

export const account = privateKeyToAccount(
  ConfigUtil.getConfig().WALLET_PRIVATE_KEY as `0x${string}`,
);

const quoteBestRoute = async (
  routeDetails: RouteDetail[],
  triggerByBlockNumber?: bigint,
) => {
  if (!ConfigUtil.getConfig().V3_ARBITRAGE_QUOTER_ADDRESS) {
    throw new Error(
      '.env missing contract address - V3_ARBITRAGE_QUOTER_ADDRESS',
    );
  }

  const quoteCalls = routeDetails.map((detail) =>
    V3SmartQuoterUtil.prepareQuoterCallParam(detail),
  );

  const batchFunctions: (() => Promise<void>)[] = [];
  const functionBatchSize = 3;
  const callsPerSecond = 5;
  const batchSize = 10240;

  for (let i = 0; i < quoteCalls.length; i += functionBatchSize) {
    const batchCalls = quoteCalls.slice(
      i,
      Math.min(i + functionBatchSize, quoteCalls.length),
    );
    batchFunctions.push(async () => {
      const callStart = performance.now();

      const blockNumberPromise = triggerByBlockNumber
        ? undefined
        : ViemClientUtil.getRotatingViemClient().getBlockNumber();

      const contracts = batchCalls.map((call) => ({
        address: ConfigUtil.getConfig().V3_ARBITRAGE_QUOTER_ADDRESS as Address,
        abi: V3ArbitrageQuoter__factory.abi,
        functionName: 'quoteBestRoute' as const,
        args: [call.initialAmount, call.swapPaths],
      }));
      const quoteResults =
        await ViemClientUtil.getRotatingViemClient().multicall({
          allowFailure: true,
          contracts,
          batchSize,
        });

      const blockNumber = triggerByBlockNumber ?? (await blockNumberPromise!);

      let successCounter = 0;
      for (let j = 0; j < quoteResults.length; j++) {
        if (
          quoteResults[j].status === 'success'
          //   &&
          //   result.result[-1].amountOut > result.result[0].amountIn
        ) {
          successCounter++;
          const finalAmount =
            quoteResults[j].result![quoteResults[j].result!.length - 1]
              .amountOut;
          const netProfit = finalAmount - quoteResults[j].result![0].amountIn;
          const isProfitable = netProfit > 0n;
          const readableNetProfit = ethers.formatUnits(netProfit, 18); //todo handle token in is not 18 decimals
          const profitRate =
            ethers.formatUnits(
              (netProfit * ethers.parseUnits('1', 5)) /
                quoteResults[j].result![0].amountIn,
              3,
            ) + '%';
          const isCoverInterest = parseFloat(profitRate) > 0.05;

          if (!isProfitable) {
            continue;
          }
          console.log(
            `!!!!! Profitable Tarde Found: ${
              quoteCalls[i + j].routingSymbol
            } with profitRate: ${profitRate} !!!!!`,
          );

          const tradeRouteDetail = routeDetails[i + j];
          const tradeQuoteResult = [...quoteResults[j].result!];
          if (isCoverInterest) {
            await V3FlashLoanArbitrageUtil.executeFlashLoanSwap(
              tradeRouteDetail,
              tradeQuoteResult,
              blockNumber,
              { maxPriorityFeePerGas: '0.2' },
            ); //todo maxPriorityFee calculation
          } else {
            const repayAmount = V3FlashLoanArbitrageUtil.calculateRepayAmount(
              tradeRouteDetail.initialAmount,
            );
            TradeHistoryUtil.createTradeHistory({
              routingSymbol: tradeRouteDetail.routingSymbol,
              initialAmount: tradeRouteDetail.initialAmount.toString(),
              repayAmount: repayAmount.toString(),
              tradePrediction: {
                blockNumber: Number(blockNumber),
                isProfitable,
                finalAmount: finalAmount.toString(),
                readableNetProfit,
                profitRate,
              },
              quotePath: tradeQuoteResult,
              swapPath:
                V3FlashLoanArbitrageUtil.parseSwapDetails(tradeQuoteResult),
              isTradeExecuted: false,
            });
          }
        }
      }

      const callEnd = performance.now();
      const ms = callEnd - callStart; // Time in milliseconds
      LogUtil.debug(
        `quoteBestRoute() - success: ${successCounter}, total: ${quoteResults.length}, execution time: ${ms}`,
      );
    });
  }

  const throttleStart = performance.now();
  await ThrottlingUtil.throttleAsyncFunctions(batchFunctions, callsPerSecond);
  const throttleEnd = performance.now();
  const ms = throttleEnd - throttleStart; // Time in milliseconds
  LogUtil.debug(
    `ThrottlingUtil.throttleAsyncFunctions() - execution time: ${ms}`,
  );
};

const exec = async () => {
  const tokenAmounts = [
    new TokenAmount(BscTxTokenConstant.usdt, '10000'),
    new TokenAmount(BscTxTokenConstant.eth),
    new TokenAmount(BscTxTokenConstant.btcb),
    new TokenAmount(BscTxTokenConstant.wbnb),
    new TokenAmount(BscTxTokenConstant.usdc),
    // new TokenAmount(BscTxTokenConstant.cake),
  ];

  const [swapRoute, arbitrageRoute] = await Promise.all([
    SmartQuoterSwapPathUtil.prepareQuoteSwapPath(tokenAmounts, 2),
    SmartQuoterSwapPathUtil.prepareQuoteSwapPath(tokenAmounts, 3),
  ]);
  const routeDetails = [...swapRoute, ...arbitrageRoute];

  let counter = 0;
  while (true) {
    console.log(
      `${new Date().toISOString()}: Start quoteBestRoute - ${counter++}`,
    );
    await quoteBestRoute(routeDetails);
  }
};

const viemChainClient = createPublicClient({
  chain: bsc,
  transport: http(ConfigUtil.getConfig().BSC_RPC_URL, { timeout: 600_000 }),
});

const viemWalletClient = createWalletClient({
  chain: bsc,
  transport: http(ConfigUtil.getConfig().BSC_RPC_URL),
  account,
});

const runWithShareContentLocalStore = () => {
  ShareContentLocalStore.initAsyncLocalStore(() => {
    ShareContentLocalStore.getStore().viemChain = bsc;
    ShareContentLocalStore.getStore().viemChainClient = viemChainClient;
    ShareContentLocalStore.getStore().viemWalletClient = viemWalletClient;
  }, exec);
};

runWithShareContentLocalStore();

console.log('');
