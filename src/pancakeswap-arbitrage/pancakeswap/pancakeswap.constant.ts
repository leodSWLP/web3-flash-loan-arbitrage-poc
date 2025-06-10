import { GraphQLClient } from 'graphql-request';

export class PancakeSwapConstant {
  public static v3SubgraphClient = new GraphQLClient(
    'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc',
  );
  public static v2SubgraphClient = new GraphQLClient(
    'https://proxy-worker-api.pancakeswap.com/bsc-exchange',
  );
}
