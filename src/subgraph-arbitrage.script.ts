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

dotenv.config();

const exec = async () => {
  const start = performance.now();

  //   await SubgraphUtil.fetchData(SubgraphEndpoint.UNISWAP_V3);
  const tokenAmounts: TokenAmount[] = [
    new TokenAmount(BscTokenConstant.usdt, '100'),
    new TokenAmount(BscTokenConstant.eth),
    new TokenAmount(BscTokenConstant.btcb),
    new TokenAmount(BscTokenConstant.wbnb),
  ];
  const arbitrageResults = await SubgraphArbitrageUtil.calculateAllPaths(
    tokenAmounts,
  );
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
