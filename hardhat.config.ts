import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import * as dotenv from 'dotenv';

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.21',
      },
      {
        version: '0.8.24',
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          },
          viaIR: true,
        },
      },
      {
        version: '0.7.6',
      },
    ],
  },
  networks: {
    bscFork: {
      url: 'http://127.0.0.1:8545', // Hardhat node URL (set when forking)
      chainId: 56, // BSC mainnet chain ID
    },
  },
};

export default config;
