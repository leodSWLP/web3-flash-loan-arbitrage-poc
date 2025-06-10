import { CurrencyAmount } from '@pancakeswap/sdk';
import { bscTokens } from '@pancakeswap/tokens';
import * as dotenv from 'dotenv';
import { ethers } from 'ethers';
import { createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { ShareContentLocalStore } from './async-local-store/share-content-local-store';
import { V3ArbitrageUtil } from './pancakeswap-arbitrage/arbitrage/v3-arbitrage.util';
import { SubgraphUtil } from './subgraph-arbitrage/subgraph.util';

dotenv.config();

const exec = async () => {
  const start = performance.now();

  await SubgraphUtil.fetchData(SubgraphUtil.UNISWAP_V3_ENDPOINT);

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
