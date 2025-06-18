import * as dotenv from 'dotenv';
import {
  createPublicClient,
  createWalletClient,
  http,
  PrivateKeyAccount,
  PublicClient,
  WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { ShareContentLocalStore } from './async-local-store/share-content-local-store';
import TradeHistoryUtil from './trade-history/trade-history-util';

dotenv.config();

export abstract class AbstractStoreInitializer {
  abstract execute(): Promise<any> | any;

  getChain() {
    return bsc;
  }

  getViemChainClient(): PublicClient {
    return createPublicClient({
      chain: bsc,
      transport: http('https://56.rpc.thirdweb.com'),
    });
  }

  getAccount(): PrivateKeyAccount {
    return privateKeyToAccount(process.env.WALLET_PRIVATE_KEY as `0x${string}`);
  }

  getViemWalletClient(): WalletClient {
    return createWalletClient({
      chain: this.getChain(),
      transport: http('https://56.rpc.thirdweb.com'),
      account: this.getAccount(),
    });
  }

  run() {
    ShareContentLocalStore.initAsyncLocalStore(() => {
      ShareContentLocalStore.getStore().viemChain = bsc;
      ShareContentLocalStore.getStore().viemChainClient =
        this.getViemChainClient();
      ShareContentLocalStore.getStore().viemWalletClient =
        this.getViemWalletClient();
      TradeHistoryUtil.connectToMongoDB(process.env.MONGO_URI!);
    }, this.execute());
  }
}
