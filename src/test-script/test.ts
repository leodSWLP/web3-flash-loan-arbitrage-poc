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
import { AaveFlashLoanTest__factory } from '../../typechain-types/factories/contracts/AaveFlashLoanTest__factory';
dotenv.config();

const deploy = async () => {
  const hash =
    await ShareContentLocalStore.getStore().viemWalletClient!.deployContract({
      abi: AaveFlashLoanTest__factory.abi,
      bytecode: AaveFlashLoanTest__factory.bytecode,
      account: privateKeyToAccount(
        process.env.WALLET_PRIVATE_KEY as `0x${string}`,
      ),
      chain: localhostChain,
      args: ['0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D'],
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
        address: '0x0ced7bc8e0e5ec747b591480de6efe084ddb7bb5',
        abi: AaveFlashLoanTest__factory.abi,
        functionName: 'executeFlashLoan',
        args: [
          '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
          ethers.parseUnits('3', 18),
          // 100000000000000n,
          [
            {
              routerAddress: '0xd9c500dff816a1da21a48a732d3498bf09dc9aeb',
              permit2Address: '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768',
              tokenIn: '0x55d398326f99059fF775485246999027B3197955',
              tokenOut: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
              fee: 100,
            },
            {
              routerAddress: '0xd9c500dff816a1da21a48a732d3498bf09dc9aeb',
              permit2Address: '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768',
              tokenIn: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
              tokenOut: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
              fee: 500,
            },
            {
              routerAddress: '0xd9c500dff816a1da21a48a732d3498bf09dc9aeb',
              permit2Address: '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768',
              tokenIn: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
              tokenOut: '0x55d398326f99059fF775485246999027B3197955',
              fee: 100,
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

  // await deploy();
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
