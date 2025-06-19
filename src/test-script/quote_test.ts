import * as dotenv from 'dotenv';
import { ethers } from 'ethers';
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
import { SubgraphEndpoint, SubgraphUtil } from '../subgraph-arbitrage/subgraph.util';
dotenv.config();

const deploy = async () => {
  const hash =
    await ShareContentLocalStore.getStore().viemWalletClient!.deployContract({
      abi: ArbitrageQuote__factory.abi,
      bytecode: ArbitrageQuote__factory.bytecode,
      account: privateKeyToAccount(
        process.env.WALLET_PRIVATE_KEY as `0x${string}`,
      ),
      chain: localhostChain,
    });

  console.log('Transacion hash:', hash);

  // Wait for the transaction to be mined
  const receipt =
    await ShareContentLocalStore.getStore().viemChainClient.waitForTransactionReceipt(
      {
        hash,
        timeout: 60000, // 60 seconds
        pollingInterval: 1000,
      },
    );
  const contractAddress = receipt.contractAddress;

  if (!contractAddress) {
    throw new Error(
      'Contract deployment failed: No contract address in receipt',
    );
  }
  console.log('Contract deployed to:', contractAddress);
};

const fetchDexFeeTierDetail = async () => {
  const [pancakeSwapFeeTierMap, uniswapFeeTierMap] = await Promise.all([SubgraphUtil.fetchSymbolToFeeTierMap(SubgraphEndpoint.PANCAKESWAP_V3),
    SubgraphUtil.fetchSymbolToFeeTierMap(SubgraphEndpoint.UNISWAP_V3)
  ]);

  console.log('done');
}
const callFlashSwap = async () => {
  try {
    const hash =
      await ShareContentLocalStore.getStore().viemWalletClient!.writeContract({
        address: '0xc6dEf9De37012f688f8c114dceFf8E2EA58Ea076',
        abi: ArbitrageQuote__factory.abi,
        functionName: 'quoteBestRoute',
        args: [
          ethers.parseUnits('1', 18),
          [
            {
              "routerAddress": "0xd9c500dff816a1da21a48a732d3498bf09dc9aeb",
              "permit2Address": "0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768",
              "tokenIn": "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
              "tokenOut": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
              "fee": 100
            },
            {
              "routerAddress": "0xd9c500dff816a1da21a48a732d3498bf09dc9aeb",
              "permit2Address": "0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768",
              "tokenIn": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
              "tokenOut": "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
              "fee": 100
            },
            {
              "routerAddress": "0xd9c500dff816a1da21a48a732d3498bf09dc9aeb",
              "permit2Address": "0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768",
              "tokenIn": "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
              "tokenOut": "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
              "fee": 100
            }
          ],
        ],
        account: account,
        chain: localhostChain,
      });
    console.log('Transaction hash:', hash);

    const receipt =
      await ShareContentLocalStore.getStore().viemChainClient.waitForTransactionReceipt(
        { hash },
      );
    console.log('Transaction confirmed in block:', receipt.blockNumber);
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
  // await callFlashSwap();
  await fetchDexFeeTierDetail();
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
