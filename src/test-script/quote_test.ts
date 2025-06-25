import * as dotenv from 'dotenv';
import { ethers } from 'ethers';
import { encodeAbiParameters } from 'viem';

import { Token } from '@uniswap/sdk-core';
import * as JSONbig from 'json-bigint';
import {
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { ArbitrageQuote__factory } from '../../typechain-types/factories/contracts/ArbitrageQuote__factory';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { BscContractConstant } from '../common/bsc-contract.constant';
import { RouterUtil } from '../common/router.util';
import { LogUtil } from '../log/log.util';
import { TokenAmount } from '../subgraph-arbitrage/subgraph-arbitrage.util';
import {
  SubgraphEndpoint,
  SubgraphUtil,
} from '../subgraph-arbitrage/subgraph.util';

dotenv.config();

const formSwapPath = (
  tokens: Token[],
  QuoteDetail: {
    uniswapV3: any;
    pancakeswapV3: any;
  },
) => {
  const swapPath: any[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tokenIn = tokens[i];
    const tokenOut = tokens[(i + 1) % tokens.length];
    const detailMapKey = SubgraphUtil.getDetailMapKey(tokenIn, tokenOut);
    const quoterDetails: any[] = [];
    for (let key of Object.keys(QuoteDetail)) {
      if (!QuoteDetail[key][detailMapKey]) {
        continue;
      }
      quoterDetails.push(QuoteDetail[key][detailMapKey]);
    }
    if (quoterDetails.length == 0) {
      return undefined;
    }
    swapPath.push({
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      quoterDetails,
    });
  }
  return swapPath;
};

const prepareDexV3FeeTierDetail = async () => {
  const [pancakeSwapFeeTierMap, uniswapFeeTierMap] = await Promise.all([
    SubgraphUtil.fetchSymbolToFeeTierMap(SubgraphEndpoint.PANCAKESWAP_V3),
    SubgraphUtil.fetchSymbolToFeeTierMap(SubgraphEndpoint.UNISWAP_V3),
  ]);

  const quoteDetailMaps = {
    uniswapV3: {},
    pancakeswapV3: {},
  };
  [...pancakeSwapFeeTierMap.entries()].forEach(([key, value]) => {
    const uniswapV3 = quoteDetailMaps.uniswapV3;
    uniswapV3[key] = value.map((element) => {
      return {
        feeTier: element.feeTier,
        quoterAddress: BscContractConstant.uniswap.quoter,
        routerAddress: BscContractConstant.uniswap.universalRouter,
      };
    });
  });

  [...uniswapFeeTierMap.entries()].forEach(([key, value]) => {
    const pancakeswapV3 = quoteDetailMaps.pancakeswapV3;
    pancakeswapV3[key] = value.map((element) => {
      return {
        feeTier: element.feeTier,
        quoterAddress: BscContractConstant.pancakeswap.quoter,
        routerAddress: BscContractConstant.pancakeswap.universalRouter,
      };
    });
  });

  return quoteDetailMaps;
};

const quoterDetailType = {
  type: 'tuple',
  components: [
    { name: 'quoterAddress', type: 'address' },
    { name: 'routerAddress', type: 'address' },
    { name: 'fee', type: 'uint24' },
  ],
} as const;

const callFlashSwap = async () => {
  try {
    const swapPaths = [
      {
        tokenIn: '0x55d398326f99059fF775485246999027B3197955' as `0x${string}`,
        tokenOut: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c' as `0x${string}`,
        quoterDetails: encodeAbiParameters(
          [{ type: 'tuple[]', components: quoterDetailType.components }],
          [
            [
              // {
              //   quoterAddress: '0x78D78E420Da98ad378D7799bE8f4AF69033EB077',
              //   routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              //   fee: 100,
              // },
              {
                quoterAddress: '0x78D78E420Da98ad378D7799bE8f4AF69033EB077',
                routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
                fee: 500,
              },
            ],
          ],
        ),
      },
      {
        tokenIn: '0x783c3f003f172c6Ac5AC700218a357d2D66Ee2a2' as `0x${string}`,
        tokenOut: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as `0x${string}`,
        quoterDetails: encodeAbiParameters(
          [{ type: 'tuple[]', components: quoterDetailType.components }],
          [
            [
              {
                quoterAddress: '0x78D78E420Da98ad378D7799bE8f4AF69033EB077',
                routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
                fee: 100,
              },
            ],
          ],
        ),
      },
      {
        tokenIn: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as `0x${string}`,
        tokenOut: '0x55d398326f99059fF775485246999027B3197955' as `0x${string}`,
        quoterDetails: encodeAbiParameters(
          [{ type: 'tuple[]', components: quoterDetailType.components }],
          [
            [
              {
                quoterAddress: '0x78D78E420Da98ad378D7799bE8f4AF69033EB077',
                routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
                fee: 100,
              },
              {
                quoterAddress: '0x78D78E420Da98ad378D7799bE8f4AF69033EB077',
                routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
                fee: 500,
              },
              {
                quoterAddress: '0x78D78E420Da98ad378D7799bE8f4AF69033EB077',
                routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
                fee: 2500,
              },
            ],
          ],
        ),
      },
    ];

    const data =
      await ShareContentLocalStore.getStore().viemChainClient.readContract({
        address: '0xfedea3213842366372c122ea64a5a08d1a9ca458',
        abi: ArbitrageQuote__factory.abi,
        functionName: 'quoteBestRoute',
        args: [ethers.parseUnits('1000', 18), swapPaths],
      });
    console.log('Read Data:', data);
  } catch (error) {
    console.error('Transaction failed with error:');

    if (error instanceof ContractFunctionRevertedError) {
      const { reason, data } = error;
      console.error('Revert reason:', reason || 'No reason provided');
      console.error('Error data:', data);
    } else {
      // Handle other errors (e.g., gas issues, invalid inputs)
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
  }
};

const exec = async () => {
  const start = performance.now();

  // await deploy();
  await callFlashSwap();
  // await prepareQuoteSwapPath([
  //     new TokenAmount(BscTxTokenConstant.usdt, '1000'),
  //     new TokenAmount(BscTxTokenConstant.eth, '0.5'),
  //     new TokenAmount(BscTxTokenConstant.btcb, '0.0001'),
  //     new TokenAmount(BscTxTokenConstant.wbnb, '2'),
  //     new TokenAmount(BscTxTokenConstant.zk, '2000'),
  //     new TokenAmount(BscTxTokenConstant.usdc, '1000'),
  //     new TokenAmount(BscTxTokenConstant.b2, '2000'),
  //     new TokenAmount(BscTxTokenConstant.busd),
  //     new TokenAmount(BscTxTokenConstant.koge),
  //     new TokenAmount(BscTxTokenConstant.cake),
  //     new TokenAmount(BscTxTokenConstant.rlb),
  //     new TokenAmount(BscTxTokenConstant.turbo),
  //     new TokenAmount(BscTxTokenConstant.pndc),
  //     new TokenAmount(BscTxTokenConstant.shib),
  // ]);

  const end = performance.now();
  const ms = end - start;
  const s = ms / 1000;

  console.log(`Execution time: ${ms.toFixed(2)} ms`);
  console.log(`Execution time: ${s.toFixed(2)} s`);
};

export const account = privateKeyToAccount(
  process.env.WALLET_PRIVATE_KEY as `0x${string}`,
);

export const localhostChain = defineChain({
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

const viemChainClient = createPublicClient({
  chain: bsc,
  transport: http('http://127.0.0.1:8545'),
});

const viemWalletClient = createWalletClient({
  chain: localhostChain,
  transport: http('http://127.0.0.1:8545'),
  account,
});

const runWithShareContentLocalStore = () => {
  ShareContentLocalStore.initAsyncLocalStore(() => {
    ShareContentLocalStore.getStore().viemChain = bsc;
    ShareContentLocalStore.getStore().viemChainClient = viemChainClient;
    ShareContentLocalStore.getStore().viemWalletClient = viemWalletClient;
  }, exec);
};

runWithShareContentLocalStore();

console.log('');
