import { createPublicClient, defineChain, http } from 'viem';

export class LocalChainConstant {
  static viemChain = defineChain({
    id: 1337,
    // id: 56,
    name: 'Local Foundry',
    network: 'Foundry',
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
  });

  static viemChainClient = createPublicClient({
    chain: LocalChainConstant.viemChain,
    transport: http(),
    batch: {
      multicall: true,
    },
  });
}
