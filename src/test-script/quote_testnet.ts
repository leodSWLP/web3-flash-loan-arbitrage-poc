import * as dotenv from 'dotenv';
import { ethers } from 'ethers';
import { encodeAbiParameters, parseUnits } from 'viem';

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
import {
  SubgraphEndpoint,
  SubgraphUtil,
} from '../subgraph-arbitrage/subgraph.util';
import { BscContractConstant } from '../common/bsc-contract.constant';
import { TokenAmount } from '../subgraph-arbitrage/subgraph-arbitrage.util';
import { RouterUtil } from '../common/router.util';
import { LogUtil } from '../log/log.util';
import { Token } from '@uniswap/sdk-core';
import { BscTokenConstant } from '../common/bsc-token.constant';
import * as JSONbig from 'json-bigint';

dotenv.config();

const deploy = async () => {
  const hash =
    await ShareContentLocalStore.getStore().viemWalletClient!.deployContract({
      abi: ArbitrageQuoter__factory.abi,
      bytecode: ArbitrageQuoter__factory.bytecode,
      account: privateKeyToAccount(
        process.env.WALLET_PRIVATE_KEY as `0x${string}`,
      ),
      chain: bsc,
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

const prepareQuoteSwapPath = async (
  tokenAmounts: TokenAmount[],
  pathLength: number | undefined = 3,
) => {
  const dexV3QuoteDetail = await prepareDexV3FeeTierDetail();
  const tokens = tokenAmounts.map((token) => token.currency);
  const pathCombinations = await RouterUtil.getAllRoute(tokens, pathLength);
  const swapPathCombinations: any[][] = [];
  for (const tokenAmount of tokenAmounts) {
    const combinationsKey = RouterUtil.getCombinationKey(tokenAmount.currency);
    if (!tokenAmount.amount) {
      LogUtil.debug(`Skip token: ${combinationsKey}, reason: Missing AmountIn`);
      continue;
    }

    const combinations = pathCombinations[combinationsKey];
    if (!combinations || combinations.length == 0) {
      LogUtil.debug(`Token combinations not found, key: ${combinationsKey}`);
      continue;
    }
    for (let tokens of combinations) {
      const swapPath = formSwapPath(tokens, dexV3QuoteDetail);
      if (swapPath) {
        swapPathCombinations.push(swapPath);
      }
    }
  }

  console.log(
    'swapPathCombinations: ' + JSONbig.stringify(swapPathCombinations),
  );
  return swapPathCombinations;
};

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
      quoterDetails.push(QuoteDetail[key][detailMapKey][0]);
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
        fee: element.feeTier,
        dexName: 'uniswap',
        quoterAddress: BscContractConstant.uniswap.quoter,
        routerAddress: BscContractConstant.uniswap.universalRouter,
      };
    });
  });

  [...uniswapFeeTierMap.entries()].forEach(([key, value]) => {
    const pancakeswapV3 = quoteDetailMaps.pancakeswapV3;
    pancakeswapV3[key] = value.map((element) => {
      return {
        fee: element.feeTier,
        dexName: 'pancakeswap',
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
        tokenIn: '0x221c5b1a293aac1187ed3a7d7d2d9ad7fe1f3fb0' as `0x${string}`,
        tokenOut: '0xae13d989dac2f0debff460ac112a837c89baa7cd' as `0x${string}`,
        quoterDetails: encodeAbiParameters(
          [{ type: 'tuple[]', components: quoterDetailType.components }],
          [
            [
              {
                fee: 100,
                dexName: 'pancakeswap',
                quoterAddress: '0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2',
                routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
              },
              // {
              //   fee: 10000,
              //   dexName: 'pancakeswap',
              //   quoterAddress: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
              //   routerAddress: '0xd9c500dff816a1da21a48a732d3498bf09dc9aeb',
              // },
            ],
          ],
        ),
      },
      // {
      //   tokenIn: '0x783c3f003f172c6Ac5AC700218a357d2D66Ee2a2' as `0x${string}`,
      //   tokenOut: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as `0x${string}`,
      //   quoterDetails: encodeAbiParameters(
      //     [{ type: 'tuple[]', components: quoterDetailType.components }],
      //     [
      //       [
      //         {
      //           fee: 100,
      //           dexName: 'uniswap',
      //           quoterAddress: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3',
      //           routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
      //         },
      //       ],
      //     ],
      //   ),
      // },
      // {
      //   tokenIn: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as `0x${string}`,
      //   tokenOut: '0x55d398326f99059fF775485246999027B3197955' as `0x${string}`,
      //   quoterDetails: encodeAbiParameters(
      //     [{ type: 'tuple[]', components: quoterDetailType.components }],
      //     [
      //       [
      //         {
      //           fee: 100,
      //           dexName: 'uniswap',
      //           quoterAddress: '0x78D78E420Da98ad378D7799bE8f4AF69033EB077',
      //           routerAddress: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07',
      //         },
      //         // {
      //         //   fee: 100,
      //         //   dexName: 'pancakeswap',
      //         //   quoterAddress: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
      //         //   routerAddress: '0xd9c500dff816a1da21a48a732d3498bf09dc9aeb',
      //         // },
      //       ],
      //     ],
      //   ),
      // },
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

  // await deploy();
  await callFlashSwap();

  // await prepareQuoteSwapPath([
  //   new TokenAmount(BscTokenConstant.usdt, '1000'),
  //   new TokenAmount(BscTokenConstant.eth, '0.5'),
  //   new TokenAmount(BscTokenConstant.btcb, '0.0001'),
  //   new TokenAmount(BscTokenConstant.wbnb, '2'),
  //   new TokenAmount(BscTokenConstant.zk),
  //   new TokenAmount(BscTokenConstant.usdc),
  //   new TokenAmount(BscTokenConstant.b2, '2000'),
  //   new TokenAmount(BscTokenConstant.busd),
  //   new TokenAmount(BscTokenConstant.koge),
  //   new TokenAmount(BscTokenConstant.cake),
  //   new TokenAmount(BscTokenConstant.rlb),
  //   new TokenAmount(BscTokenConstant.turbo),
  //   new TokenAmount(BscTokenConstant.pndc),
  //   new TokenAmount(BscTokenConstant.shib),
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
  transport: http(
    'https://api.zan.top/node/v1/bsc/testnet/0ef6d89279034303b4eef3984df0f249',
    { timeout: 600_000 },
  ),
});

const viemWalletClient = createWalletClient({
  chain: bsc,
  transport: http(
    'https://api.zan.top/node/v1/bsc/testnet/0ef6d89279034303b4eef3984df0f249',
  ),
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
