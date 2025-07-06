import { createPublicClient, http, Address, parseAbi, defineChain } from 'viem';
import { bsc } from 'viem/chains';
import { parseEther } from 'viem';

export const localhostChain = defineChain({
  id: 56,
  name: 'Local Hardhat',
  network: 'hardhat',
  nativeCurrency: {
    decimals: 18,
    name: 'Binance Coin',
    symbol: 'BNB',
  },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545'],
    },
    public: {
      http: ['http://127.0.0.1:8545'],
    },
  },
  contracts: {
    multicall3: {
      address: '0xca11bde05977b3631167028862be2a173976ca11',
      blockCreated: 15921452,
    },
  },
});

// ABI for the MultiQuote contract
const multiQuoteAbi = parseAbi([
  'struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }',
  'struct QuoteResult { uint256 amountOut; uint160 sqrtPriceX96After; uint32 initializedTicksCrossed; uint256 gasEstimate; }',
  'function quoteMultipleInputs(QuoteExactInputSingleParams[] memory params, uint256 initialAmountIn) external view returns (QuoteResult[] memory results)',
]);

// Contract and token addresses
const MULTI_QUOTE_ADDRESS =
  '0xa18a7380c32889f3f2581fb95fa2ad20080e8bbe' as Address; // Replace with actual deployed address
const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as Address;
const BUSD_ADDRESS = '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56' as Address;
const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955' as Address;

// Initialize Viem client for BSC mainnet
const client = createPublicClient({
  chain: localhostChain,
  transport: http('http://127.0.0.1:8545'),
});

async function testMultiQuote() {
  try {
    // Example parameters for multiple swaps (WBNB -> BUSD -> USDT)
    const params = [
      {
        tokenIn: WBNB_ADDRESS,
        tokenOut: BUSD_ADDRESS,
        amountIn: BigInt(0), // Will be set by initialAmountIn
        fee: 500, // 0.05% fee
        sqrtPriceLimitX96: BigInt(0),
      },
      {
        tokenIn: BUSD_ADDRESS,
        tokenOut: USDT_ADDRESS,
        amountIn: BigInt(0), // Will be set by previous amountOut
        fee: 500, // 0.05% fee
        sqrtPriceLimitX96: BigInt(0),
      },
    ];

    const initialAmountIn = parseEther('1'); // 1 WBNB as initial input

    // Call the quoteMultipleInputs function
    const results = await client.readContract({
      address: MULTI_QUOTE_ADDRESS,
      abi: multiQuoteAbi,
      functionName: 'quoteMultipleInputs',
      args: [params, initialAmountIn],
    });

    console.log('Multi-Quote Results:');
    results.forEach((result: any, index: number) => {
      console.log(`Swap ${index + 1}:`);
      console.log(`  Amount Out: ${result.amountOut.toString()}`);
      console.log(
        `  Sqrt Price X96 After: ${result.sqrtPriceX96After.toString()}`,
      );
      console.log(
        `  Initialized Ticks Crossed: ${result.initializedTicksCrossed}`,
      );
      console.log(`  Gas Estimate: ${result.gasEstimate.toString()}`);
    });

    return results;
  } catch (error) {
    console.error('Error testing multi-quote:', error);
    throw error;
  }
}

// Execute the test
testMultiQuote().catch(console.error);
