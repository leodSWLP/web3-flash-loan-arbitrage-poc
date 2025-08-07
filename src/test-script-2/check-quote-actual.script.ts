import {
  Abi,
  Account,
  Address,
  Chain,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  defineChain,
  DeployContractParameters,
  encodeAbiParameters,
  http,
} from 'viem';
import { bsc } from 'viem/chains';
import { V3ArbitrageQuoter__factory } from '../../typechain-types/factories/contracts/quote-v3/V3ArbitrageQuoter__factory';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { ConfigUtil } from '../config/config.util';
import { V3SmartQuoterUtil } from '../v3-smart-quoter/v3-smart-quoter.util';
import { ContractUtil } from '../common/contract-util';
import { V3Quoter__factory } from '../../typechain-types/factories/contracts/quote-v3/V3Quoter__factory';
import { privateKeyToAccount } from 'viem/accounts';
import { FlashArbitrageWithDebug__factory } from '../../typechain-types/factories/contracts/FlashArbitrageWithDebug__factory';
import { LogUtil } from '../log/log.util';
import { ethers } from 'ethers';
import { BscContractConstant } from '../common/bsc-contract.constant';

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

const quoterDetailType = {
  type: 'tuple',
  components: [
    { name: 'dexName', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'factoryAddress', type: 'address' },
    { name: 'fee', type: 'uint24' },
  ],
} as const;

const quoteDetail = {
  routingSymbol: 'USDT -> BTCB',
  initialAmount: 10000000000000000000000n,
  swapPaths: [
    {
      tokenIn: '0x55d398326f99059fF775485246999027B3197955',
      tokenOut: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
      quoterDetails: [
        {
          fee: 100,
          dexName: 'uniswap',
          version: 'v3',
          factoryAddress:
            '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7' as Address,
        },
        {
          fee: 500,
          dexName: 'uniswap',
          version: 'v3',
          factoryAddress:
            '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7' as Address,
        },
        // {
        //   fee: 3000,
        //   dexName: 'uniswap',
        //   version: 'v3',
        //   factoryAddress:
        //     '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7' as Address,
        // },
        // {
        //   fee: 10000,
        //   dexName: 'uniswap',
        //   version: 'v3',
        //   factoryAddress:
        //     '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7' as Address,
        // },
        {
          fee: 100,
          dexName: 'pancakeswap',
          version: 'v3',
          factoryAddress:
            '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865' as Address,
        },
        {
          fee: 500,
          dexName: 'pancakeswap',
          version: 'v3',
          factoryAddress:
            '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865' as Address,
        },
        // {
        //   fee: 2500,
        //   dexName: 'pancakeswap',
        //   version: 'v3',
        //   factoryAddress:
        //     '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865' as Address,
        // },
      ],
    },
    {
      tokenIn: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
      tokenOut: '0x55d398326f99059fF775485246999027B3197955',
      quoterDetails: [
        {
          fee: 100,
          dexName: 'uniswap',
          version: 'v3',
          factoryAddress:
            '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7' as Address,
        },
        {
          fee: 500,
          dexName: 'uniswap',
          version: 'v3',
          factoryAddress:
            '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7' as Address,
        },
        {
          fee: 100,
          dexName: 'pancakeswap',
          version: 'v3',
          factoryAddress:
            '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865' as Address,
        },
        {
          fee: 500,
          dexName: 'pancakeswap',
          version: 'v3',
          factoryAddress:
            '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865' as Address,
        },
        // {
        //   fee: 2500,
        //   dexName: 'pancakeswap',
        //   version: 'v3',
        //   factoryAddress:
        //     '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865' as Address,
        // },
      ],
    },
  ],
};

const localPrivateKey =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`;
const localAccount = privateKeyToAccount(localPrivateKey);

const callContracts = async () => {
  const v3ArbitrageQuoterAddress = '0x40e5719ccfadd7ac22be441adef336277de69654';
  const aaveArbitrageAddress = '0x96df6728e8086e7aab3205f5a7b8ca0baff6d898';

  const swapPaths: {
    tokenIn: Address;
    tokenOut: Address;
    quoterDetails: `0x${string}`;
  }[] = [];

  quoteDetail.swapPaths.forEach((path) => {
    swapPaths.push({
      tokenIn: path.tokenIn as Address,
      tokenOut: path.tokenOut as Address,
      quoterDetails: encodeAbiParameters(
        [{ type: 'tuple[]', components: quoterDetailType.components }],
        [path.quoterDetails],
      ),
    });
  });

  const bestRoute =
    await ShareContentLocalStore.getStore().viemChainClient.readContract({
      address: v3ArbitrageQuoterAddress,
      abi: V3ArbitrageQuoter__factory.abi,
      functionName: 'quoteBestRoute',
      args: [ethers.parseUnits('10000', 18), swapPaths],
    });

  console.log(bestRoute);

  const swapDetail: {
    routerAddress: Address;
    permit2Address: Address;
    tokenIn: Address;
    tokenOut: Address;
    fee: number;
  }[] = [];

  bestRoute.forEach((route) => {
    swapDetail.push({
      tokenIn: route.tokenIn,
      tokenOut: route.tokenOut,
      fee: route.fee,
      routerAddress:
        route.dexName === 'uniswap'
          ? (BscContractConstant.uniswap.universalRouter as Address)
          : (BscContractConstant.pancakeswap.universalRouter as Address),
      permit2Address:
        route.dexName === 'uniswap'
          ? (BscContractConstant.uniswap.permit2 as Address)
          : (BscContractConstant.pancakeswap.permit2 as Address),
    });
  });
  try {
    const hash =
      await ShareContentLocalStore.getStore().viemWalletClient!.writeContract({
        address: aaveArbitrageAddress,
        abi: FlashArbitrageWithDebug__factory.abi,
        functionName: 'executeFlashLoan',
        args: [bestRoute[0].tokenIn, bestRoute[0].amountIn, swapDetail, 0n],
        account: localAccount,
        chain: localhostChain,
      });

    console.log('Transaction hash:', hash);

    const receipt =
      await ShareContentLocalStore.getStore().viemChainClient.waitForTransactionReceipt(
        { hash },
      );
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

const deployContracts = async () => {
  const v3QuoterAddress = await ContractUtil.deploy({
    abi: V3Quoter__factory.abi,
    bytecode: V3Quoter__factory.bytecode,
    account: localAccount,
    chain: localhostChain,
    args: [],
  });

  const v3ArbitrageQuoterAddress = await ContractUtil.deploy({
    abi: V3ArbitrageQuoter__factory.abi,
    bytecode: V3ArbitrageQuoter__factory.bytecode,
    account: localAccount,
    chain: localhostChain,
    args: [v3QuoterAddress],
  });

  const aaveArbitrageAddress = await ContractUtil.deploy({
    abi: FlashArbitrageWithDebug__factory.abi,
    bytecode: FlashArbitrageWithDebug__factory.bytecode,
    account: localAccount,
    chain: localhostChain,
    args: [ConfigUtil.getConfig().AAVE_FLASH_LOAN_ADDRESS! as `0x${string}`],
  });

  LogUtil.info(`v3QuoterAddress Address: ${v3QuoterAddress}`);
  LogUtil.info(`v3ArbitrageQuoterAddress Address: ${v3ArbitrageQuoterAddress}`);
  LogUtil.info(`aaveArbitrageAddress Address: ${aaveArbitrageAddress}`);
};

const exec = async () => {
  // await deployContracts();
  await callContracts();
  // const quoterCallParam =
  //   await V3SmartQuoterUtil.prepareQuoterCallParam(swapPath);
};

const viemChainClient = createPublicClient({
  chain: bsc,
  transport: http('http://127.0.0.1:8545', { timeout: 180000 }),
});

const viemWalletClient = createWalletClient({
  chain: bsc,
  transport: http('http://127.0.0.1:8545', { timeout: 180000 }),
  account: localAccount,
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
