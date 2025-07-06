import { Abi, Account, Address, Chain, DeployContractParameters } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { V3ArbitrageQuoter__factory } from '../../typechain-types/factories/contracts/quote-v3/V3ArbitrageQuoter__factory';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import { localhostChain } from '../test-script-2/production.v3-quoter.script';

export class ContractUtil {
  static async deploy<
    const abi extends Abi | readonly unknown[],
    chainOverride extends Chain | undefined,
  >(
    args: DeployContractParameters<
      abi,
      Chain | undefined,
      Account | undefined,
      chainOverride
    >,
  ): Promise<Address> {
    const hash =
      await ShareContentLocalStore.getStore().viemWalletClient!.deployContract(
        args,
      );

    console.log('Transaction hash:', hash);

    // Wait for the transaction to be mined
    const receipt =
      await ShareContentLocalStore.getStore().viemChainClient.waitForTransactionReceipt(
        {
          hash,
          timeout: 60000, // 60 seconds
          pollingInterval: 1000,
        },
      );
    const contractAddress = receipt.contractAddress;

    if (!contractAddress) {
      throw new Error(
        'Contract deployment failed: No contract address in receipt',
      );
    }
    console.log('Contract deployed to:', contractAddress);
    return contractAddress;
  }
}
