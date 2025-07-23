import * as dotenv from 'dotenv';
import { ethers } from 'ethers';
import {
  Address,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { FlashArbitrageWithDebug__factory } from '../../typechain-types/factories/contracts/FlashArbitrageWithDebug__factory';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { AaveFlashLoanTest__factory } from '../../typechain-types/factories/contracts/AaveFlashLoanTest__factory';
import { BscContractConstant } from '../common/bsc-contract.constant';
dotenv.config();

export const account = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`,
);

const deploy = async () => {
  const hash =
    await ShareContentLocalStore.getStore().viemWalletClient!.deployContract({
      abi: FlashArbitrageWithDebug__factory.abi,
      bytecode: FlashArbitrageWithDebug__factory.bytecode,
      account: account,
      chain: localhostChain,
      args: ['0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D'],
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

const testSwapNativeToken = async (contractAddress: string) => {
  try {
    const hash =
      await ShareContentLocalStore.getStore().viemWalletClient!.writeContract({
        address: contractAddress as Address,
        abi: AaveFlashLoanTest__factory.abi,
        functionName: 'swapNativeToken',
        args: [
          BscContractConstant.uniswap.universalRouter,
          BscContractConstant.uniswapV4.positionManager,
          BscContractConstant.uniswap.permit2,
          '0x4e5943586e4d264812aaf2cd3c36387a803f67677840d6863349c3b7475c67d2',
          '0x0000000000000000000000000000000000000000',
          '0x55d398326f99059ff775485246999027b3197955',
          ethers.parseEther('2'),
        ],
        account,
        chain: localhostChain,
        value: ethers.parseEther('2'),
      });

    console.log('Transaction hash:', hash);

    const receipt =
      await ShareContentLocalStore.getStore().viemChainClient.waitForTransactionReceipt(
        { hash },
      );

    console.log(receipt);
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
  await testSwapNativeToken(contractAddress);

  // await testSwapNativeToken('0x9F96d59262D714126835028Eb898cc64E788ceb9');
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
  transport: http('http://127.0.0.1:8545'),
});

const viemWalletClient = createWalletClient({
  chain: localhostChain,
  transport: http('http://127.0.0.1:8545', { timeout: 60000 }),
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
