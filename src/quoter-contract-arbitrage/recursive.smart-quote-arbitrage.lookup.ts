import * as dotenv from 'dotenv';
import { ethers } from 'ethers';

import * as fs from 'fs/promises';
import * as JSONbig from 'json-bigint';
import * as path from 'path';
import {
  Address,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { ArbitrageQuoter__factory } from '../../typechain-types/factories/contracts/ArbitrageQuoter__factory';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { ThrottlingUtil } from '../common/throttling.util';
import { TokenAmount } from '../subgraph-arbitrage/subgraph-arbitrage.util';
import { RouteDetail, SwapPathUtil } from './swap-path.util';
import {
  BscUSDTokenConstant,
  BscTxTokenConstant,
} from '../common/bsc-token.constant';
import { LogUtil } from '../log/log.util';
dotenv.config();

export const account = privateKeyToAccount(
  process.env.WALLET_PRIVATE_KEY as `0x${string}`,
);

const quoterDetailType = {
  type: 'tuple',
  components: [
    { name: 'dexName', type: 'string' },
    { name: 'quoterAddress', type: 'address' },
    { name: 'routerAddress', type: 'address' },
    { name: 'fee', type: 'uint24' },
  ],
} as const;

const quoteBestRoute = async (RouteDetails: RouteDetail[]) => {
  const quoteCalls: {
    routingSymbol: string;
    initialAmount: bigint;
    swapPaths: {
      tokenIn: `0x${string}`;
      tokenOut: `0x${string}`;
      quoterDetails: `0x${string}`;
    }[];
  }[] = RouteDetails.map((quote) => {
    return {
      routingSymbol: quote.routingSymbol,
      initialAmount: quote.initialAmount,
      swapPaths: quote.swapPaths.map((swap) => {
        return {
          tokenIn: swap.tokenIn as Address,
          tokenOut: swap.tokenOut as Address,
          quoterDetails: encodeAbiParameters(
            [{ type: 'tuple[]', components: quoterDetailType.components }],
            [
              swap.quoterDetails.map((item) => {
                return {
                  fee: Number(item.fee),
                  dexName: item.dexName,
                  quoterAddress: item.quoterAddress,
                  routerAddress: item.routerAddress,
                };
              }),
            ],
          ),
        };
      }),
    };
  });

  const batchFunctions: (() => Promise<void>)[] = [];
  const functionBatchSize = 4;
  const callsPerSecond = 10;
  const batchSize = 10240;

  for (let i = 0; i < quoteCalls.length; i += functionBatchSize) {
    const batchCalls = quoteCalls.slice(
      i,
      Math.min(i + functionBatchSize, quoteCalls.length),
    );
    batchFunctions.push(async () => {
      const contracts = batchCalls.map((call) => ({
        address: process.env.QUOTE_ADDRESS as Address,
        abi: ArbitrageQuoter__factory.abi,
        functionName: 'quoteBestRoute' as const,
        args: [call.initialAmount, call.swapPaths],
      }));

      const quoteResults =
        await ShareContentLocalStore.getStore().viemChainClient.multicall({
          allowFailure: true,
          contracts,
          batchSize,
        });

      const dirPath = './profitable-arbitrages';
      await fs.mkdir(dirPath, { recursive: true });

      let successCounter = 0;
      for (let j = 0; j < quoteResults.length; j++) {
        if (
          quoteResults[j].status === 'success'
          //   &&
          //   result.result[-1].amountOut > result.result[0].amountIn
        ) {
          successCounter++;
          const netProfit =
            quoteResults[j].result![quoteResults[j].result!.length - 1]
              .amountOut - quoteResults[j].result![0].amountIn;
          const isProfitable = netProfit > 0n;
          if (!isProfitable) {
            continue;
          }
          console.log(
            `!!!!!Profitable Tarde Found: ${
              quoteCalls[i + j].routingSymbol
            }!!!!!`,
          );
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filePath = path.join(
            dirPath,
            `${timestamp}-${quoteCalls[i + j].routingSymbol}${
              isProfitable ? '-profitable' : ''
            }.json`,
          );

          await fs.writeFile(
            filePath,
            JSONbig.stringify(
              {
                isProfitable,
                netProfit,
                readableNetProfit: ethers.formatUnits(netProfit, 18),
                profitRatio:
                  ethers.formatUnits(
                    (netProfit * ethers.parseUnits('1', 5)) /
                      quoteResults[j].result![0].amountIn,
                    5,
                  ) + '%',
                ...quoteResults[j],
              },
              null,
              2,
            ),
          );
        }
      }
      // LogUtil.debug(
      //   `quoteBestRoute(): success: ${successCounter}, total: ${quoteResults.length}`,
      // );
    });
  }

  await ThrottlingUtil.throttleAsyncFunctions(batchFunctions, callsPerSecond);
  //   return batchFunctions;
};

const exec = async () => {
  // await estimateDeploymentGas();
  // await deploy();

  const tokenAmounts = [
    new TokenAmount(BscTxTokenConstant.usdt, '1000'),
    new TokenAmount(BscTxTokenConstant.eth, '0.5'),
    new TokenAmount(BscTxTokenConstant.btcb, '0.001'),
    new TokenAmount(BscTxTokenConstant.wbnb, '2'),
    new TokenAmount(BscTxTokenConstant.zk),
    new TokenAmount(BscTxTokenConstant.usdc, '1000'),
    new TokenAmount(BscTxTokenConstant.b2),
    new TokenAmount(BscTxTokenConstant.busd, '1000'),
    new TokenAmount(BscTxTokenConstant.koge),
    new TokenAmount(BscTxTokenConstant.cake, '500'),
    new TokenAmount(BscTxTokenConstant.rlb),
    new TokenAmount(BscTxTokenConstant.turbo),
    new TokenAmount(BscTxTokenConstant.pndc),
    new TokenAmount(BscTxTokenConstant.shib),
    new TokenAmount(BscTxTokenConstant.usd1),
    new TokenAmount(BscTxTokenConstant.fdusd),
    new TokenAmount(BscTxTokenConstant.skyai),
    new TokenAmount(BscTxTokenConstant.aiot),
    new TokenAmount(BscTxTokenConstant.sol),
    new TokenAmount(BscUSDTokenConstant.usdz, '1000'),
    new TokenAmount(BscUSDTokenConstant.aicell),
    new TokenAmount(BscUSDTokenConstant.obt),
    new TokenAmount(BscUSDTokenConstant.htp),
    new TokenAmount(BscUSDTokenConstant.skyai),
    new TokenAmount(BscUSDTokenConstant.fhe),
    new TokenAmount(BscUSDTokenConstant.wsm),
    new TokenAmount(BscUSDTokenConstant.cat),
    new TokenAmount(BscUSDTokenConstant._1inch),
    new TokenAmount(BscUSDTokenConstant.pundiai),
    new TokenAmount(BscUSDTokenConstant.gfal),
    new TokenAmount(BscUSDTokenConstant.resolv),
    new TokenAmount(BscUSDTokenConstant.soph),
    new TokenAmount(BscUSDTokenConstant.abra),
  ];

  const RouteDetails = await SwapPathUtil.prepareQuoteSwapPath(tokenAmounts);

  let counter = 0;
  while (true) {
    console.log(
      `${new Date().toISOString()}: Start quoteBestRoute - ${counter++}`,
    );
    await quoteBestRoute(RouteDetails);
  }
};

const viemChainClient = createPublicClient({
  chain: bsc,
  transport: http(process.env.BSC_RPC_URL, { timeout: 600_000 }),
});

const viemWalletClient = createWalletClient({
  chain: bsc,
  transport: http(process.env.BSC_RPC_URL),
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
