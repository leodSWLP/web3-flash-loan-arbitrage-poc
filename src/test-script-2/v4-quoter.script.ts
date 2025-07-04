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
import { V4Quoter__factory } from '../../typechain-types/factories/contracts/quote-v4/V4Quoter__factory';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { BscContractConstant } from '../common/bsc-contract.constant';
import { RouterUtil } from '../common/router.util';
import { LogUtil } from '../log/log.util';
import { TokenAmount } from '../subgraph-arbitrage/subgraph-arbitrage.util';
import {
  SubgraphEndpoint,
  SubgraphUtil,
} from '../subgraph-arbitrage/subgraph.util';

dotenv.config();

const deploy = async () => {
  const hash =
    await ShareContentLocalStore.getStore().viemWalletClient!.deployContract({
      abi: V4Quoter__factory.abi,
      bytecode: V4Quoter__factory.bytecode,
      account: privateKeyToAccount(
        process.env.WALLET_PRIVATE_KEY as `0x${string}`,
      ),
      chain: localhostChain,
      args: [],
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
enum Dex {
  Uniswap,
  PancakeSwap,
}

const callQuote = async () => {
  try {
    const data =
      await ShareContentLocalStore.getStore().viemChainClient.readContract({
        address: '0x95f6a32d1df90d55264daefaa855525daa91ae9b',
        abi: V4Quoter__factory.abi,
        functionName: 'quoteExactInputSingleWithPool',
        args: [
          {
            dex: Dex.Uniswap,
            stateView: '0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4' as Address,
            positionManager:
              '0x7a4a5c919ae2541aed11041a1aeee68f1287f95b' as Address,
            poolId: '0x755c716d1ea331a4a7e99bdee09e5ee8ffd76c860e8e4bbd41facaa6b2a50c87',
            // dex: Dex.PancakeSwap,
            // stateView: '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7' as Address,
            // positionManager: '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7' as Address,
            // poolId: '' as Address,
            tokenIn: '0x55d398326f99059ff775485246999027b3197955' as Address, //USDT
            tokenOut: '0x2170ed0880ac9a755fd29b2688956bd959f933f8' as Address, //ETH
            amountIn: ethers.parseUnits('1000', 18),
            fee: 500,
            sqrtPriceLimitX96: 0n,
          },
        ],
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
  await callQuote();
  // await prepareQuoteSwapPath([
  //     new TokenAmount(BscTxTokenConstant.usdt, '1000'),
  //     new TokenAmount(BscTxTokenConstant.eth, '0.5'),
  //     new TokenAmount(BscTxTokenConstant.btcb, '0.0001'),
  //     new TokenAmount(BscTxTokenConstant.wbnb, '2'),
  //     new TokenAmount(BscTxTokenConstant.zk, '2000'),
  //     new TokenAmount(BscTxTokenConstant.usdc, '1000'),
  //     new TokenAmount(BscTxTokenConstant.b2, '2000'),
  //     new TokenAmount(BscTxTokenConstant.busd),
  //     new TokenAmount(BscTxTokenConstant.koge),
  //     new TokenAmount(BscTxTokenConstant.cake),
  //     new TokenAmount(BscTxTokenConstant.rlb),
  //     new TokenAmount(BscTxTokenConstant.turbo),
  //     new TokenAmount(BscTxTokenConstant.pndc),
  //     new TokenAmount(BscTxTokenConstant.shib),
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

const runWithShareContentLocalStore = () => {
  ShareContentLocalStore.initAsyncLocalStore(() => {
    ShareContentLocalStore.getStore().viemChain = bsc;
    ShareContentLocalStore.getStore().viemChainClient = viemChainClient;
    ShareContentLocalStore.getStore().viemWalletClient = viemWalletClient;
  }, exec);
};

runWithShareContentLocalStore();

console.log('');
