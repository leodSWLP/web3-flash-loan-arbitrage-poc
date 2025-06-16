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
}

export enum SubgraphEndpoint {
  UNISWAP_V3 = 'https://gateway.thegraph.com/api/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV',
  PANCAKESWAP_V3 = 'https://gateway.thegraph.com/api/subgraphs/id/A1fvJWQLBeUAggX2WQTMm3FKjXTekNXo77ZySun4YN2m',
}

const poolsData = fs.readFileSync('./backup.json', 'utf8');

export class SubgraphUtil {
  private static POOL_SIZE = 150;
  private static DIGITAL_PLACE = 24;
  private static LIST_TOP_POOLS_QUERY = `query {
 pools(first: ${this.POOL_SIZE}, orderBy: volumeUSD, orderDirection: desc) {
    address: id
    token0 {
      symbol
      address: id
      decimals
    }
    token1 {
      symbol
      address: id
      decimals
    }
    token0Price
    token1Price
    volumeUSD
    feeTier
    volumeToken0
    volumeToken1
  }
}`;

  static async fetchSymbolToDetailMap(
    endpoint: SubgraphEndpoint,
  ): Promise<Map<string, PoolDetail[]>> {
    const poolDetails = await this.fetchData(endpoint);
    const map = new Map<string, PoolDetail[]>();
    for (const pool of poolDetails) {
      if (!map.get(pool.symbol)) {
        map.set(pool.symbol, []);
      }
      map.get(pool.symbol)!.push(pool);
      map.get(pool.symbol)!.sort((a, b) => Number(a.feeTier - b.feeTier));
    }
    return map;
  }

  static async fetchData(endpoint: SubgraphEndpoint): Promise<PoolDetail[]> {
    const headers = {
      Authorization: `Bearer ${process.env.SUBGRAPH_API_KEY ?? ''}`,
    };

    let data = JSON.parse(poolsData).data.pools.map((pool) =>
      this.parsePoolDetail(pool),
    );
    return data;

    //todo enable later
    const subgraphUri = this.getSubgraphEndpoint(endpoint);
    try {
      const data = await request(
        subgraphUri,
        this.LIST_TOP_POOLS_QUERY,
        {},
        headers,
      );
      console.log(JSON.stringify(data));

      return data.pools.map((pool) => this.parsePoolDetail(pool));
    } catch (error) {
      console.error('Error fetching data:', error);
    }
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
