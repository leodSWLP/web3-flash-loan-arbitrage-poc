# Solidity Flash Loan Arbitrage Trade POC

This is a Proof of Concept (PoC) project for executing flash loan-based arbitrage trades on the Binance Smart Chain (BSC) mainnet, integrating with Uniswap and PancakeSwap V3 & V4. The project leverages Aave flash loans to perform arbitrage without requiring crypto deposits, rolling back non-profitable swaps, with transaction fees as the only cost.

## Project Overview

- **Target Network**: Binance Smart Chain (BSC) mainnet
- **Exchanges**: Uniswap V3 & V4, PancakeSwap V3 & V4
- **Key Features**:
  - Custom smart contract for view-only quotes across all fee tiers, inspired by Uniswap Labs' [view-quoter-v3](https://github.com/Uniswap/view-quoter-v3) project.
  - Utilizes Aave flash loans to initiate trades without crypto deposits.
  - Automatically rolls back transactions for non-profitable swaps.
  - Transaction fees are the only cost incurred.
  - Quotes and executes trades for tokens including USDT, ETH, BTCB, WBNB, USDC, and KOGE.
  - Records profitable trades (profit rate > Aave interest rate of 0.05%) in a local MongoDB collection (`trades.arbitrageresults`).

## Current Progress

- **Completed**:
  - Quote and execute trades using Uniswap and PancakeSwap V3.
- **In Progress**:
  - Quote and execute trades using Uniswap and PancakeSwap V4.
- **Pending**:
  - V4 native token swap implementation.
  - Upgrade V3 quote smart contract from Solidity 0.7 to 0.8 and revamp.
  - Project Refactoring and delete deprecated code and testing script

## Prerequisites

- Node.js and npm installed.
- Docker and Docker Compose installed.
- A BSC-compatible wallet with a private key.
- Access to BSC RPC endpoints (e.g., from providers like Infura, QuickNode, or Ankr).

## Setup Instructions

1. **Install Dependencies**:

   ```bash
   npm install
   ```

2. **Start MongoDB**:
   Run the MongoDB instance using Docker Compose:

   ```bash
   docker compose up -d
   ```

3. **Configure Environment Variables**:
   - Copy the `.env.template` to `.env`:
     ```bash
     cp .env.template .env
     ```
   - Edit the `.env` file and fill in the following:
     - `ROTATION_BSC_RPC_URLS`: Add BSC RPC endpoints in the format `https://uri1,https://uri2` to bypass rate limits.
     - `WALLET_PRIVATE_KEY`: Add your wallet's private key for transaction signing.

4. **Run the Project**:
   Start the arbitrage bot to quote and execute trades:
   ```bash
   npm run start
   ```

## How It Works

- The bot quotes arbitrage opportunities for USDT, ETH, BTCB, WBNB, USDC, and KOGE using a flash loan of 10,000 USDT from Aave as initial value.
- It compares the profit rate of potential trades against Aave's flash loan interest rate (0.05%).
- Profitable trades are executed, and results are recorded in the local MongoDB collection `trades.arbitrageresults`.
- Non-profitable swaps are rolled back to avoid losses, with only transaction fees incurred.

## Notes

- Ensure reliable RPC endpoints to avoid rate-limiting issues.
- The project is a PoC and should be thoroughly tested before deploying with real funds.
- Monitor the MongoDB collection for trade results and verify profitability.

## Future Work

- Complete integration with Uniswap and PancakeSwap V4.
- Implement V4 native token swaps.
- Upgrade the V3 quote smart contract to Solidity 0.8 and optimize its functionality.
