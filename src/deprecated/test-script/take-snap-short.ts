import { request, gql } from 'graphql-request';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();
async function ensureSnapshotsDir() {
  const dir = path.join(__dirname, '../snapshots');
  try {
    await fs.access(dir); // Check if directory exists
  } catch (error) {
    await fs.mkdir(dir, { recursive: true }); // Create directory if it doesn't exist
    console.log('Created snapshots directory');
  }
  return dir;
}

const LIST_TOP_POOLS_QUERY = `query {
    pools(first: 150, orderBy: txCount, orderDirection: desc) {
       address: id
       token0 {
         symbol
         address: id
         decimals
         name
       }
       token1 {
         symbol
         address: id
         decimals
         name
       }
       token0Price
       token1Price
       volumeUSD
       feeTier
       volumeToken0
       volumeToken1
     }
   }`;

async function fetchAndSaveApiSnapshots() {
  const snapshotsDir = await ensureSnapshotsDir();

  const apiCalls = [
    {
      url: 'https://gateway.thegraph.com/api/subgraphs/id/A1fvJWQLBeUAggX2WQTMm3FKjXTekNXo77ZySun4YN2m',
      output: 'pancakeswap-v3-pools.json',
    },
    {
      url: 'https://gateway.thegraph.com/api/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV',
      output: 'uniswap-v3-pools.json',
    },
  ];
  const headers = {
    Authorization: `Bearer ${process.env.SUBGRAPH_API_KEY ?? ''}`,
  };

  for (const { url, output } of apiCalls) {
    try {
      const response = await request(url, LIST_TOP_POOLS_QUERY, {}, headers);
      // Save response to snapshots directory
      const outputPath = path.join(snapshotsDir, output);
      await fs.writeFile(outputPath, JSON.stringify(response, null, 2));
      console.log(`Snapshot saved to ${outputPath}`);
    } catch (error) {
      console.error(`Error fetching ${url} or saving to ${output}:`, error);
    }
  }
}

// Execute the function
fetchAndSaveApiSnapshots();
