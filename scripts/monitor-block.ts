import { config as dotenvConfig } from "dotenv";
import { ethers } from "hardhat";

dotenvConfig();

async function monitorBlock(targetBlock: number): Promise<void> {
  while (true) {
    const currentBlock = await ethers.provider.getBlockNumber();
    console.log("Current block:", currentBlock);
    if (currentBlock >= targetBlock) {
      console.log(`Reached target block ${targetBlock}. Exiting.`);
      process.exit(0);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

const targetBlock = parseInt(process.env.TARGET_BLOCK || process.argv[2]);
monitorBlock(targetBlock).catch((error) => {
  console.error(error);
  process.exit(1);
});
