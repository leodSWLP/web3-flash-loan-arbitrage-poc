import { Token } from '@uniswap/sdk-core';
import { ethers } from 'ethers';
import { Address } from 'viem';
import { BscContractConstant } from '../../common/bsc-contract.constant';
import { RouterUtil } from '../../common/router.util';
import { LogUtil } from '../../log/log.util';
import { TokenAmount } from '../../subgraph/subgraph-arbitrage.util';
import {
  BasicPoolDetail,
  SubgraphEndpoint,
  SubgraphUtil,
} from '../../subgraph/subgraph.util';

export interface RouteDetail {
  routingSymbol: string;
  initialAmount: bigint;
  swapPaths: SwapPath[];
}
export interface SwapPath {
  [x: string]: any;
  swap: any;
  tokenIn: string;
  tokenOut: string;
  quoterDetails: QuoterDetail[];
}

export interface QuoterDetail {
  fee: bigint;
  dexName: string;
  quoterAddress: Address;
  routerAddress: Address;
}

interface DexRouteDetail {
  uniswapV3: { [key: string]: QuoterDetail[] };
  // uniswapV4: { [key: string]: QuoterDetail[] };
  pancakeswapV3: { [key: string]: QuoterDetail[] };
}

export class SwapPathUtil {
  static async prepareQuoteSwapPath(
    tokenAmounts: TokenAmount[],
    pathLength: number = 3,
  ): Promise<RouteDetail[]> {
    const dexV3RouteDetail = await this.prepareDexFeeTierDetail();
    const tokens = tokenAmounts.map((token) => token.currency);
    const pathCombinations = await RouterUtil.getAllRoute(tokens, pathLength);
    const RouteDetailCombinations: RouteDetail[] = [];

    for (const tokenAmount of tokenAmounts) {
      if (!tokenAmount.amount) {
        LogUtil.debug(
          `Skip token: ${RouterUtil.getCombinationKey(
            tokenAmount.currency,
          )}, reason: Missing AmountIn`,
        );
        continue;
      }

      const combinations =
        pathCombinations[RouterUtil.getCombinationKey(tokenAmount.currency)];
      if (!combinations?.length) {
        LogUtil.debug(
          `Token combinations not found, key: ${RouterUtil.getCombinationKey(
            tokenAmount.currency,
          )}`,
        );
        continue;
      }

      for (const tokenPath of combinations) {
        const swapPaths = this.formSwapPath(tokenPath, dexV3RouteDetail);
        const routingSymbol = tokenPath
          .map((token) => token.symbol!)
          .join(' -> ');
        if (swapPaths) {
          LogUtil.debug(`${routingSymbol} - Found`);
          RouteDetailCombinations.push({
            routingSymbol,
            initialAmount: ethers.parseUnits(
              tokenAmount.amount,
              tokenAmount.currency.decimals,
            ),
            swapPaths,
          });
        } else {
          LogUtil.debug(`${routingSymbol} - Not Found`);
        }
      }
    }

    return RouteDetailCombinations;
  }

  static formSwapPath(
    tokens: Token[],
    RouteDetail: DexRouteDetail,
  ): SwapPath[] | undefined {
    const swapPath: SwapPath[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const tokenIn = tokens[i];
      const tokenOut = tokens[(i + 1) % tokens.length];
      const detailMapKey = SubgraphUtil.getDetailMapKey(tokenIn, tokenOut);
      const quoterDetails = [
        ...(RouteDetail.uniswapV3[detailMapKey] ?? []),
        // ...(RouteDetail.uniswapV4[detailMapKey] ?? []),
      ]; //only uniswap have a view quoteExactInputSingle

      if (!quoterDetails?.length) {
        return undefined;
      }

      swapPath.push({
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        quoterDetails,
      });
    }

    return swapPath;
  }

  static async fetchUniswapV3FeeTierMap(): Promise<
    Map<string, BasicPoolDetail[]>
  > {
    const [txCountFeeTierMap, volumeUSDFeeTierMap] = await Promise.all([
      SubgraphUtil.fetchSymbolToFeeTierMap(
        SubgraphEndpoint.UNISWAP_V3,
        500,
        'txCount',
      ),
      SubgraphUtil.fetchSymbolToFeeTierMap(
        SubgraphEndpoint.UNISWAP_V3,
        500,
        'volumeUSD',
      ),
    ]);

    const result = txCountFeeTierMap;
    [...volumeUSDFeeTierMap.entries()].forEach(([key, value]) => {
      if (!result.has(key)) {
        result.set(key, value);
      } else {
        const addressSet = new Set(
          result.get(key)?.map((detail) => detail.address),
        );
        value.forEach((detail) => {
          if (!addressSet.has(detail.address)) {
            result.get(key)?.push(detail);
          }
        });
      }
    });

    return result;
  }
  static async prepareDexFeeTierDetail(): Promise<DexRouteDetail> {
    const [
      pancakeSwapV3FeeTierMap,
      uniswapV3FeeTierMap /* uniswapV4FeeTierMap */,
    ] = await Promise.all([
      SubgraphUtil.fetchSymbolToFeeTierMap(SubgraphEndpoint.PANCAKESWAP_V3),
      this.fetchUniswapV3FeeTierMap(),
      // SubgraphUtil.fetchSymbolToFeeTierMap(SubgraphEndpoint.UNISWAP_V4),
    ]);

    const RouteDetailMaps: DexRouteDetail = {
      uniswapV3: {},
      // uniswapV4: {}, IQuoter don't support v4
      pancakeswapV3: {},
    };

    for (const [key, value] of uniswapV3FeeTierMap) {
      RouteDetailMaps.uniswapV3[key] = value.map((element) => ({
        fee: element.feeTier,
        dexName: 'uniswap-v3',
        quoterAddress: BscContractConstant.uniswap.quoter as Address,
        routerAddress: BscContractConstant.uniswap.universalRouter as Address,
      }));
    }

    // for (const [key, value] of uniswapV4FeeTierMap) {
    //   RouteDetailMaps.uniswapV4[key] = value.map((element) => ({
    //     fee: element.feeTier,
    //     dexName: 'uniswap-v4',
    //     quoterAddress: BscContractConstant.uniswap.quoter as Address,
    //     routerAddress: BscContractConstant.uniswap.universalRouter as Address,
    //   }));
    // }

    for (const [key, value] of pancakeSwapV3FeeTierMap) {
      RouteDetailMaps.pancakeswapV3[key] = value.map((element) => ({
        fee: element.feeTier,
        dexName: 'pancakeswap-v3',
        quoterAddress: BscContractConstant.pancakeswap.quoter as Address,
        routerAddress: BscContractConstant.pancakeswap
          .universalRouter as Address,
      })); // Pancakeswap don't support IQuoter can't use it
    }

    return RouteDetailMaps;
  }
}
