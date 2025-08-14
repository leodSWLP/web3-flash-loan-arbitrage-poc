import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import dotenv from "dotenv";
import { ConfigUtil } from "../config/config.util";

// Load environment variables

// Retrieve the HTTPS endpoint from environment variables

// Initialize a public client with HTTP transport
const publicClient = createPublicClient({
  chain: sepolia, // Use the desired chain (e.g., sepolia for testnet, mainnet for production)
  transport: http(ConfigUtil.getConfig().BSC_RPC_URL),
});

// Watch for pending transactions
async function watchPendingTxs() {
  console.log("Watching for pending transactions...");

  const unwatch = publicClient.watchPendingTransactions({
    // Poll for new transactions instead of using WebSocket
    poll: true,
    // Polling interval in milliseconds (e.g., every 4 seconds)
    pollingInterval: 4_000,
    // Callback to handle new pending transaction hashes
    onTransactions: async (hashes) => {
      console.log("New pending transaction hashes:", hashes);

      // Optionally, fetch full transaction details for each hash
      for (const hash of hashes) {
          try {
          const transaction = await publicClient.getTransaction({ hash });
          const utcTimestamp = new Date().toUTCString();
          console.log(`[${utcTimestamp}] Transaction details:`, transaction);
        } catch (error) {
          console.error(`Error fetching transaction ${hash}:`, error);
        }
      }
    },
    // Optional: Handle errors
    onError: (error) => {
      console.error("Error watching pending transactions:", error);
    },
  });

  // Optionally, stop watching after a certain period (e.g., 60 seconds)
  setTimeout(() => {
    unwatch();
    console.log("Stopped watching pending transactions.");
  }, 60_000);
}

// Execute the function
watchPendingTxs().catch((error) => {
  console.error("Error:", error);
  process.exitCode = 1;
});