import * as dotenv from 'dotenv';
import { createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { ShareContentLocalStore } from './async-local-store/share-content-local-store';
import {
  SubgraphEndpoint,
  SubgraphUtil,
} from './subgraph-arbitrage/subgraph.util';
import {
  SubgraphArbitrageUtil,
  TokenAmount,
} from './subgraph-arbitrage/subgraph-arbitrage.util';
import { BscTokenConstant } from './common/bsc-token.constant';
import * as JSONbig from 'json-bigint';

dotenv.config();

const exec = async () => {
  const start = performance.now();

  //   await SubgraphUtil.fetchData(SubgraphEndpoint.UNISWAP_V3);
  const tokenAmounts: TokenAmount[] = [
    new TokenAmount(BscTokenConstant.usdt, '1000'),
    new TokenAmount(BscTokenConstant.eth, '0.5'),
    new TokenAmount(BscTokenConstant.btcb, '0.0001'),
    new TokenAmount(BscTokenConstant.wbnb, '2'),
    new TokenAmount(BscTokenConstant.zk, '2000'),
    new TokenAmount(BscTokenConstant.usdc, '1000'),
    new TokenAmount(BscTokenConstant.b2, '2000'),
    new TokenAmount(BscTokenConstant.busd),
  ];
  const arbitrageResults = await SubgraphArbitrageUtil.calculateAllPaths(
    tokenAmounts,
    3
  );
  console.log('ArbitrageResult: ' + JSONbig.stringify(arbitrageResults));

  // console.log('ArbitrageResult: ' + JSONbig.stringify(arbitrageResults, null, 4));
  const end = performance.now();
  const ms = end - start; // Time in milliseconds
  const s = ms / 1000; // Time in seconds

  console.log(`Execution time: ${ms.toFixed(2)} ms`);
  console.log(`Execution time: ${s.toFixed(2)} s`);
};

const viemChainClient = createPublicClient({
  chain: bsc,
  transport: http(
    'https://bsc-mainnet.infura.io/v3/246c4b36c59d4eb3a034cf16bd329c2a',
  ),
  batch: {
    multicall: true,
  },
});

const runWithShareContentLocalStore = () => {
  ShareContentLocalStore.initAsyncLocalStore(() => {
    ShareContentLocalStore.getStore().viemChain = bsc;
    ShareContentLocalStore.getStore().viemChainClient = viemChainClient;
  }, exec);
};

runWithShareContentLocalStore();

console.log('');
