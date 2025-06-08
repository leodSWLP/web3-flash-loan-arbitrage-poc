import { AsyncLocalStorage } from 'async_hooks';
import Redis from 'ioredis';
import { Assign, Chain, ChainFormatters, Prettify, PublicClient } from 'viem';

export class ShareContentStore {
  viemChain: Prettify<Assign<Chain<undefined>, Chain<ChainFormatters>>>;
  viemChainClient: PublicClient;

  redis: Redis | null | undefined;
}

export class ShareContentLocalStore {
  public static asyncLocalStore = new AsyncLocalStorage<ShareContentStore>();

  static initAsyncLocalStore(setStoreValueFn: () => any, run: () => any) {
    this.asyncLocalStore.run(new ShareContentStore(), () => {
      setStoreValueFn();
      run();
    });
  }

  static getStore(): ShareContentStore {
    const store = this.asyncLocalStore.getStore();
    if (!store) {
      throw new Error('Please Transaction Local Store first');
    }
    return store;
  }
}
