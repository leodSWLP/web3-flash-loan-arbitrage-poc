import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import poolData = require('./pool-info-original.json');

export type OriginalPoolInfo = {
  symbol: string;
  tvl: string;
  feeTier: string;
};

export type FormattedPoolInfo = {
  symbol: string;
  tvl: number;
  feeTier: number;
};

export type FormattedPoolInfoWithDex = {
  dex: 'pancakeswap' | 'uniswap';
} & FormattedPoolInfo;

export type ArbitrageRoute = {
  routeSymbol: string;
  feeTierSum: number;
  routePaths: FormattedPoolInfoWithDex[];
};

const formatDexPoolInfo = (): {
  pancakeswap: FormattedPoolInfo[];
  uniswap: FormattedPoolInfo[];
  full: FormattedPoolInfoWithDex[];
} => {
  const formattedPools: {
    pancakeswap: FormattedPoolInfo[];
    uniswap: FormattedPoolInfo[];
    full: FormattedPoolInfoWithDex[];
  } = {
    pancakeswap: [],
    uniswap: [],
    full: [],
  };

  poolData.pancakeswap.forEach((poolInfo) => {
    const tvl = Number(
      poolInfo.tvl.replace('$ ', '').replaceAll(',', '').split('.')[0],
    );
    const feeTier = parseFloat(poolInfo.feeTier.replace('%', '')) * 100;
    const formattedPoolInfo = {
      symbol: standardizeSymbol(poolInfo.symbol),
      tvl,
      feeTier,
    };

    formattedPools.pancakeswap.push(formattedPoolInfo);
    formattedPools.full.push({
      dex: 'pancakeswap',
      ...formattedPoolInfo,
    });
  });

  poolData.uniswap.forEach((poolInfo) => {
    const tvlValue = poolInfo.tvl.replace('$', '');
    let tvl;
    if (tvlValue.endsWith('M')) {
      tvl = parseFloat(tvlValue.replace('M', '')) * 1_000_000;
    } else if (tvlValue.endsWith('K')) {
      tvl = parseFloat(tvlValue.replace('K', '')) * 1_000;
    }

    const feeTier = parseFloat(poolInfo.feeTier.replace('%', '')) * 100;

    const formattedPoolInfo = {
      symbol: standardizeSymbol(poolInfo.symbol),
      tvl,
      feeTier,
    };

    formattedPools.uniswap.push(formattedPoolInfo);
    formattedPools.full.push({
      dex: 'uniswap',
      ...formattedPoolInfo,
    });
  });

  return formattedPools;
};

const standardizeSymbol = (symbol: string): string => {
  let parsedSymbol = replacePrefix(symbol, 'ETH', 'WETH');
  parsedSymbol = replacePrefix(parsedSymbol, 'BNB', 'WBNB');
  parsedSymbol = parsedSymbol.replace('/ETH', '/WETH').replace('/BNB', '/WBNB');
  return parsedSymbol;
};

const replacePrefix = (str: string, prefix: string, replacement: string) => {
  if (str.startsWith(prefix)) {
    return replacement + str.slice(prefix.length);
  }
  return str;
};

const parseTokens = (symbol: string): [string, string] => {
  return symbol.split('/') as [string, string];
}

// Build a graph from pools
const buildGraph = (
  pools: FormattedPoolInfoWithDex[],
): Map<string, Array<{ to: string; pool: FormattedPoolInfoWithDex }>> => {
  const graph = new Map<
    string,
    Array<{ to: string; pool: FormattedPoolInfoWithDex }>
  >();
  for (const pool of pools) {
    const [token0, token1] = parseTokens(pool.symbol);
    if (!graph.has(token0)) graph.set(token0, []);
    if (!graph.has(token1)) graph.set(token1, []);
    graph.get(token0)!.push({ to: token1, pool });
    graph.get(token1)!.push({ to: token0, pool });
  }
  return graph;
}

// Find common token between two pools
const getCommonToken = (
  pool1: FormattedPoolInfoWithDex,
  pool2: FormattedPoolInfoWithDex,
): string | null => {
  const [token0_1, token1_1] = parseTokens(pool1.symbol);
  const [token0_2, token1_2] = parseTokens(pool2.symbol);
  if (token0_1 === token0_2 || token0_1 === token1_2) return token0_1;
  if (token1_1 === token0_2 || token1_1 === token1_2) return token1_1;
  return null;
}

// Get the token to use from a pool given the previous token
const getNextToken =(
  pool: FormattedPoolInfoWithDex,
  prevToken: string,
): string => {
  const [token0, token1] = parseTokens(pool.symbol);
  return prevToken === token0 ? token1 : token0;
}

// Find all cycles using DFS
const findCycles = (
  graph: Map<string, Array<{ to: string; pool: FormattedPoolInfoWithDex }>>,
  start: string,
  current: string,
  path: { to: string; pool: FormattedPoolInfoWithDex }[],
  visitedPools: Set<string>,
  maxLength: number,
  cycles: ArbitrageRoute[],
) => {
  if (path.length > maxLength) return;
  if (current === start && path.length > 1) {
    // Build routeSymbol by determining pool directions
    const routeTokens: string[] = [start];
    let prevToken = start;
    for (let i = 0; i < path.length; i++) {
      const currentPool = path[i].pool;
      const nextPool = path[(i + 1) % path.length].pool; // Wrap around to first pool
      const commonToken = getCommonToken(currentPool, nextPool);
      if (!commonToken) return; // Invalid route if no common token
      const nextToken = getNextToken(currentPool, prevToken);
      routeTokens.push(nextToken);
      prevToken = nextToken;
    }
    if (routeTokens[routeTokens.length - 1] !== start) return; // Ensure cycle closes
    const routeSymbol = routeTokens.join(' -> ');
    const feeTierSum = path.reduce((sum, p) => sum + p.pool.feeTier, 0);
    const routePaths = path.map((p) => ({ ...p.pool }));
    cycles.push({ routeSymbol, feeTierSum, routePaths });
    return;
  }

  const neighbors = graph.get(current) || [];
  for (const neighbor of neighbors) {
    const poolKey = `${neighbor.pool.dex}-${neighbor.pool.symbol}-${neighbor.pool.feeTier}`;
    if (!visitedPools.has(poolKey)) {
      visitedPools.add(poolKey);
      path.push(neighbor);
      findCycles(
        graph,
        start,
        neighbor.to,
        path,
        visitedPools,
        maxLength,
        cycles,
      );
      path.pop();
      visitedPools.delete(poolKey);
    }
  }
}

// Main function to find arbitrage routes
const findArbitrageRoutes = (
  pools: FormattedPoolInfoWithDex[],
  maxLength: number = 4,
): ArbitrageRoute[] => {
  const graph = buildGraph(pools);
  const cycles: ArbitrageRoute[] = [];

  for (const token of graph.keys()) {
    findCycles(graph, token, token, [], new Set(), maxLength, cycles);
  }

  return cycles;
}

const deduplicateAritrageRoutes = (routes: ArbitrageRoute[]) => {
    const set = new Set<string>();
    const filteredRoutes: ArbitrageRoute[] = []
    routes.forEach(route => {
        const keyArray = route.routePaths.map(path => `${path.dex}-${path.symbol}-${path.feeTier}`);
        const key = keyArray.sort().join('::');
        if (!set.has(key)) {
            filteredRoutes.push(route);
            set.add(key);
        }
    })

    return filteredRoutes;
}

const allPoolData = formatDexPoolInfo();
const allPoolDataPath = join(__dirname, 'pool-data.json');
writeFileSync(allPoolDataPath, JSON.stringify(allPoolData, null, 2), 'utf-8');

// Execute and output results
let routes = findArbitrageRoutes(allPoolData.full);
// console.log(JSON.stringify(routes, null, 2));

routes = routes.filter(route => route.feeTierSum < 11 && route.routePaths.length <= 3).sort((a, b) => a.feeTierSum - b.feeTierSum);
routes = deduplicateAritrageRoutes(routes);

const routesPath = join(__dirname, 'routes.json');
writeFileSync(routesPath, JSON.stringify(routes, null, 2), 'utf-8');
