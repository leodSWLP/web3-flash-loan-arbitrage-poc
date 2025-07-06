import { ethers } from 'ethers';
import * as fs from 'fs/promises';
import * as JSONbig from 'json-bigint';
import { Address, encodeAbiParameters } from 'viem';
import { V3ArbitrageQuoter__factory } from '../../typechain-types/factories/contracts/quote-v3/V3ArbitrageQuoter__factory';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { ThrottlingUtil } from '../common/throttling.util';
import { ConfigUtil } from '../config/config.util';
import { LogUtil } from '../log/log.util';
import { RouteDetail } from './smart-quoter.swap-path.util';

type QuoterCallParam = {
  routingSymbol: string;
  initialAmount: bigint;
  swapPaths: {
    tokenIn: `0x${string}`;
    tokenOut: `0x${string}`;
    quoterDetails: `0x${string}`;
  }[];
};

export class V3SmartQuoterUtil {
  static quoterDetailType = {
    type: 'tuple',
    components: [
      { name: 'dexName', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'factoryAddress', type: 'address' },
      { name: 'routerAddress', type: 'address' },
      { name: 'fee', type: 'uint24' },
    ],
  } as const;

  static prepareQuoterCallParam(routeDetail: RouteDetail): QuoterCallParam {
    const swapPaths = routeDetail.swapPaths.map((swap) => {
      return {
        tokenIn: swap.tokenIn as Address,
        tokenOut: swap.tokenOut as Address,
        quoterDetails: encodeAbiParameters(
          [{ type: 'tuple[]', components: this.quoterDetailType.components }],

          [
            swap.quoterDetails.map((item) => {
              return {
                fee: Number(item.fee),
                dexName: item.dexName,
                version: item.version,
                factoryAddress: item.factoryAddress,
                routerAddress: item.routerAddress,
              };
            }),
          ],
        ),
      };
    });
    const quoteCallParam = {
      routingSymbol: routeDetail.routingSymbol,
      initialAmount: routeDetail.initialAmount,
      swapPaths: swapPaths,
    };
    return quoteCallParam;
  }

  static async recursiveQuoteBestRoute(routeDetails: RouteDetail[]) {
    if (!ConfigUtil.getConfig().V3_ARBITRAGE_QUOTER_ADDRESS) {
      throw new Error(
        '.env missing contract address - V3_ARBITRAGE_QUOTER_ADDRESS',
      );
    }

    const quoteCallParams = routeDetails.map((detail) =>
      this.prepareQuoterCallParam(detail),
    );

    const batchFunctions: (() => Promise<void>)[] = [];
    const functionBatchSize = 4;
    const callsPerSecond = 6;
    const batchSize = 10240;

    for (let i = 0; i < quoteCallParams.length; i += functionBatchSize) {
      const batchCalls = quoteCallParams.slice(
        i,
        Math.min(i + functionBatchSize, quoteCallParams.length),
      );
      batchFunctions.push(async () => {
        const contracts = batchCalls.map((call) => ({
          address: ConfigUtil.getConfig()
            .V3_ARBITRAGE_QUOTER_ADDRESS as Address,
          abi: V3ArbitrageQuoter__factory.abi,
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
                quoteCallParams[i + j].routingSymbol
              }!!!!!`,
            );
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filePath = path.join(
              dirPath,
              `${timestamp}-${quoteCallParams[i + j].routingSymbol}${
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
                      3,
                    ) + '%',
                  ...quoteResults[j],
                },
                null,
                2,
              ),
            );
          }
        }
        LogUtil.debug(
          `quoteBestRoute(): success: ${successCounter}, total: ${quoteResults.length}`,
        );
      });
    }

    await ThrottlingUtil.throttleAsyncFunctions(batchFunctions, callsPerSecond);
  }
}
