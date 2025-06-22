import { createPublicClient, http, Address, parseAbi } from 'viem';
import { bsc } from 'viem/chains';
import { parseEther } from 'viem';

// Define the ABI for the quoteExactOutputSingle function
const quoterAbi = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96)) external view returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);

// BSC mainnet Quoter contract address
const QUOTER_ADDRESS = '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997' as Address;

// Example token addresses (using WBNB and BUSD as an example)
const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as Address;
const BUSD_ADDRESS = '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56' as Address;

// Initialize the Viem public client for BSC mainnet
const client = createPublicClient({
  chain: bsc,
  transport: http('https://56.rpc.thirdweb.com'),
});

// Main function to call quoteExactOutputSingle
async function getQuoteExactOutputSingle() {
  try {
    // Parameters for quoteExactOutputSingle
    const params = {
      tokenIn: '0x783c3f003f172c6Ac5AC700218a357d2D66Ee2a2' as Address,
      tokenOut: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as Address,
      amount: parseEther('1000'), // 100 BUSD as output
      fee: 100, // 0.05% fee tier
      sqrtPriceLimitX96: BigInt(0), // No price limit
    };

    // Call the quoteExactOutputSingle function
    const [amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate] =
      await client.readContract({
        address: QUOTER_ADDRESS,
        abi: quoterAbi,
        functionName: 'quoteExactInputSingle',
        args: [
          {
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            amount: params.amount,
            fee: params.fee,
            sqrtPriceLimitX96: params.sqrtPriceLimitX96,
          },
        ],
      });

    console.log('Quote Result:');
    console.log(`Amount Out (BUSD): ${amountOut.toString()}`);
    console.log(`Sqrt Price X96 After: ${sqrtPriceX96After.toString()}`);
    console.log(`Initialized Ticks Crossed: ${initializedTicksCrossed}`);
    console.log(`Gas Estimate: ${gasEstimate.toString()}`);

    return {
      amountOut,
      sqrtPriceX96After,
      initializedTicksCrossed,
      gasEstimate,
    };
  } catch (error) {
    console.error('Error fetching quote:', error);
    throw error;
  }
}

// Execute the function
getQuoteExactOutputSingle().catch(console.error);
