import * as dotenv from 'dotenv';
import { ethers } from 'ethers';
import { Address } from 'viem';

import { Token } from '@uniswap/sdk-core';
import {
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { V4ViewOnlyQuoterWithDebug__factory } from '../../typechain-types/factories/contracts/uniswap-v4/V4ViewOnlyQuoterWithDebug__factory';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { BscContractConstant } from '../common/bsc-contract.constant';
import { SubgraphEndpoint, SubgraphUtil } from '../subgraph/subgraph.util';

dotenv.config();

export const account = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`,
);

const deploy = async () => {
  const hash =
    await ShareContentLocalStore.getStore().viemWalletClient!.deployContract({
      abi: V4ViewOnlyQuoterWithDebug__factory.abi,
      bytecode: V4ViewOnlyQuoterWithDebug__factory.bytecode,
      account: account,
      chain: localhostChain,
      args: [
        '0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4',
        '0x7a4a5c919ae2541aed11041a1aeee68f1287f95b',
      ],
    });

  console.log('Transaction hash:', hash);

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
  return contractAddress;
};

const quoteExactInput = async (contractAddress: Address) => {
  try {
    const data =
      await ShareContentLocalStore.getStore().viemChainClient.readContract({
        address: contractAddress,
        abi: V4ViewOnlyQuoterWithDebug__factory.abi,
        functionName: 'quoteExactInput',
        args: [
          {
            poolId:
              '0x4e5943586e4d264812aaf2cd3c36387a803f67677840d6863349c3b7475c67d2',
            tokenIn: '0x0000000000000000000000000000000000000000',
            tokenOut: '0x55d398326f99059ff775485246999027b3197955',
            amountIn: ethers.parseEther('1'),
          },
        ],
      });
    console.log('Read Data:', data);
    console.log(`Readable Output: ${ethers.formatEther(data[0])}`);
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

  const contractAddress = await deploy();
  await quoteExactInput(contractAddress);

  const end = performance.now();
  const ms = end - start;
  const s = ms / 1000;

  console.log(`Execution time: ${ms.toFixed(2)} ms`);
  console.log(`Execution time: ${s.toFixed(2)} s`);
};

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
  transport: http('http://127.0.0.1:8545', { timeout: 180000 }),
});

const viemWalletClient = createWalletClient({
  chain: localhostChain,
  transport: http('http://127.0.0.1:8545'),
  account,
});

const main = () => {
  console.log('run V4 uniswap-quoter.script');
  const runWithShareContentLocalStore = () => {
    ShareContentLocalStore.initAsyncLocalStore(() => {
      ShareContentLocalStore.getStore().viemChain = bsc;
      ShareContentLocalStore.getStore().viemChainClient = viemChainClient;
      ShareContentLocalStore.getStore().viemWalletClient = viemWalletClient;
    }, exec);
  };

  runWithShareContentLocalStore();

  console.log('');
};

if (require.main === module) {
  main();
}
