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
async function getRevertReason(
  txHash: `0x${string}`,
  blockNumber?: bigint,
): Promise<boolean> {
  try {
    // Fetch transaction and receipt
    const transaction = await publicClient.getTransaction({ hash: txHash });
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

    // Check if transaction failed
    if (receipt.status) {
      // console.log('Transaction failed. Simulating to get revert reason...');

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
        return false;
      }
      console.log(`args: ${JSONbig.stringify(args, null, 2)}`)
      // Simulate the transaction at the block it was included in
      try {
        const result = await createPublicClient({
          chain: bsc,
          transport: http(ConfigUtil.getConfig().BSC_RPC_URL),
          // transport: http('http://127.0.0.1:8545', { timeout: 18000 }),
        }).simulateContract({
          account: transaction.from,
          address: transaction.to!,
          // address: '0x3A39a80ccBB9f23127017808112c0F53A08E3cbE' as Address,
          // address: '0x41b0524c100819d33d0f784a5526326ac34906d3' as Address,
          abi: FlashArbitrage__factory.abi,
          functionName,
          args,
          value: transaction.value || 0n,
          blockNumber: blockNumber ?? receipt.blockNumber,
        });
        if (result) {
          console.log('Simulation succeeded unexpectedly. Expected a revert.');
          console.log(`result: ${JSONbig.stringify(result, null, 2)}`);
          return true;
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
            // return data;
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

  return false;
}

const foundBlockDelay = async (txHash: `0x${string}`, startFromBlock) => {
  let blockDelay = 0n;
  while (blockDelay < 10) {
    const isSuccess = await getRevertReason(
      txHash,
      startFromBlock - blockDelay,
    );
    if (isSuccess) {
      break;
    }
    blockDelay++;
  }

  const errorMessage = {
    message: 'Profit opportunity details',
    detectedBlock: Number(startFromBlock - blockDelay),
    expectedExecutionBlock: Number(startFromBlock - blockDelay + 1n),
    actualExecutionBlock: Number(startFromBlock),
    blockDelay: Number(blockDelay - 1n),
  };
  console.log('\n\n---- Profitable Trade Info ----');
  console.log(JSON.stringify(errorMessage, null, 2));
};
// Example usage
const txHash =
  '0xb4d357caa200cc80a02887e3cf67f0d2bb8717b388484924ddb97627ac75df2d';
const blockNumber = BigInt(55824048);
foundBlockDelay(txHash, blockNumber);
