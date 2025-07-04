import { ethers } from 'ethers';
import { V3ArbitrageQuoter__factory } from '../../typechain-types/factories/contracts/V3ArbitrageQuoter__factory';
import { ConfigUtil } from '../config/config.util';

async function estimateDeploymentCost() {
  const provider = new ethers.JsonRpcProvider(
    ConfigUtil.getConfig().BSC_RPC_URL,
  );
  const wallet = new ethers.Wallet(
    ConfigUtil.getConfig().WALLET_PRIVATE_KEY,
    provider,
  );
  const contractFactory = new V3ArbitrageQuoter__factory(wallet);
  const v3QuoterAddress = ConfigUtil.getConfig().V3_QUOTER_ADDRESS;

  if (!v3QuoterAddress) {
    throw new Error('.env missing contract address - V3_QUOTER_ADDRESS');
  }

  try {
    const deployTx = await contractFactory.getDeployTransaction(
      v3QuoterAddress,
    );
    const estimatedGas = await provider.estimateGas(deployTx);
    console.log(`Estimated gas: ${estimatedGas.toString()}`);

    const gasLimit = (estimatedGas * BigInt(120)) / BigInt(100);
    console.log(`Gas limit with buffer: ${gasLimit.toString()}`);

    const feeData = await provider.getFeeData();
    let estimatedCost: bigint;

    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      estimatedCost = gasLimit * feeData.maxFeePerGas;
      console.log(
        `Estimated cost (EIP-1559): ${ethers.formatEther(estimatedCost)} BNB`,
      );
    } else if (feeData.gasPrice) {
      estimatedCost = gasLimit * feeData.gasPrice;
      console.log(
        `Estimated cost (legacy): ${ethers.formatEther(estimatedCost)} BNB`,
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
  if (ConfigUtil.getConfig().V3_ARBITRAGE_QUOTER_ADDRESS) {
    throw new Error(
      'Contract already deployed- please check V3_ARBITRAGE_QUOTER_ADDRESS',
    );
  }
  const provider = new ethers.JsonRpcProvider(
    ConfigUtil.getConfig().BSC_RPC_URL,
  );
  const wallet = new ethers.Wallet(
    ConfigUtil.getConfig().WALLET_PRIVATE_KEY,
    provider,
  );
  const contractFactory = new V3ArbitrageQuoter__factory(wallet);
  const v3QuoterAddress = ConfigUtil.getConfig().V3_QUOTER_ADDRESS;

  if (!v3QuoterAddress) {
    throw new Error('.env missing contract address - V3_QUOTER_ADDRESS');
  }

  try {
    console.log('Deploying contract...');
    const deployTransaction = await contractFactory.deploy(v3QuoterAddress, {
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

    const deployedContract = V3ArbitrageQuoter__factory.connect(
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
    // const { gasLimit } = await estimateDeploymentCost();
    await deployContract(1824889n);
  } catch (error) {
    console.error('Error in deployment process:', error);
  }
}

main().catch(console.error);
