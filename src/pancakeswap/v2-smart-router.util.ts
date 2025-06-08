import {
  Currency,
  CurrencyAmount,
  ERC20Token,
  TradeType,
} from '@pancakeswap/sdk';
import { SmartRouter } from '@pancakeswap/smart-router';
import { GraphQLClient } from 'graphql-request';
import * as JSONbig from 'json-bigint';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { PoolSerializerUtil } from './pool-serializer.util';
import { PancakeSwapConstant } from './pancakeswap.constant';
import { RedisUtil } from '../redis/redis.util';
import { PancakeCommonUtil } from './pancake-common.util';

export class V2SmartRouterUtil {
  static REDIS_GROUP_PREFIX = 'v2-pairs';
  static REDIS_PAIR_PREFIX = 'v2-one-pair';
  static TTL = 15 * 60;

  static async getV2Pools(swapFrom: Currency, swapTo: Currency) {
    return await SmartRouter.getV2CandidatePools({
      onChainProvider: () => ShareContentLocalStore.getStore().viemChainClient,
      v2SubgraphProvider: () => PancakeSwapConstant.v2SubgraphClient,
      v3SubgraphProvider: () => PancakeSwapConstant.v3SubgraphClient,
      currencyA: swapFrom,
      currencyB: swapTo,
    });
  }

  static async getCacheV2Pools(swapFrom: Currency, swapTo: Currency) {
    const [token0, token1] = PancakeCommonUtil.sortToken(
      swapFrom.asToken,
      swapTo.asToken,
    );
    const groupKey = `${this.REDIS_GROUP_PREFIX}:${token0.asToken.symbol}-${token1.asToken.symbol}`;

    const cachedPool = await RedisUtil.get(groupKey);

    if (cachedPool) {
      return JSONbig.parse(cachedPool).map((item) =>
        PoolSerializerUtil.parseV2Pool(item),
      );
    }

    console.log('Cache Missed - retrieve new pools');
    const pools = await this.getV2Pools(swapFrom, swapTo);

    await RedisUtil.write(groupKey, JSONbig.stringify(pools), this.TTL);
    const pairPromises = pools.map((item) => {
      const itemKey = `${this.REDIS_PAIR_PREFIX}:${item.reserve0.currency.symbol}-${item.reserve1.currency.symbol}-${item['address']}`;
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
    const v2Pools = await this.getCacheV2Pools(swapFrom, swapTo);
    const quoteProvider = SmartRouter.createQuoteProvider({
      onChainProvider: () => ShareContentLocalStore.getStore().viemChainClient,
    });

    // console.log('v2Pools', JSONbig.stringify(v2Pools));
    // console.log('v3Pools', v3Pools);

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
        poolProvider: SmartRouter.createStaticPoolProvider([...v2Pools]),
        quoteProvider,
        quoterOptimization: true,
      },
    );

    console.log('Trade: ', JSONbig.stringify(trade));
    return trade;
  }
}
