import { Address, createPublicClient, decodeFunctionData, http } from 'viem';
import { bsc, mainnet } from 'viem/chains';
import { FlashArbitrage__factory } from '../../typechain-types/factories/contracts/FlashArbitrage__factory';
import { ConfigUtil } from '../config/config.util';
import { bigint } from 'zod';
import * as JSONbig from 'json-bigint';

// Set up Viem public client
const publicClient = createPublicClient({
  chain: bsc,
  transport: http(ConfigUtil.getConfig().BSC_RPC_URL),
});

// Function to get and decode revert reason
async function checkOwner() {
  // Simulate the transaction at the block it was included in
  try {
    const result = await createPublicClient({
      chain: bsc,
      transport: http(ConfigUtil.getConfig().BSC_RPC_URL),
      // transport: http('http://127.0.0.1:8545', { timeout: 18000 }),
    }).readContract({
      address: ConfigUtil.getConfig()
        .V3_FLASH_LOAN_ARBITRAGE_ADDRESS as Address,
      abi: FlashArbitrage__factory.abi,
      functionName: 'owner',
    });
    if (result) {
      console.log('Owner is :' + result);
    } else {
      console.log(
        'result is undefine, check is the block number correct, or is the target contract is deployed before block number',
      );
    }
  } catch (simulationError) {
    // Check if the error is a contract revert
    if (simulationError.name === 'ContractFunctionExecutionError') {
      const { data } = simulationError.cause;
      if (data) {
        // Decode the revert reason using the ABI

        console.log('Revert reason:', data.errorName);
        console.log(
          'Error inputs:',
          JSON.stringify(data.abiItem.inputs.map((item) => item.name)),
        );
        console.log('Error args:', data.args);
        return data;
      } else {
        console.log('No revert data available.');
      }
    } else {
      console.error('Simulation failed:', simulationError);
    }
  }
}

// Example usage
checkOwner();
