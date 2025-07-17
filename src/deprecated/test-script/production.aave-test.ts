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
import { FlashArbitrage__factory } from '../../../typechain-types/factories/contracts/FlashArbitrage__factory';
import { ShareContentLocalStore } from '../../async-local-store/share-content-local-store';
import { ConfigUtil } from '../../config/config.util';
dotenv.config();

const deploy = async () => {
  const hash =
    await ShareContentLocalStore.getStore().viemWalletClient!.deployContract({
      abi: FlashArbitrage__factory.abi,
      bytecode: FlashArbitrage__factory.bytecode,
      account: privateKeyToAccount(
        process.env.WALLET_PRIVATE_KEY as `0x${string}`,
      ),
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
};

const estimateGas = async () => {
  try {
    const gasEstimate =
      await ShareContentLocalStore.getStore().viemChainClient!.estimateContractGas(
        {
          account: privateKeyToAccount(
            ConfigUtil.getConfig().WALLET_PRIVATE_KEY as Address,
          ),
          address: ConfigUtil.getConfig()
            .V3_FLASH_LOAN_ARBITRAGE_ADDRESS as Address,
          abi: FlashArbitrage__factory.abi,
          functionName: 'executeFlashLoan',
          args: [
            '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
            ethers.parseUnits('1', 18),
            // 100000000000000n,
            [
              {
                routerAddress: '0xd9c500dff816a1da21a48a732d3498bf09dc9aeb',
                permit2Address: '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768',
                tokenIn: '0x55d398326f99059fF775485246999027B3197955',
                tokenOut: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
                fee: 100,
              },
              {
                routerAddress: '0xd9c500dff816a1da21a48a732d3498bf09dc9aeb',
                permit2Address: '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768',
                tokenIn: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
                tokenOut: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
                fee: 100,
              },
              {
                routerAddress: '0xd9c500dff816a1da21a48a732d3498bf09dc9aeb',
                permit2Address: '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768',
                tokenIn: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
                tokenOut: '0x55d398326f99059fF775485246999027B3197955',
                fee: 100,
              },
            ],
            0n,
          ],
        },
      );
    console.log('estimateGas:', estimateGas);
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
  await estimateGas();

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
  transport: http(ConfigUtil.getConfig().BSC_RPC_URL, { timeout: 600_000 }),
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
