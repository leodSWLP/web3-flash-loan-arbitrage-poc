import * as dotenv from 'dotenv';
import { ethers } from 'ethers';
import { Address, encodeAbiParameters, encodeDeployData } from 'viem';

import {
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { ArbitrageQuoter__factory } from '../../typechain-types/factories/contracts/ArbitrageQuoter__factory';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { BscTokenConstant } from '../common/bsc-token.constant';
import { RouteDetail, SwapPathUtil } from './swap-path.util';
import { TokenAmount } from '../subgraph-arbitrage/subgraph-arbitrage.util';
import * as JSONbig from 'json-bigint';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ThrottlingUtil } from '../common/throttling.util';
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
  const batchSize = 10;
  const callsPerSecond = 10;

  for (let i = 0; i < quoteCalls.length; i += batchSize) {
    const batchCalls = quoteCalls.slice(
      i,
      Math.min(i + batchSize, quoteCalls.length),
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

  ThrottlingUtil.throttleAsyncFunctions(batchFunctions, callsPerSecond);
  //   return batchFunctions;
};

const exec = async () => {
  const start = performance.now();

  // await estimateDeploymentGas();
  // await deploy();

  const RouteDetails = await SwapPathUtil.prepareQuoteSwapPath([
    new TokenAmount(BscTokenConstant.usdt, '1000'),
    new TokenAmount(BscTokenConstant.eth, '0.5'),
    new TokenAmount(BscTokenConstant.btcb, '0.001'),
    new TokenAmount(BscTokenConstant.wbnb, '2'),
    new TokenAmount(BscTokenConstant.zk),
    new TokenAmount(BscTokenConstant.usdc, '1000'),
    new TokenAmount(BscTokenConstant.b2),
    new TokenAmount(BscTokenConstant.busd, '1000'),
    new TokenAmount(BscTokenConstant.koge),
    new TokenAmount(BscTokenConstant.cake),
    new TokenAmount(BscTokenConstant.rlb),
    new TokenAmount(BscTokenConstant.turbo),
    new TokenAmount(BscTokenConstant.pndc),
    new TokenAmount(BscTokenConstant.shib),
    new TokenAmount(BscTokenConstant.usd1),
    new TokenAmount(BscTokenConstant.fdusd),
    new TokenAmount(BscTokenConstant.skyai),
    new TokenAmount(BscTokenConstant.aiot),
    new TokenAmount(BscTokenConstant.sol),
    new TokenAmount(BscTokenConstant.siren),
    new TokenAmount(BscTokenConstant.pirate),
    new TokenAmount(BscTokenConstant.myx),
    new TokenAmount(BscTokenConstant.bank),
    new TokenAmount(BscTokenConstant.xter),
    new TokenAmount(BscTokenConstant.xrp),
  ]);

  let counter = 0;
  setInterval(async () => {
    console.log(
      `${new Date().toISOString()}: Start quoteBestRoute - ${counter++}`,
    );
    await quoteBestRoute(RouteDetails);
  }, 5000);

  const end = performance.now();
  const ms = end - start;
  const s = ms / 1000;

  console.log(`Execution time: ${ms.toFixed(2)} ms`);
  console.log(`Execution time: ${s.toFixed(2)} s`);
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
