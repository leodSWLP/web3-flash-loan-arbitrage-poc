import * as dotenv from 'dotenv';
import { ethers } from 'ethers';
import { Address, encodeAbiParameters } from 'viem';

import { Token } from '@uniswap/sdk-core';
import * as JSONbig from 'json-bigint';
import {
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { V3ArbitrageQuoter__factory } from '../../typechain-types/factories/contracts/V3ArbitrageQuoter__factory';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { BscContractConstant } from '../common/bsc-contract.constant';
import { RouterUtil } from '../common/router.util';
import { LogUtil } from '../log/log.util';
import { TokenAmount } from '../subgraph-arbitrage/subgraph-arbitrage.util';
import {
  SubgraphEndpoint,
  SubgraphUtil,
} from '../subgraph-arbitrage/subgraph.util';
import { SmartRouterSwapPathUtil } from '../quoter-contract-arbitrage/smart-router.swap-path.util';
import { BscTxTokenConstant, BscUSDTokenConstant } from '../common/bsc-token.constant';

dotenv.config();

const deploy = async () => {
  const hash =
    await ShareContentLocalStore.getStore().viemWalletClient!.deployContract({
      abi: V3ArbitrageQuoter__factory.abi,
      bytecode: V3ArbitrageQuoter__factory.bytecode,
      account: privateKeyToAccount(
        process.env.WALLET_PRIVATE_KEY as `0x${string}`,
      ),
      chain: localhostChain,
      args: ['0x495735f4becb8336055fe5de5533b85fcb946403'],
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
      quoterDetails.push(QuoteDetail[key][detailMapKey]);
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
        feeTier: element.feeTier,
        quoterAddress: BscContractConstant.uniswap.quoter,
        routerAddress: BscContractConstant.uniswap.universalRouter,
      };
    });
  });

  [...uniswapFeeTierMap.entries()].forEach(([key, value]) => {
    const pancakeswapV3 = quoteDetailMaps.pancakeswapV3;
    pancakeswapV3[key] = value.map((element) => {
      return {
        feeTier: element.feeTier,
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
    { name: 'version', type: 'string' },
    { name: 'factoryAddress', type: 'address' },
    { name: 'routerAddress', type: 'address' },
    { name: 'fee', type: 'uint24' },
  ],
} as const;

const callFlashSwap = async () => {
  try {
    const swapPaths = [
      {
        tokenIn: "0x55d398326f99059fF775485246999027B3197955" as Address,
        tokenOut: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c" as Address,
        quoterDetails: encodeAbiParameters(
          [{ type: 'tuple[]', components: quoterDetailType.components }],
          [
            [
              {
                fee: 100,
                dexName: "uniswap",
                version: "v3",
                factoryAddress: "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7",
                routerAddress: "0x1906c1d672b88cd1b9ac7593301ca990f94eae07",
              },
              {
                fee: 500,
                dexName: "uniswap",
                version: "v3",
                factoryAddress: "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7",
                routerAddress: "0x1906c1d672b88cd1b9ac7593301ca990f94eae07",
              },
              {
                fee: 3000,
                dexName: "uniswap",
                version: "v3",
                factoryAddress: "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7",
                routerAddress: "0x1906c1d672b88cd1b9ac7593301ca990f94eae07",
              },
              {
                fee: 10000,
                dexName: "uniswap",
                version: "v3",
                factoryAddress: "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7",
                routerAddress: "0x1906c1d672b88cd1b9ac7593301ca990f94eae07",
              },
              {
                fee: 100,
                dexName: "pancakeswap",
                version: "v3",
                factoryAddress: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
                routerAddress: "0xd9c500dff816a1da21a48a732d3498bf09dc9aeb",
              },
              {
                fee: 500,
                dexName: "pancakeswap",
                version: "v3",
                factoryAddress: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
                routerAddress: "0xd9c500dff816a1da21a48a732d3498bf09dc9aeb",
              },
              {
                fee: 2500,
                dexName: "pancakeswap",
                version: "v3",
                factoryAddress: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
                routerAddress: "0xd9c500dff816a1da21a48a732d3498bf09dc9aeb",
              },
            ],
          ],
        ),
      },
      {
        tokenIn: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c" as Address,
        tokenOut: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8" as Address,
        quoterDetails: encodeAbiParameters(
          [{ type: 'tuple[]', components: quoterDetailType.components }],
          [
            [
              {
                fee: 500,
                dexName: "uniswap",
                version: "v3",
                factoryAddress: "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7",
                routerAddress: "0x1906c1d672b88cd1b9ac7593301ca990f94eae07",
              },
              {
                fee: 3000,
                dexName: "uniswap",
                version: "v3",
                factoryAddress: "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7",
                routerAddress: "0x1906c1d672b88cd1b9ac7593301ca990f94eae07",
              },
              {
                fee: 100,
                dexName: "pancakeswap",
                version: "v3",
                factoryAddress: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
                routerAddress: "0xd9c500dff816a1da21a48a732d3498bf09dc9aeb",
              },
              {
                fee: 500,
                dexName: "pancakeswap",
                version: "v3",
                factoryAddress: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
                routerAddress: "0xd9c500dff816a1da21a48a732d3498bf09dc9aeb",
              },
              {
                fee: 2500,
                dexName: "pancakeswap",
                version: "v3",
                factoryAddress: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
                routerAddress: "0xd9c500dff816a1da21a48a732d3498bf09dc9aeb",
              },
            ],
          ],
        ),
      },
      {
        tokenIn: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8" as Address,
        tokenOut: "0x55d398326f99059fF775485246999027B3197955" as Address,
        quoterDetails: encodeAbiParameters(
          [{ type: 'tuple[]', components: quoterDetailType.components }],
          [
            [
              {
                fee: 100,
                dexName: "uniswap",
                version: "v3",
                factoryAddress: "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7",
                routerAddress: "0x1906c1d672b88cd1b9ac7593301ca990f94eae07",
              },
              {
                fee: 500,
                dexName: "uniswap",
                version: "v3",
                factoryAddress: "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7",
                routerAddress: "0x1906c1d672b88cd1b9ac7593301ca990f94eae07",
              },
              {
                fee: 3000,
                dexName: "uniswap",
                version: "v3",
                factoryAddress: "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7",
                routerAddress: "0x1906c1d672b88cd1b9ac7593301ca990f94eae07",
              },
              {
                fee: 10000,
                dexName: "uniswap",
                version: "v3",
                factoryAddress: "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7",
                routerAddress: "0x1906c1d672b88cd1b9ac7593301ca990f94eae07",
              },
              {
                fee: 100,
                dexName: "pancakeswap",
                version: "v3",
                factoryAddress: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
                routerAddress: "0xd9c500dff816a1da21a48a732d3498bf09dc9aeb",
              },
              {
                fee: 500,
                dexName: "pancakeswap",
                version: "v3",
                factoryAddress: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
                routerAddress: "0xd9c500dff816a1da21a48a732d3498bf09dc9aeb",
              },
              {
                fee: 2500,
                dexName: "pancakeswap",
                version: "v3",
                factoryAddress: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
                routerAddress: "0xd9c500dff816a1da21a48a732d3498bf09dc9aeb",
              },
            ],
          ],
        ),
      },
    ];

    const data =
      await ShareContentLocalStore.getStore().viemChainClient.readContract({
        address: '0xb3ec6fec49de40eff5026ed41bb812c2cf153da1',
        abi: V3ArbitrageQuoter__factory.abi,
        functionName: 'quoteBestRoute',
        args: [ethers.parseUnits('1000', 18), swapPaths],
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

//   await deploy();
    await callFlashSwap();
  // const tokenAmounts = [
  //     new TokenAmount(BscTxTokenConstant.usdt, '1000'),
  //     new TokenAmount(BscTxTokenConstant.eth, '0.5'),
  //     new TokenAmount(BscTxTokenConstant.btcb, '0.001'),
  //     new TokenAmount(BscTxTokenConstant.wbnb, '2'),
  //     new TokenAmount(BscTxTokenConstant.zk),
  //     new TokenAmount(BscTxTokenConstant.usdc, '1000'),
  //     new TokenAmount(BscTxTokenConstant.b2),
  //     new TokenAmount(BscTxTokenConstant.busd, '1000'),
  //     new TokenAmount(BscTxTokenConstant.koge),
  //     new TokenAmount(BscTxTokenConstant.cake, '500'),
  //     new TokenAmount(BscTxTokenConstant.rlb),
  //     new TokenAmount(BscTxTokenConstant.turbo),
  //     new TokenAmount(BscTxTokenConstant.pndc),
  //     new TokenAmount(BscTxTokenConstant.shib),
  //     new TokenAmount(BscTxTokenConstant.usd1),
  //     new TokenAmount(BscTxTokenConstant.fdusd),
  //     new TokenAmount(BscTxTokenConstant.skyai),
  //     new TokenAmount(BscTxTokenConstant.aiot),
  //     new TokenAmount(BscTxTokenConstant.sol),
  //     new TokenAmount(BscUSDTokenConstant.usdz, '1000'),
  //     new TokenAmount(BscUSDTokenConstant.aicell),
  //     new TokenAmount(BscUSDTokenConstant.obt),
  //     new TokenAmount(BscUSDTokenConstant.htp),
  //     new TokenAmount(BscUSDTokenConstant.skyai),
  //     new TokenAmount(BscUSDTokenConstant.fhe),
  //     new TokenAmount(BscUSDTokenConstant.wsm),
  //     new TokenAmount(BscUSDTokenConstant.cat),
  //     new TokenAmount(BscUSDTokenConstant._1inch),
  //     new TokenAmount(BscUSDTokenConstant.pundiai),
  //     new TokenAmount(BscUSDTokenConstant.gfal),
  //     new TokenAmount(BscUSDTokenConstant.resolv),
  //     new TokenAmount(BscUSDTokenConstant.soph),
  //     new TokenAmount(BscUSDTokenConstant.abra),
  //   ];
  
  //   const RouteDetails = await SmartRouterSwapPathUtil.prepareQuoteSwapPath(tokenAmounts);
  

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
  transport: http('http://127.0.0.1:8545', {timeout: 120_000}),
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
