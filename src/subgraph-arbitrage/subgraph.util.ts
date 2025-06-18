import { request, gql } from 'graphql-request';
import * as fs from 'fs';
import { plainToInstance } from 'class-transformer';
import { Token } from '@uniswap/sdk-core';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';

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
  UNISWAP_V3 = 'https://gateway.thegraph.com/api/subgraphs/id/G5MUbSBM7Nsrm9tH2tGQUiAF4SZDGf2qeo1xPLYjKr7K',
  PANCAKESWAP_V3 = 'r',
}

export class SubgraphUtil {
  static BASIS_POINTS = 1000000n;

  private static POOL_SIZE = 150;
  private static DIGITAL_PLACE = 24;
  private static LIST_TOP_POOLS_QUERY = `query {
 pools(first: ${this.POOL_SIZE}, orderBy: txCount, orderDirection: desc) {
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

  static getMockPoolsData(endpoint: SubgraphEndpoint) {
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
      this.parsePoolDetail(pool),
    );
    return data;
  }

  // ------------------ todo remove mock end ---------------------

  static getDetailMapKey(tokenIn: Token, TokenOut: Token): string {
    return `${tokenIn.symbol}-${tokenIn.address}/${TokenOut.symbol}-${TokenOut.address}`;
  }

  static async fetchSymbolToDetailMap(
    endpoint: SubgraphEndpoint,
  ): Promise<Map<string, PoolDetail[]>> {
    const poolDetails = await this.fetchData(endpoint);
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

  static async fetchData(endpoint: SubgraphEndpoint): Promise<PoolDetail[]> {
    const headers = {
      Authorization: `Bearer ${process.env.SUBGRAPH_API_KEY ?? ''}`,
    };

    return this.getMockPoolsData(endpoint);

    //todo enable later
    const subgraphUri = this.getSubgraphEndpoint(endpoint);
    try {
      const data = await request(
        subgraphUri,
        this.LIST_TOP_POOLS_QUERY,
        {},
        headers,
      );

      return data.pools.map((pool) => this.parsePoolDetail(pool));
    } catch (error) {
      console.error('Error fetching data:', error);
    }

    throw new Error('Not found Subgraph PoolDetail');
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
      case SubgraphEndpoint.PANCAKESWAP_V3:
        return 'https://gateway.thegraph.com/api/subgraphs/id/A1fvJWQLBeUAggX2WQTMm3FKjXTekNXo77ZySun4YN2m';
      case SubgraphEndpoint.UNISWAP_V3:
        return 'https://gateway.thegraph.com/api/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV';
      default:
        throw new Error('Invalid subgraph endpoint');
    }
  }
}
