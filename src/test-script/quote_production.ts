import * as dotenv from 'dotenv';
import { ethers } from 'ethers';

import {
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { ArbitrageQuoter__factory } from '../../typechain-types/factories/contracts/ArbitrageQuoter__factory';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';

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
                dexName: 'uniswap-v3',
                quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
                routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              },
              {
                fee: 500,
                dexName: 'uniswap-v3',
                quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
                routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              },
              // {
              //   fee: 3000,
              //   dexName: 'uniswap-v3',
              //   quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
              //   routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              // },
              // {
              //   fee: 100,
              //   dexName: 'uniswap-v4',
              //   quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
              //   routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              // },
              // {
              //   fee: 500,
              //   dexName: 'uniswap-v4',
              //   quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
              //   routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              // },
              // {
              //   fee: 1350,
              //   dexName: 'uniswap-v4',
              //   quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
              //   routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              // },
              // {
              //   fee: 3000,
              //   dexName: 'uniswap-v4',
              //   quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
              //   routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              // },
              // {
              //   fee: 10000,
              //   dexName: 'uniswap-v4',
              //   quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
              //   routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              // },
            ],
          ],
        ),
      },
      {
        tokenIn: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c' as `0x${string}`,
        tokenOut: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8' as `0x${string}`,
        quoterDetails: encodeAbiParameters(
          [{ type: 'tuple[]', components: quoterDetailType.components }],
          [
            [
              {
                fee: 500,
                dexName: 'uniswap-v3',
                quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
                routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              },
              // {
              //   fee: 3000,
              //   dexName: 'uniswap-v3',
              //   quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
              //   routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              // },
              // {
              //   fee: 3000,
              //   dexName: 'uniswap-v4',
              //   quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
              //   routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              // },
            ],
          ],
        ),
      },
      {
        tokenIn: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8' as `0x${string}`,
        tokenOut: '0x55d398326f99059fF775485246999027B3197955' as `0x${string}`,
        quoterDetails: encodeAbiParameters(
          [{ type: 'tuple[]', components: quoterDetailType.components }],
          [
            [
              {
                fee: 100,
                dexName: 'uniswap-v3',
                quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
                routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              },
              {
                fee: 500,
                dexName: 'uniswap-v3',
                quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
                routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              },
              // {
              //   fee: 3000,
              //   dexName: 'uniswap-v3',
              //   quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
              //   routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              // },
              // {
              //   fee: 10000,
              //   dexName: 'uniswap-v3',
              //   quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
              //   routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              // },
              // {
              //   fee: 80,
              //   dexName: 'uniswap-v4',
              //   quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
              //   routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              // },
              // {
              //   fee: 90,
              //   dexName: 'uniswap-v4',
              //   quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
              //   routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              // },
              // {
              //   fee: 500,
              //   dexName: 'uniswap-v4',
              //   quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
              //   routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              // },
              // {
              //   fee: 3000,
              //   dexName: 'uniswap-v4',
              //   quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
              //   routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              // },
            ],
          ],
        ),
      },
    ];

    const data =
      await ShareContentLocalStore.getStore().viemChainClient.readContract({
        address: process.env.QUOTE_ADDRESS as Address,
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
  await callFlashSwap();

  // await SwapPathUtil.prepareQuoteSwapPath([
  //   new TokenAmount(BscTxTokenConstant.usdt, '1000'),
  //   new TokenAmount(BscTxTokenConstant.eth),
  //   new TokenAmount(BscTxTokenConstant.btcb),
  //   new TokenAmount(BscTxTokenConstant.wbnb),
  //   new TokenAmount(BscTxTokenConstant.zk),
  //   new TokenAmount(BscTxTokenConstant.usdc),
  //   new TokenAmount(BscTxTokenConstant.b2),
  //   new TokenAmount(BscTxTokenConstant.busd),
  //   new TokenAmount(BscTxTokenConstant.koge),
  //   new TokenAmount(BscTxTokenConstant.cake),
  //   new TokenAmount(BscTxTokenConstant.rlb),
  //   new TokenAmount(BscTxTokenConstant.turbo),
  //   new TokenAmount(BscTxTokenConstant.pndc),
  //   new TokenAmount(BscTxTokenConstant.shib),
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

const rawdata = {
  routingSymbol: 'USDT -> BTCB -> ETH',
  initialAmount: 1000000000000000000000n,
  swapPaths: [
    {
      tokenIn: '0x55d398326f99059fF775485246999027B3197955',
      tokenOut: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
      quoterDetails: [
        {
          fee: 100n,
          dexName: 'uniswap-v3',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
        {
          fee: 500n,
          dexName: 'uniswap-v3',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
        {
          fee: 3000n,
          dexName: 'uniswap-v3',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
        {
          fee: 100n,
          dexName: 'uniswap-v4',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
        {
          fee: 500n,
          dexName: 'uniswap-v4',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
        {
          fee: 1350n,
          dexName: 'uniswap-v4',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
        {
          fee: 3000n,
          dexName: 'uniswap-v4',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
        {
          fee: 10000n,
          dexName: 'uniswap-v4',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
      ],
    },
    {
      tokenIn: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
      tokenOut: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
      quoterDetails: [
        {
          fee: 500n,
          dexName: 'uniswap-v3',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
        {
          fee: 3000n,
          dexName: 'uniswap-v3',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
        {
          fee: 3000n,
          dexName: 'uniswap-v4',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
      ],
    },
    {
      tokenIn: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
      tokenOut: '0x55d398326f99059fF775485246999027B3197955',
      quoterDetails: [
        {
          fee: 100n,
          dexName: 'uniswap-v3',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
        {
          fee: 500n,
          dexName: 'uniswap-v3',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
        {
          fee: 3000n,
          dexName: 'uniswap-v3',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
        {
          fee: 10000n,
          dexName: 'uniswap-v3',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
        {
          fee: 80n,
          dexName: 'uniswap-v4',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
        {
          fee: 90n,
          dexName: 'uniswap-v4',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
        {
          fee: 500n,
          dexName: 'uniswap-v4',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
        {
          fee: 3000n,
          dexName: 'uniswap-v4',
          quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
          routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
        },
      ],
    },
  ],
};
