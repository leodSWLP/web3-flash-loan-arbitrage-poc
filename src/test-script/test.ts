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
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { FlashLoanTest__factory } from '../typechain-types/factories/contracts/FlashLoanTest__factory';
dotenv.config();

const deploy = async () => {
  const hash =
    await ShareContentLocalStore.getStore().viemWalletClient!.deployContract({
      abi: FlashLoanTest__factory.abi,
      bytecode: FlashLoanTest__factory.bytecode,
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

const callFlashSwap = async () => {
  try {
    const hash =
      await ShareContentLocalStore.getStore().viemWalletClient!.writeContract({
        address: '0xA3ed6D233A2DFF2C472442d06261Bfc558dC8549',
        abi: FlashLoanTest__factory.abi,
        functionName: 'flashArbitrage',
        args: [
          '0x70c132a2ddeccf0d76cc9b64a749ffe375a79a21',
          '0x55d398326f99059ff775485246999027b3197955',
          ethers.parseUnits('500', 18),
          false,
          [
            {
              routerAddress: '0x70c132a2ddeccf0d76cc9b64a749ffe375a79a21',
              tokenIn: '0x70c132a2ddeccf0d76cc9b64a749ffe375a79a21',
              tokenOut: '0x70c132a2ddeccf0d76cc9b64a749ffe375a79a21',
              fee: 500,
            },
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
    // Log detailed error information
    console.error('Transaction failed with error:');

    if (error instanceof ContractFunctionRevertedError) {
      // Handle revert with a specific reason
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

  //   await deploy();
  await callFlashSwap();

  const end = performance.now();
  const ms = end - start; // Time in milliseconds
  const s = ms / 1000; // Time in seconds

  console.log(`Execution time: ${ms.toFixed(2)} ms`);
  console.log(`Execution time: ${s.toFixed(2)} s`);
};

export const account = privateKeyToAccount(
  process.env.WALLET_PRIVATE_KEY as `0x${string}`,
);

export const localhostChain = /*#__PURE__*/ defineChain({
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
