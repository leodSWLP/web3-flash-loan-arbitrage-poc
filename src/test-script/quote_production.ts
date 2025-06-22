import * as dotenv from 'dotenv';
import { ethers } from 'ethers';
import { encodeAbiParameters, encodeDeployData } from 'viem';

import {
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { ArbitrageQuoter__factory } from '../../typechain-types/factories/contracts/ArbitrageQuoter__factory';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { BscTokenConstant } from '../common/bsc-token.constant';
import { SwapPathUtil } from '../quoter-contract-arbitrage/swap-path.util';
import { TokenAmount } from '../subgraph-arbitrage/subgraph-arbitrage.util';

dotenv.config();

const quoterDetailType = {
  type: 'tuple',
  components: [
    { name: 'dexName', type: 'string' },
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
              {
                fee: 100,
                dexName: 'pancakeswap',
                quoterAddress: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
                routerAddress: '0xd9c500dff816a1da21a48a732d3498bf09dc9aeb',
              },
              {
                fee: 500,
                dexName: 'pancakeswap',
                quoterAddress: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
                routerAddress: '0xd9c500dff816a1da21a48a732d3498bf09dc9aeb',
              },
              {
                fee: 2500,
                dexName: 'pancakeswap',
                quoterAddress: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
                routerAddress: '0xd9c500dff816a1da21a48a732d3498bf09dc9aeb',
              },
            ],
          ],
        ),
      },
      {
        tokenIn: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c' as `0x${string}`,
        tokenOut: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as `0x${string}`,
        quoterDetails: encodeAbiParameters(
          [{ type: 'tuple[]', components: quoterDetailType.components }],
          [
            [
              {
                fee: 100,
                dexName: 'pancakeswap',
                quoterAddress: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
                routerAddress: '0xd9c500dff816a1da21a48a732d3498bf09dc9aeb',
              },
              {
                fee: 500,
                dexName: 'pancakeswap',
                quoterAddress: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
                routerAddress: '0xd9c500dff816a1da21a48a732d3498bf09dc9aeb',
              },
              {
                fee: 2500,
                dexName: 'pancakeswap',
                quoterAddress: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
                routerAddress: '0xd9c500dff816a1da21a48a732d3498bf09dc9aeb',
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
                fee: 100,
                dexName: 'pancakeswap',
                quoterAddress: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
                routerAddress: '0xd9c500dff816a1da21a48a732d3498bf09dc9aeb',
              },
              {
                fee: 500,
                dexName: 'pancakeswap',
                quoterAddress: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
                routerAddress: '0xd9c500dff816a1da21a48a732d3498bf09dc9aeb',
              },
            ],
          ],
        ),
      },
    ];

    const data =
      await ShareContentLocalStore.getStore().viemChainClient.readContract({
        address: '0x7A4a47d49F568c18543E93d4FA6880126114cb73',
        abi: ArbitrageQuoter__factory.abi,
        functionName: 'quoteBestRoute',
        args: [ethers.parseUnits('10', 18), swapPaths],
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

  // await estimateDeploymentGas();
  // await deploy();
  // await callFlashSwap();

  await SwapPathUtil.prepareQuoteSwapPath([
    new TokenAmount(BscTokenConstant.usdt, '1000'),
    new TokenAmount(BscTokenConstant.eth),
    new TokenAmount(BscTokenConstant.btcb),
    new TokenAmount(BscTokenConstant.wbnb),
    new TokenAmount(BscTokenConstant.zk),
    new TokenAmount(BscTokenConstant.usdc),
    new TokenAmount(BscTokenConstant.b2),
    new TokenAmount(BscTokenConstant.busd),
    new TokenAmount(BscTokenConstant.koge),
    new TokenAmount(BscTokenConstant.cake),
    new TokenAmount(BscTokenConstant.rlb),
    new TokenAmount(BscTokenConstant.turbo),
    new TokenAmount(BscTokenConstant.pndc),
    new TokenAmount(BscTokenConstant.shib),
  ]);

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
  transport: http(process.env.BSC_RPC_URL, { timeout: 600_000 }),
});

const viemWalletClient = createWalletClient({
  chain: bsc,
  transport: http(process.env.BSC_RPC_URL),
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
