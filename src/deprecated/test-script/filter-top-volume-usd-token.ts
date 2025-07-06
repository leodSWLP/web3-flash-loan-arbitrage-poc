import * as dotenv from 'dotenv';
import {
  BasicPoolDetail,
  SubgraphEndpoint,
  SubgraphUtil,
} from '../../subgraph/subgraph.util';

dotenv.config();

const main = async () => {
  const map = new Map<
    string,
    {
      token: {
        chainId: number;
        decimals: number;
        symbol?: string;
        isNative: boolean;
        isToken: boolean;
        address: string;
      };
      pairIdSet: Set<string>;
    }
  >();
  const top1000pairs: BasicPoolDetail[] = await SubgraphUtil.fetchPriceData(
    SubgraphEndpoint.UNISWAP_V3,
    1000,
    'volumeUSD',
    false,
  );
  const tokens = top1000pairs.forEach((pair) => {
    const contractKey = pair.address;

    const token0Key = pair.token0.symbol + '-' + pair.token0.address;
    if (!map.has(token0Key)) {
      map.set(token0Key, { token: pair.token0, pairIdSet: new Set<string>() });
    }
    map.get(token0Key)?.pairIdSet.add(contractKey);

    const token1Key = pair.token1.symbol + '-' + pair.token1.address;
    if (!map.has(token1Key)) {
      map.set(token1Key, { token: pair.token1, pairIdSet: new Set<string>() });
    }
    map.get(token1Key)?.pairIdSet.add(contractKey);
  });

  const orderedToken = [...map.values()]
    .sort((a, b) => b.pairIdSet.size - a.pairIdSet.size)
    .slice(95);
  const generatedString = orderedToken
    .map(
      (item) =>
        `
  ${item.token.symbol!.toLowerCase()}: new Token(
      ChainId.BNB,
      '${item.token.address}',
      ${item.token.decimals},
      '${item.token.symbol}',
      '${item.token.symbol}',
  ),
  `,
    )
    .slice(0, 50)
    .join('');

  console.log(generatedString);
};

main();
