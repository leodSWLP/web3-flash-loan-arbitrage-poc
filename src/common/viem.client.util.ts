import { createPublicClient, createWalletClient, http } from 'viem';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { ConfigUtil } from '../config/config.util';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

export class ViemClientUtil {
  static ROTATION_BSC_RPC_URLS: string[] = [];
  static ROTATION_COUNT = 0;

  static getRotatingViemClient() {
    let viemClients =
      ShareContentLocalStore.getStore().rotatingViemChainClients;
    if (!viemClients) {
      this.loadBscRpcUrls();
      viemClients = ShareContentLocalStore.getStore().rotatingViemChainClients =
        this.ROTATION_BSC_RPC_URLS.map((url) =>
          createPublicClient({
            chain: bsc,
            transport: http(url),
          }),
        );
      if (viemClients.length == 0) {
        throw new Error('getRotatingViemClient(): Unable to parse viemClients');
      }
      ShareContentLocalStore.getStore().rotatingViemChainClients = viemClients;
    }

    return viemClients[this.ROTATION_COUNT++ % viemClients.length];
  }

  static getRotatingViemWalletClient() {
    let walletClients =
      ShareContentLocalStore.getStore().rotatingViemWalletClients;
    if (!walletClients) {
      this.loadBscRpcUrls();
      walletClients =
        ShareContentLocalStore.getStore().rotatingViemWalletClients =
          this.ROTATION_BSC_RPC_URLS.map((url) =>
            createWalletClient({
              chain: bsc,
              transport: http(url),
              account: this.getAccount(),
            }),
          );
      if (walletClients.length == 0) {
        throw new Error(
          'getRotatingViemClient(): Unable to parse walletClients',
        );
      }
      ShareContentLocalStore.getStore().rotatingViemWalletClients =
        walletClients;
    }

    return walletClients[this.ROTATION_COUNT++ % walletClients.length];
  }

  private static getAccount() {
    return privateKeyToAccount(
      ConfigUtil.getConfig().WALLET_PRIVATE_KEY as `0x${string}`,
    );
  }

  private static loadBscRpcUrls() {
    if (this.ROTATION_BSC_RPC_URLS.length > 0) {
      return;
    }
    const urls = ConfigUtil.getConfig().ROTATION_BSC_RPC_URLS;

    if (!urls) {
      throw new Error('.env missing ROTATION_BSC_RPC_URLS');
    }

    const urlList = urls.split(',');
    urlList.forEach((url) => {
      if (!url.startsWith('https://')) {
        throw new Error(
          `.env ROTATION_BSC_RPC_URLS should start with https://, invalid url: ${url}`,
        );
      }
    });

    this.ROTATION_BSC_RPC_URLS.push(...urlList);
  }
}
