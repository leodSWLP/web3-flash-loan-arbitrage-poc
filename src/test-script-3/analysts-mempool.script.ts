import { createPublicClient, webSocket } from 'viem';
import { mainnet } from 'viem/chains';
import { ConfigUtil } from '../config/config.util';

const publicClient = createPublicClient({
  chain: mainnet,
  transport: webSocket(ConfigUtil.getConfig().BSC_WEBSOCKET_RPC_URL), // Replace with your WebSocket URL
});

async function monitorMempool() {
  const unwatch = publicClient.watchPendingTransactions({
    onTransactions: async (hashes) => {
      for (const hash of hashes) {
        try {
          const transaction = await publicClient.getTransaction({ hash });
          console.log('Pending Transaction:', {
            hash: transaction.hash,
            from: transaction.from,
            to: transaction.to,
            value: transaction.value?.toString(),
            gasPrice: transaction.gasPrice?.toString(),
            nonce: transaction.nonce,
            input: transaction.input,
          });
        } catch (error) {
          console.error(`Error fetching transaction ${hash}:`, error);
        }
      }
    },
    onError: (error) => {
      console.error('Subscription error:', error);
    },
  });
}

monitorMempool().catch(console.error);