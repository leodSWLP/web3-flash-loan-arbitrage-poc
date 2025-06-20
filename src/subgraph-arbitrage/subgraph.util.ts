import { request, gql } from 'graphql-request';
import * as fs from 'fs';
import { plainToInstance } from 'class-transformer';
import { Token } from '@uniswap/sdk-core';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { RedisUtil } from '../redis/redis.util';
import { BscContractConstant } from '../common/bsc-contract.constant';
import * as JSONbig from 'json-bigint';

export class BasicPoolDetail {
  address: string;
  token0: Token;
  token1: Token;
  feeTier: bigint;
  symbol: string;
}

export class PoolDetail {
  address: string;
  token0: Token;
  token0Price: string;
  token1: Token;
  token1Price: string;
  feeTier: bigint;
  volumeToken0: string;
  volumeToken1: string;
  volumeUSD: string;
  symbol: string;
  swapRate: {
    numerator: bigint;
    denominator: bigint;
  };
  netSwapRate?: {
    numerator: bigint;
    denominator: bigint;
  };
}

export enum SubgraphEndpoint {
  UNISWAP_V3 = 'uniswap_v3',
  PANCAKESWAP_V3 = 'pancakeswap_v3',
}

export class SubgraphUtil {
  
  static BASIS_POINTS = 1000000n;
  static REDIS_GROUP_PREFIX = 'v3-pairs';
  private static DIGITAL_PLACE = 24;
  private static LIST_TOP_POOL_QUERY = `
  query {
 pools(first: {{poolSize}}, orderBy: {{orderBy}}, orderDirection: desc) {
    address: id
    token0 {
      symbol
      address: id
      decimals
      name
    }
    token1 {
      symbol
      address: id
      decimals
      name
    }
    token0Price
    token1Price
    volumeUSD
    feeTier
    volumeToken0
    volumeToken1
  }
}`;

  // ------------------ todo remove mock ---------------------

  static getMockPricesData(
    endpoint: SubgraphEndpoint,
    isIncludePriceData: boolean | undefined = true,
  ) {
    const pancakeswapSnapshots = fs.readFileSync(
      './snapshots/pancakeswap-v3-pools.json',
      'utf8',
    );
    const uniswapSnapshots = fs.readFileSync(
      './snapshots/uniswap-v3-pools.json',
      'utf8',
    );
    const mockData =
      endpoint === SubgraphEndpoint.PANCAKESWAP_V3
        ? pancakeswapSnapshots
        : uniswapSnapshots;

    let data = JSON.parse(mockData).pools.map((pool) =>
      isIncludePriceData
        ? this.parsePoolDetail(pool)
        : this.parseBasicPoolDetail(pool),
    );
    return data;
  }

  // ------------------ todo remove mock end ---------------------

  static getDetailMapKey(tokenIn: Token, TokenOut: Token): string {
    return `${tokenIn.symbol}-${tokenIn.address}/${TokenOut.symbol}-${TokenOut.address}`;
  }

  static async fetchSymbolToFeeTierMap(
    endpoint: SubgraphEndpoint,
  ): Promise<Map<string, BasicPoolDetail[]>> {
    const poolSize = 300;

    const cacheKey = `${
      this.REDIS_GROUP_PREFIX
    }:${endpoint.toString()}-${poolSize}`;

    const cachedValue = await RedisUtil.get(cacheKey);
    if (cachedValue) {
      const cachedResult = new Map<string, BasicPoolDetail[]>();
      const parsedObject = new Map(JSONbig.parse(cachedValue));
      [...parsedObject.entries()].forEach(([key, value]) => {
        cachedResult.set(
          key as string,
          (value as any[]).map((element) => this.parseBasicPoolDetail(element)),
        );
      });

      return cachedResult;
    }

    console.log('Cache Missed - retrieve new pools');

    const poolDetails = (await this.fetchPriceData(
      endpoint,
      poolSize,
      false,
    )) as BasicPoolDetail[];
    const map = new Map<string, BasicPoolDetail[]>();

    for (const pool of poolDetails) {
      const pair1key = this.getDetailMapKey(pool.token0, pool.token1);
      if (!map.get(pair1key)) {
        map.set(pair1key, []);
      }
      map.get(pair1key)!.push(pool);

      const pair2key = this.getDetailMapKey(pool.token1, pool.token0);
      if (!map.get(pair2key)) {
        map.set(pair2key, []);
      }
      map.get(pair2key)!.push(pool);
    }

    [...map.keys()].forEach((key) => {
      map.set(
        key,
        map.get(key)!.sort((a, b) => Number(a.feeTier - b.feeTier)),
      );
    });
    console.log('map: ' + [...map]);
    await RedisUtil.write(cacheKey, JSONbig.stringify([...map]));
    return map;
  }

  static async fetchSymbolToPriceDetailMap(
    endpoint: SubgraphEndpoint,
  ): Promise<Map<string, PoolDetail[]>> {
    const poolDetails: PoolDetail[] = (await this.fetchPriceData(
      endpoint,
    )) as PoolDetail[];
    const map = new Map<string, PoolDetail[]>();
    for (const pool of poolDetails) {
      const pair1key = this.getDetailMapKey(pool.token0, pool.token1);

      if (!map.get(pair1key)) {
        map.set(pair1key, []);
      }
      const pair1Pool = { ...pool };
      pair1Pool.netSwapRate = {
        numerator: pool.swapRate.numerator * (this.BASIS_POINTS - pool.feeTier),
        denominator: pool.swapRate.denominator * this.BASIS_POINTS,
      };
      map.get(pair1key)!.push(pair1Pool);

      const pair2key = this.getDetailMapKey(pool.token1, pool.token0);
      if (!map.get(pair2key)) {
        map.set(pair2key, []);
      }
      const pair2Pool = { ...pool };
      pair2Pool.netSwapRate = {
        numerator:
          pool.swapRate.denominator * (this.BASIS_POINTS - pool.feeTier),
        denominator: pool.swapRate.numerator * this.BASIS_POINTS,
      };
      map.get(pair2key)!.push(pair2Pool);
    }

    [...map.keys()].forEach((key) => {
      const sortedValue = map.get(key)!.sort((a, b) => {
        const base = 1000n;
        const aAmountOut =
          (base * a.netSwapRate!.numerator) /
          (base * a.netSwapRate!.denominator);
        const bAmountOut =
          (base * b.netSwapRate!.numerator) /
          (base * b.netSwapRate!.denominator);
        return Number(aAmountOut - bAmountOut);
      });

      map.set(key, sortedValue);
    });
    return map;
  }

  static async fetchPriceData(
    endpoint: SubgraphEndpoint,
    poolSize: number | undefined = 150,
    isIncludePriceData: boolean | undefined = true,
  ): Promise<PoolDetail[] | BasicPoolDetail[]> {
    const headers = {
      Authorization: `Bearer ${process.env.SUBGRAPH_API_KEY ?? ''}`,
    };

    const listTopPoolsQuery = this.generateQuery(poolSize, 'txCount');

    return this.getMockPricesData(endpoint, isIncludePriceData);

    //todo enable later
    const subgraphUri = this.getSubgraphEndpoint(endpoint);
    try {
      const data = await request(subgraphUri, listTopPoolsQuery, {}, headers);

      return data.pools.map((pool) =>
        isIncludePriceData
          ? this.parsePoolDetail(pool)
          : this.parseBasicPoolDetail(pool),
      );
    } catch (error) {
      console.error('Error fetching data:', error);
    }

    throw new Error('Not found Subgraph PoolDetail');
  }

  private static parseBasicPoolDetail(pool: any) {
    const basicPoolDetail = new BasicPoolDetail();
    const chainId = ShareContentLocalStore.getStore().viemChain.id;

    basicPoolDetail.address = pool.address;
    basicPoolDetail.feeTier = BigInt(pool.feeTier);

    basicPoolDetail.token0 = new Token(
      chainId,
      pool.token0.address,
      +pool.token0.decimals,
      pool.token0.symbol,
    );

    basicPoolDetail.token1 = new Token(
      chainId,
      pool.token1.address,
      +pool.token1.decimals,
      pool.token1.symbol,
    );
    basicPoolDetail.symbol = `${basicPoolDetail.token0.symbol}/${basicPoolDetail.token1.symbol}`;
    return basicPoolDetail;
  }
  private static parsePoolDetail(pool: any) {
    const poolDetail = plainToInstance(PoolDetail, pool);
    if (
      typeof poolDetail.token0Price !== 'string' ||
      typeof poolDetail.token1Price !== 'string'
    ) {
      throw Error('Unable to Parse Pool Information: ' + JSON.stringify(pool));
    }

    const chainId = ShareContentLocalStore.getStore().viemChain.id;
    poolDetail.token0 = new Token(
      chainId,
      pool.token0.address,
      +pool.token0.decimals,
      pool.token0.symbol,
    );

    poolDetail.token1 = new Token(
      chainId,
      pool.token1.address,
      +pool.token1.decimals,
      pool.token1.symbol,
    );

    poolDetail.feeTier = BigInt(poolDetail.feeTier);
    poolDetail.symbol = `${poolDetail.token0.symbol}/${poolDetail.token1.symbol}`;
    poolDetail.swapRate = {
      numerator: this.stringPriceToBigInt(poolDetail.token1Price),
      denominator: 10n ** BigInt(this.DIGITAL_PLACE),
    };

    return poolDetail;
  }

  private static generateQuery(
    poolSize: number,
    orderBy: 'txCount' | 'liquidity',
  ) {
    return this.LIST_TOP_POOL_QUERY.replace(
      '{{poolSize}}',
      `${poolSize}`,
    ).replace('{{orderBy}}', orderBy);
  }

  private static stringPriceToBigInt(priceInString: string) {
    const [integerPart, fractionalPart = ''] = priceInString.split('.');
    const combined =
      integerPart +
      fractionalPart
        .padEnd(this.DIGITAL_PLACE, '0')
        .slice(0, this.DIGITAL_PLACE); // Take first 24 decimal places
    const result = BigInt(combined);
    return result;
  }

  private static getSubgraphEndpoint(endpoint: SubgraphEndpoint) {
    switch (endpoint) {
      case SubgraphEndpoint.UNISWAP_V3:
        return BscContractConstant.subgraph.uniswapV3;
      case SubgraphEndpoint.PANCAKESWAP_V3:
        return BscContractConstant.subgraph.pancakeswapV3;
      default:
        throw new Error('Invalid subgraph endpoint');
    }
  }
}
