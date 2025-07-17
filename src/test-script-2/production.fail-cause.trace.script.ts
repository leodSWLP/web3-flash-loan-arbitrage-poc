import { createPublicClient, http, decodeErrorResult, decodeFunctionData } from 'viem';
import { mainnet } from 'viem/chains';
import { ConfigUtil } from '../config/config.util';
import { FlashArbitrage__factory } from '../../typechain-types/factories/contracts/FlashArbitrage__factory';


// Set up Viem public client
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(ConfigUtil.getConfig().BSC_RPC_URL),
});

// Function to get and decode revert reason
async function getRevertReason(txHash) {
  try {
    // Fetch transaction and receipt
    const transaction = await publicClient.getTransaction({ hash: txHash });
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

    // Check if transaction failed
    if (receipt.status === 'reverted') {
      console.log('Transaction failed. Simulating to get revert reason...');

      // Decode the function call from transaction input
      let functionName, args;
      try {
        const decoded = decodeFunctionData({
          abi: FlashArbitrage__factory.abi,
          data: transaction.input,
        });
        functionName = decoded.functionName;
        args = decoded.args;
      } catch (decodeError) {
        console.error('Failed to decode transaction input:', decodeError);
        return;
      }

      // Simulate the transaction at the block it was included in
      try {
        await publicClient.simulateContract({
          account: transaction.from,
          address: transaction.to!,
          abi: FlashArbitrage__factory.abi,
          functionName,
          args,
          value: transaction.value || 0n,
          blockNumber: receipt.blockNumber,
        });
        console.log('Simulation succeeded unexpectedly. Expected a revert.');
      } catch (simulationError) {
        // Check if the error is a contract revert
        if (simulationError.name === 'ContractFunctionExecutionError') {
          const { data } = simulationError.cause;
          if (data) {
            // Decode the revert reason using the ABI
            const decodedError = decodeErrorResult({
              abi: FlashArbitrage__factory.abi,
              data,
            });
            console.log('Revert reason:', decodedError.errorName);
            console.log('Error args:', decodedError.args);
            return decodedError;
          } else {
            console.log('No revert data available.');
          }
        } else {
          console.error('Simulation failed:', simulationError);
        }
      }
    } else {
      console.log('Transaction succeeded, no revert reason.');
    }
  } catch (error) {
    console.error('Error fetching transaction:', error);
  }
}

// Example usage
const txHash = '0xc278023a8a37d0689e6a2844462242709649b8c0f2b88e87a9e8642f54ada7b8';
getRevertReason(txHash);