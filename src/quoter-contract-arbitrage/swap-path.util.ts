import { Token } from '@uniswap/sdk-core';
import { ethers } from 'ethers';
import * as JSONbig from 'json-bigint';
import { Address } from 'viem';
import { BscContractConstant } from '../common/bsc-contract.constant';
import { RouterUtil } from '../common/router.util';
import { LogUtil } from '../log/log.util';
import { TokenAmount } from '../subgraph-arbitrage/subgraph-arbitrage.util';
import {
  SubgraphEndpoint,
  SubgraphUtil,
} from '../subgraph-arbitrage/subgraph.util';

export interface RouteDetail {
  routingSymbol: string;
  initialAmount: bigint;
  swapPaths: SwapPath[];
}
export interface SwapPath {
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

interface DexV3RouteDetail {
  uniswapV3: { [key: string]: QuoterDetail[] };
  pancakeswapV3: { [key: string]: QuoterDetail[] };
}

export class SwapPathUtil {
  static async prepareQuoteSwapPath(
    tokenAmounts: TokenAmount[],
    pathLength: number = 3,
  ): Promise<RouteDetail[]> {
    const dexV3RouteDetail = await this.prepareDexV3FeeTierDetail();
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
        if (swapPaths) {
          RouteDetailCombinations.push({
            routingSymbol: tokenPath.map((token) => token.symbol!).join(' -> '),
            initialAmount: ethers.parseUnits(
              tokenAmount.amount,
              tokenAmount.currency.decimals,
            ),
            swapPaths,
          });
        }
      }
    }

    console.log(
      'RouteDetailCombinations: ' + JSONbig.stringify(RouteDetailCombinations),
    );
    return RouteDetailCombinations;
  }

  static formSwapPath(
    tokens: Token[],
    RouteDetail: DexV3RouteDetail,
  ): SwapPath[] | undefined {
    const swapPath: SwapPath[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const tokenIn = tokens[i];
      const tokenOut = tokens[(i + 1) % tokens.length];
      const detailMapKey = SubgraphUtil.getDetailMapKey(tokenIn, tokenOut);
      const quoterDetails = RouteDetail.uniswapV3[detailMapKey]; //only uniswap have a view quoteExactInputSingle

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

  static async prepareDexV3FeeTierDetail(): Promise<DexV3RouteDetail> {
    const [pancakeSwapFeeTierMap, uniswapFeeTierMap] = await Promise.all([
      SubgraphUtil.fetchSymbolToFeeTierMap(SubgraphEndpoint.PANCAKESWAP_V3),
      SubgraphUtil.fetchSymbolToFeeTierMap(SubgraphEndpoint.UNISWAP_V3),
    ]);

    const RouteDetailMaps: DexV3RouteDetail = {
      uniswapV3: {},
      pancakeswapV3: {},
    };

    for (const [key, value] of uniswapFeeTierMap) {
      RouteDetailMaps.uniswapV3[key] = value.map((element) => ({
        fee: element.feeTier,
        dexName: 'uniswap',
        quoterAddress: BscContractConstant.uniswap.quoter as Address,
        routerAddress: BscContractConstant.uniswap.universalRouter as Address,
      }));
    }

    for (const [key, value] of pancakeSwapFeeTierMap) {
      RouteDetailMaps.pancakeswapV3[key] = value.map((element) => ({
        fee: element.feeTier,
        dexName: 'pancakeswap',
        quoterAddress: BscContractConstant.pancakeswap.quoter as Address,
        routerAddress: BscContractConstant.pancakeswap
          .universalRouter as Address,
      })); // Pancakeswap don't support IQuoter can't use it
    }

    return RouteDetailMaps;
  }
}
