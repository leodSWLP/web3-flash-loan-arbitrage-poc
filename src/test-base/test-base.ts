import { createPublicClient, http, createWalletClient, defineChain } from 'viem';
import { bsc } from 'viem/chains';
import { account } from '../smart-quoter-arbitrage/depercated.recursive.smart-quoter-arbitrage.lookup';
import { privateKeyToAccount } from 'viem/accounts';
import { ConfigUtil } from '../config/config.util';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { LogUtil } from '../log/log.util';

export enum ChainEnv {
  local,
  production,
}


const localhostChain = defineChain({
  id: 56,
  name: 'Local Hardhat',
  network: 'hardhat',
  nativeCurrency: {
    decimals: 18,
    name: 'Binance Coin',
    symbol: 'BNB',
  },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545'],
    },
    public: {
      http: ['http://127.0.0.1:8545'],
    },
  },
  contracts: {
    multicall3: {
      address: '0xca11bde05977b3631167028862be2a173976ca11',
      blockCreated: 15921452,
    },
  },
});

export const executeFnWithContent = async (
  env: ChainEnv,
  exec: () => any | Promise<any>,
) => {
  const account = privateKeyToAccount(
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`,
  ); // this is foundry account, prevent unexpected gas paid

  const uri =
    env == ChainEnv.local
      ? 'http://127.0.0.1:8545'
      : ConfigUtil.getConfig().BSC_RPC_URL;
  const viemChainClient = createPublicClient({
    chain: bsc,
    transport: http(uri, { timeout: 60000 }),
  });

  const viemWalletClient = createWalletClient({
    chain: localhostChain,
    transport: http(uri, { timeout: 60000 }),
    account,
  });

  const runWithShareContentLocalStore = () => {
    ShareContentLocalStore.initAsyncLocalStore(() => {
      ShareContentLocalStore.getStore().viemChain = bsc;
      ShareContentLocalStore.getStore().viemChainClient = viemChainClient;
      ShareContentLocalStore.getStore().viemWalletClient = viemWalletClient;
    }, exec);
  };

  LogUtil.info('---- Start exec() ----');
  runWithShareContentLocalStore();
  LogUtil.info('---- End exec() ----');
};
