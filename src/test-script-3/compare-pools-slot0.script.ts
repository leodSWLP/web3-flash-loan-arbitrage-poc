import { Address } from 'viem';
import { executeFnWithContent, ChainEnv } from '../test-base/test-base';
import {
  ShareContentLocalStore,
  ShareContentStore,
} from '../async-local-store/share-content-local-store';
import { IPancakeV3Pool__factory } from '../../typechain-types/factories/contracts/quote-v3/interfaces/IPancakeV3Pool__factory';
import * as JSONbig from 'json-bigint';

const v3PoolInformations = [
  {
    address: '0xf2688fb5b81049dfb7703ada5e770543770612c4' as Address,
    description: 'PancakeV3 USDC-WBNB 100',
  },
  {
    address: '0x4141325bac36affe9db165e854982230a14e6d48' as Address,
    description: 'UniswapV3 USDC-WBNB 100',
  },
];
const blockOptions = {
  initalBlockNumber: BigInt(55123095),
  isBackWard: true,
  rounds: 10n,
};

const getSlot0HistoryInPools = async (
  v3Pools: { address: Address; descriptions?: string }[],
  blockOptions: {
    initalBlockNumber: bigint;
    isBackWard: boolean;
    rounds: bigint;
  },
) => {
  const { initalBlockNumber, isBackWard, rounds } = blockOptions;
  const summaries: {
    blockNumber: bigint;
    deltas: number[];
    poolDetails: {
      address: Address;
      description?: string;
      slot0: {
        sqrtPriceX96: bigint;
        tick: number;
        observationIndex: number;
      };
    }[];
  }[] = [];
  for (let i = 0n; i < rounds; i++) {
    const blockNumber = isBackWard
      ? initalBlockNumber - i
      : initalBlockNumber + i;
    const poolDetails = await Promise.all(
      v3Pools.map(async (pool) => {
        return {
          ...pool,
          slot0: await getV3Slot0InBlock(pool.address, blockNumber),
        };
      }),
    );

    const deltas: number[] = [];
    for (let i = 1; i < poolDetails.length; i++) {
      const delta = poolDetails[i].slot0.tick - poolDetails[i - 1].slot0.tick;
      deltas.push(delta);
    }
    summaries.push({
      blockNumber,
      deltas,
      poolDetails,
    });
  }

  console.log(`summaries: ${JSONbig.stringify(summaries, null, 2)}`);
};

const getV3Slot0InBlock = async (
  v3PoolAddress: Address,
  blockNumber?: bigint,
) => {
  const slot0 =
    await ShareContentLocalStore.getStore().viemChainClient.readContract({
      address: v3PoolAddress,
      abi: IPancakeV3Pool__factory.abi,
      functionName: 'slot0',
      args: [],
      blockNumber: blockNumber,
    });

  //   console.log(`slot0: ${slot0}`);
  return {
    sqrtPriceX96: slot0[0],
    tick: slot0[1],
    observationIndex: slot0[2],
  };
};

executeFnWithContent(ChainEnv.production, async () => {
  await getSlot0HistoryInPools(v3PoolInformations, blockOptions);
});
