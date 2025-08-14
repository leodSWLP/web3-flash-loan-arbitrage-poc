import { Address, createPublicClient, http } from 'viem';
import { ViemClientUtil } from '../common/viem.client.util';
import { IPancakeV3Pool__factory } from '../../typechain-types/factories/contracts/quote-v3/interfaces/IPancakeV3Pool__factory';
import * as JSONbig from 'json-bigint';
import { ConfigUtil } from '../config/config.util';
import { bsc } from 'viem/chains';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';

export type poolPair = {
  pool0: Address;
  pool1: Address;
};

export type TraceOptions = {
  initalBlockNumber: bigint;
  isBackward: boolean;
  rounds: bigint;
};

export type TraceSummary = {
  blockNumber: bigint;
  delta: number;
  pool0Details: {
    address: Address;
    slot0: {
      sqrtPriceX96: bigint;
      tick: number;
    };
  };
  pool1Details: {
    address: Address;
    slot0: {
      sqrtPriceX96: bigint;
      tick: number;
    };
  };
};

const tokenPair = {
  pool0: '0x47a90A2d92A8367A91EfA1906bFc8c1E05bf10c4' as Address,
  description0: 'uniswap USDT-WBNB 100',
  pool1: '0xf2688fb5b81049dfb7703ada5e770543770612c4' as Address,
  description1: 'pancakeswap USDC-WBNB 100',
};
// "7": 55822649,
// "-8": 55821146
// "-9": 55824047
// "9": 55820290,

const traceOptions = {
  initalBlockNumber: BigInt(55824047),
  isBackward: true,
  rounds: 5000n,
};

const getTickDeltaBlockNumbers = async (
  v3PoolPair: poolPair,
  tickDeltas: number[],
  traceOptions: TraceOptions,
) => {
  let summaries: TraceSummary[] = [];
  let remainingRounds = traceOptions.rounds;
  let currentBlock = traceOptions.initalBlockNumber;
  const tickDeltaToBlockNumber: { [key: number]: bigint[] } = {};
  while (remainingRounds > 0) {
    const searchRounds = remainingRounds < 200n ? remainingRounds : 200n;
    const newSummaries = await getPairSummaries(v3PoolPair, {
      initalBlockNumber: currentBlock,
      isBackward: traceOptions.isBackward,
      rounds: searchRounds,
    });
    newSummaries.forEach((summary) => {
      if (tickDeltas.indexOf(Math.abs(summary.delta)) != -1) {
        tickDeltaToBlockNumber[Math.abs(summary.delta)] = [
          ...tickDeltaToBlockNumber[Math.abs(summary.delta)],
          summary.blockNumber,
        ];
      }
    });

    if (tickDeltas.every((delta) => !!tickDeltaToBlockNumber[delta])) {
      break;
    }

    summaries.push(...newSummaries);
    currentBlock += traceOptions.isBackward ? -200n : 200n;
    remainingRounds -= 200n;

    console.log(
      `tickDeltaToBlockNumber: ${JSONbig.stringify(
        tickDeltaToBlockNumber,
        null,
        2,
      )}`,
    );
    setTimeout(() => {
      console.log('start next round');
    }, 1000);
  }
  return tickDeltaToBlockNumber;
};

const getPairSummaries = async (
  v3PoolPair: poolPair,
  traceOptions: TraceOptions,
) => {
  const { initalBlockNumber, isBackward, rounds } = traceOptions;
  let summaries: TraceSummary[] = [];
  for (let i = 0n; i < rounds; i++) {
    const blockNumber = isBackward
      ? initalBlockNumber - i
      : initalBlockNumber + i;
    const pairSlot0 = await getPairSlot0InBlock(
      v3PoolPair.pool0,
      v3PoolPair.pool1,
      blockNumber,
    );
    const delta = pairSlot0.pool0.tick - pairSlot0.pool1.tick;
    summaries.push({
      blockNumber,
      delta,
      pool0Details: {
        address: v3PoolPair.pool0,
        slot0: pairSlot0.pool0,
      },
      pool1Details: {
        address: v3PoolPair.pool1,
        slot0: pairSlot0.pool1,
      },
    });
  }
  summaries = summaries.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  //   console.log(`summaries: ${JSONbig.stringify(summaries, null, 2)}`);
  return summaries;
};

const getPairSlot0InBlock = async (
  pool0Address: Address,
  pool1Address: Address,
  blockNumber?: bigint,
) => {
  const contracts = [
    {
      address: pool0Address,
      abi: IPancakeV3Pool__factory.abi,
      functionName: 'slot0',
      args: [],
    },
    {
      address: pool1Address,
      abi: IPancakeV3Pool__factory.abi,
      functionName: 'slot0',
      args: [],
    },
  ];

  const slot0s = await ViemClientUtil.getRotatingViemClient().multicall({
    allowFailure: false,
    contracts,
    blockNumber,
  });
  return {
    pool0: {
      sqrtPriceX96: slot0s[0][0],
      tick: slot0s[0][1],
    },
    pool1: {
      sqrtPriceX96: slot0s[1][0],
      tick: slot0s[1][1],
    },
  };
};

const viemChainClient = createPublicClient({
  chain: bsc,
  transport: http(ConfigUtil.getConfig().BSC_RPC_URL),
});

const runWithShareContentLocalStore = () => {
  ShareContentLocalStore.initAsyncLocalStore(
    () => {
      ShareContentLocalStore.getStore().viemChain = bsc;
      ShareContentLocalStore.getStore().viemChainClient = viemChainClient;
    },
    () => {
      getTickDeltaBlockNumbers(tokenPair, [7, 8, 9], traceOptions);
    },
  );
};

runWithShareContentLocalStore();

console.log('');
