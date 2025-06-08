import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { ContractAbiUtil } from './contract-abi.util';

class PairInfoUtil {
  static factoryAddress = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';

  static async getPairsInvolvingToken(targetToken: string): Promise<string[]> {
    const bscRpcUrl = process.env.BSC_RPC_URL;
    const provider = new ethers.JsonRpcProvider(bscRpcUrl);
    const factoryABI = await ContractAbiUtil.queryContractAbi(
      this.factoryAddress,
    );

    const factoryContract = new ethers.Contract(
      this.factoryAddress,
      factoryABI,
      provider,
    );

    const totalPairs = await factoryContract.allPairsLength();
    console.log('totalPairs', totalPairs);
    const pairs: string[] = [];
    for (let i = 0; i < Number.parseInt(totalPairs); i++) {
      const pairAddress = await factoryContract.allPairs(i);
      console.log(pairAddress);
      //   const pairContract = new ethers.Contract(
      //     pairAddress,
      //     pairABI,
      //     this.provider
      //   );
      //   const token0 = await pairContract.token0();
      //   const token1 = await pairContract.token1();
      //   if (
      //     token0.toLowerCase() === targetToken.toLowerCase() ||
      //     token1.toLowerCase() === targetToken.toLowerCase()
      //   ) {
      //     pairs.push(pairAddress);
      //   }
    }
    return pairs;
  }
}

dotenv.config();
const targetToken = '0x55d398326f99059fF775485246999027B3197955'; // USDT
PairInfoUtil.getPairsInvolvingToken(targetToken);
