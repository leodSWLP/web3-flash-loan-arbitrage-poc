import { request, gql } from 'graphql-request';
import * as fs from 'fs';
import { plainToInstance } from 'class-transformer';
export class PoolDetail {
  id: string;
  token0: {
    id: string;
    symbol: string;
  };
  token0Price: string;
  token1: {
    id: string;
    symbol: string;
  };
  token1Price: string;
  symbol: string;
  swapRate: {
    numerator: bigint;
    denominator: bigint;
  };
}

const poolsData = fs.readFileSync('./backup.txt', 'utf8');

export class SubgraphUtil {
  static UNISWAP_V3_ENDPOINT =
    'https://gateway.thegraph.com/api/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV';
  static PANCAKESWAP_V3_ENDPOINT =
    'https://gateway.thegraph.com/api/subgraphs/id/A1fvJWQLBeUAggX2WQTMm3FKjXTekNXo77ZySun4YN2m';

  private static POOL_SIZE = 100;
  private static LIST_TOP_POOLS_QUERY = `query {
  pools(first: ${this.POOL_SIZE}, orderBy: volumeUSD orderDirection: desc) {
    id
    token0 { symbol, id }
    token1 { symbol, id }
    token0Price
    token1Price
  }
}`;

  static async fetchData(endpoint: string) {
    const headers = {
      Authorization: `Bearer ${process.env.SUBGRAPH_API_KEY ?? ''}`,
    };
    let data = JSON.parse(poolsData).pools.map((pool) =>
      this.parsePoolDetail(pool),
    );
    return data;

    // try {
    //   const data = await request(
    //     endpoint,
    //     this.LIST_TOP_POOLS_QUERY,
    //     {},
    //     headers,
    //   );
    //   console.log(JSON.stringify(data));
    //   return data;
    // } catch (error) {
    //   console.error('Error fetching data:', error);
    // }
  }

  private static parsePoolDetail(pool: any) {
    const poolDetail = plainToInstance(PoolDetail, pool);
    if (
      typeof poolDetail.token0Price !== 'string' ||
      typeof poolDetail.token1Price !== 'string'
    ) {
      throw Error('Unable to Parse Pool Information: ' + JSON.stringify(pool));
    }

    poolDetail.symbol = `${poolDetail.token0.symbol}/${poolDetail.token1.symbol}`;
    poolDetail.swapRate = {
      numerator: this.stringPriceToBigInt(poolDetail.token0Price),
      denominator: this.stringPriceToBigInt(poolDetail.token1Price),
    };

    return poolDetail;
  }

  private static stringPriceToBigInt(priceInString: string) {
    const [integerPart, fractionalPart = ''] = priceInString.split('.');
    const combined = integerPart + fractionalPart.padEnd(18, '0').slice(0, 18); // Take first 18 decimal places
    const result = BigInt(combined);
    return result;
  }
}
