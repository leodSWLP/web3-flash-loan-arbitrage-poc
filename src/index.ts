import { bscTokens } from '@pancakeswap/tokens';
import { ethers } from 'ethers';
import { createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { ShareContentLocalStore } from './async-local-store/share-content-local-store';
import { V2SmartRouterUtil } from './pancakeswap/v2-smart-router.util';
import * as dotenv from 'dotenv';
import { V3SmartRouterUtil } from './pancakeswap/v3-smart-router.util';
import { ArbitrageUtil, Ratio } from './arbitrage/v2-arbitrage.util';
import { SmartRouter } from '@pancakeswap/smart-router';
import { RedisUtil } from './redis/redis.util';

dotenv.config();

const exec = async () => {
  const start = performance.now();

  // const currencies = [bscTokens.wbnb, bscTokens.usdt, bscTokens.eth];
  // await ArbitrageUtil.calculateArbitrage(currencies);
  await RedisUtil.clearByRegex('*');
  await V3SmartRouterUtil.getBestTrade(bscTokens.wbnb, 1000n, bscTokens.usdt);

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
