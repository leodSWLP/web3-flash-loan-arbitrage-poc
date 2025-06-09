import { Currency, CurrencyAmount, TradeType } from '@pancakeswap/sdk';
import { SmartRouter } from '@pancakeswap/smart-router';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { PancakeSwapConstant } from './pancakeswap.constant';
import * as JSONbig from 'json-bigint';
import { PancakeCommonUtil } from './pancake-common.util';
import { RedisUtil } from '../redis/redis.util';
import { PoolSerializerUtil } from './pool-serializer.util';
import { ethers } from 'ethers';

export class V3SmartRouterUtil {
  static REDIS_GROUP_PREFIX = 'v3-pairs';
  static REDIS_PAIR_PREFIX = 'v3-one-pair';
  static TTL = 60 * 60;

  static async getV3Pools(swapFrom: Currency, swapTo: Currency) {
    return await SmartRouter.getV3CandidatePools({
      onChainProvider: () => ShareContentLocalStore.getStore().viemChainClient,
      subgraphProvider: () => PancakeSwapConstant.v3SubgraphClient,
      currencyA: swapFrom,
      currencyB: swapTo,
      subgraphFallback: false,
    });
  }

  static async getCacheV3Pools(swapFrom: Currency, swapTo: Currency) {
    const [token0, token1] = PancakeCommonUtil.sortToken(
      swapFrom.asToken,
      swapTo.asToken,
    );
    const groupKey = `${this.REDIS_GROUP_PREFIX}:${token0.asToken.symbol}-${token1.asToken.symbol}`;

    const cachedPool = await RedisUtil.get(groupKey);

    if (cachedPool) {
      return JSONbig.parse(cachedPool).map((item) =>
        PoolSerializerUtil.parseV3Pool(item),
      );
    }

    console.log('Cache Missed - retrieve new pools');
    const pools = await this.getV3Pools(swapFrom, swapTo);

    await RedisUtil.write(groupKey, JSONbig.stringify(pools), this.TTL);
    const pairPromises = pools.map((item) => {
      const itemKey = `${this.REDIS_PAIR_PREFIX}:${item.reserve0?.currency.symbol}-${item.reserve1?.currency.symbol}-${item['address']}`;
      RedisUtil.write(itemKey, JSONbig.stringify(item), this.TTL);
    });
    await Promise.all(pairPromises);

    return pools;
  }

  static async getBestTrade(
    swapFrom: Currency,
    swapFromAmount: bigint,
    swapTo: Currency,
  ) {
    const v3Pools = await this.getCacheV3Pools(swapFrom, swapTo);

    const quoteProvider = SmartRouter.createQuoteProvider({
      onChainProvider: () => ShareContentLocalStore.getStore().viemChainClient,
    });

    const swapCurrency = CurrencyAmount.fromRawAmount(swapFrom, swapFromAmount);
    const trade = await SmartRouter.getBestTrade(
      swapCurrency,
      swapTo,
      TradeType.EXACT_INPUT,
      {
        gasPriceWei: () =>
          ShareContentLocalStore.getStore().viemChainClient.getGasPrice(),
        maxHops: 2,
        maxSplits: 2,
        poolProvider: SmartRouter.createStaticPoolProvider([...v3Pools]),
        quoteProvider,
        quoterOptimization: true,
      },
    );

    if (!trade) {
      throw Error(
        `Unable to find trade for input swapFrom: ${swapFrom.asToken.symbol}, swapFromAmount: ${swapFromAmount}, swapTo: ${swapTo.asToken.symbol}`,
      );
    }
    console.log(
      `Trade Info - swapFrom: ${
        trade.inputAmount.currency.asToken.symbol
      }, inputAmount ${ethers.formatUnits(
        (
          trade.inputAmount.numerator / trade.inputAmount.denominator
        ).toString(),
        trade.inputAmount.currency.asToken.decimals,
      )}, swapTo ${trade.outputAmount.currency.asToken.symbol}, outputAmount
        ${ethers.formatUnits(
          (
            trade.outputAmount.numerator / trade.outputAmount.denominator
          ).toString(),
          trade.outputAmount.currency.asToken.decimals,
        )}`,
    );
    return trade;
  }
}
