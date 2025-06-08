import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: "0.8.21",
  networks: {
    hardhat: {
      forking: {
        url: process.env.BSC_RPC_URL!,
        blockNumber: process.env.BLOCK_NUMBER
          ? parseInt(process.env.BLOCK_NUMBER)
          : undefined, // Use block number if provided
      },
      chainId: 56, // BSC mainnet chain ID
    },
  },
};

export default config;
