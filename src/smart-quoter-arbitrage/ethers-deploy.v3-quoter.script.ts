import { ethers } from 'ethers';
import { V3Quoter__factory } from '../../typechain-types/factories/contracts/lens/V3Quoter__factory';
import * as dotenv from 'dotenv';

dotenv.config();

async function estimateDeploymentCost() {
  const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL);
  const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY!, provider);
  const contractFactory = new V3Quoter__factory(wallet);

  try {
    const deployTx = await contractFactory.getDeployTransaction();
    const estimatedGas = await provider.estimateGas(deployTx);
    console.log(`Estimated gas: ${estimatedGas.toString()}`);

    const gasLimit = (estimatedGas * BigInt(120)) / BigInt(100);
    console.log(`Gas limit with buffer: ${gasLimit.toString()}`);

    const feeData = await provider.getFeeData();
    let estimatedCost: bigint;

    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      estimatedCost = gasLimit * feeData.maxFeePerGas;
      console.log(
        `Estimated cost (EIP-1559): ${ethers.formatEther(estimatedCost)} ETH`,
      );
    } else if (feeData.gasPrice) {
      estimatedCost = gasLimit * feeData.gasPrice;
      console.log(
        `Estimated cost (legacy): ${ethers.formatEther(estimatedCost)} ETH`,
      );
    } else {
      throw new Error('Unable to fetch gas price or fee data');
    }

    return { gasLimit, estimatedCost };
  } catch (error) {
    console.error('Error during cost estimation:', error);
    throw error;
  }
}

async function deployContract(gasLimit: bigint) {
  const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL);
  const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY!, provider);
  const contractFactory = new V3Quoter__factory(wallet);

  try {
    console.log('Deploying contract...');
    const deployTransaction = await contractFactory.deploy({
      gasPrice: ethers.parseUnits('0.11', 9),
      gasLimit,
    });

    const txResponse = await deployTransaction.deploymentTransaction();
    if (!txResponse) {
      throw new Error('Deployment transaction not available');
    }
    console.log(`Transaction hash: ${txResponse.hash}`);

    const receipt = await txResponse.wait();
    console.log(`Contract deployed at address: ${receipt!.contractAddress}`);
    console.log(`Gas used: ${receipt!.gasUsed.toString()}`);
    console.log(`Transaction fee: ${ethers.formatEther(receipt!.fee)} ETH`);

    const deployedContract = V3Quoter__factory.connect(
      receipt!.contractAddress!,
      wallet,
    );
    console.log(`Contract verified at: ${deployedContract.getAddress()}`);

    return receipt!.contractAddress;
  } catch (error) {
    console.error('Error during deployment:', error);
    if (error.reason?.includes('UNPREDICTABLE_GAS_LIMIT')) {
      console.error(
        'Deployment may revert. Check constructor arguments or contract logic.',
      );
    }
    throw error;
  }
}

async function main() {
  try {
    const { gasLimit } = await estimateDeploymentCost();
    await deployContract(gasLimit);
  } catch (error) {
    console.error('Error in deployment process:', error);
  }
}

main().catch(console.error);