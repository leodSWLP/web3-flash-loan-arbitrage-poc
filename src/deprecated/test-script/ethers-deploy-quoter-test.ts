import { ethers } from 'ethers';
import { ArbitrageQuoter__factory } from '../../typechain-types/factories/contracts/ArbitrageQuoter__factory';
import * as dotenv from 'dotenv';

dotenv.config();
async function deployContractAndEstimateCost() {
  // Set up your provider (e.g., connecting to a local node, Infura, or Alchemy)
  const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL); // Replace with your RPC URL

  // Set up a signer (e.g., a wallet with a private key)
  let privateKey = process.env.WALLET_PRIVATE_KEY!;
  const wallet = new ethers.Wallet(privateKey, provider);

  // Create a contract factory using TypeChain's generated factory
  const contractFactory = new ArbitrageQuoter__factory(wallet);

  try {
    // Get deployment transaction for gas estimation (include constructor args if needed)
    const deployTx = await contractFactory.getDeployTransaction();

    // Estimate gas
    const estimatedGas = await provider.estimateGas(deployTx);
    console.log(`Estimated gas: ${estimatedGas.toString()}`);

    // Apply a 20% buffer to gas limit
    const gasLimit = (estimatedGas * BigInt(120)) / BigInt(100);
    console.log(`Gas limit with buffer: ${gasLimit.toString()}`);

    // Get gas price or fee data
    const feeData = await provider.getFeeData();
    let estimatedCost: bigint;

    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      // EIP-1559: use maxFeePerGas for worst-case cost
      estimatedCost = gasLimit * feeData.maxFeePerGas;
      console.log(
        `Estimated cost (EIP-1559): ${ethers.formatEther(estimatedCost)} ETH`,
      );
    } else if (feeData.gasPrice) {
      // Legacy gas price
      estimatedCost = gasLimit * feeData.gasPrice;
      console.log(
        `Estimated cost (legacy): ${ethers.formatEther(estimatedCost)} ETH`,
      );
    } else {
      throw new Error('Unable to fetch gas price or fee data');
    }

    // Add 1 wei to the estimated cost

    // Deploy the contract
    console.log('Deploying contract...');
    const deployTransaction = await contractFactory.deploy({
      gasPrice: ethers.parseUnits('0.11', 9),
      gasLimit: gasLimit,
    });

    // Access the deployment transaction using deploymentTransaction()
    const txResponse = await deployTransaction.deploymentTransaction();
    if (!txResponse) {
      throw new Error('Deployment transaction not available');
    }
    console.log(`Transaction hash: ${txResponse.hash}`);

    // Wait for the transaction to be mined
    const receipt = await txResponse.wait();
    console.log(`Contract deployed at address: ${receipt!.contractAddress}`);
    console.log(`Gas used: ${receipt!.gasUsed.toString()}`);
    console.log(`Transaction fee: ${ethers.formatEther(receipt!.fee)} ETH`);

    // Verify the contract instance
    const deployedContract = ArbitrageQuoter__factory.connect(
      receipt!.contractAddress!,
      wallet,
    );
    console.log(`Contract verified at: ${deployedContract.getAddress()}`);
  } catch (error) {
    console.error('Error during deployment or estimation:', error);
    if (error.reason?.includes('UNPREDICTABLE_GAS_LIMIT')) {
      console.error(
        'Deployment may revert. Check constructor arguments or contract logic.',
      );
    }
  }
}

deployContractAndEstimateCost().catch(console.error);
