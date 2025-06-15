import { Token } from '@uniswap/sdk-core';
import { RedisUtil } from '../redis/redis.util';

export class PathCombinations {
  [key: string]: Token[][]; //key format  `${path[0].symbol}-${path[0].address}
}
export class RouterUtil {
  static async getTokenPairSymbol(token0: Token, token1: Token) {
    if (token0.address == token1.address) {
      throw new Error('Invalid token address');
    }
    const symbol =
      token0.address < token1.address
        ? `${token0.symbol}/${token1.symbol}`
        : `${token1.symbol}/${token0.symbol}`;
    return symbol;
  }

  static async getAllRoute(
    tokens: Token[],
    pathLength: number | undefined = 3,
  ) {
    tokens.sort((a, b) => a.symbol!.localeCompare(b.symbol!));
    const key = tokens.reduce(
      (accumulated, current) => `${accumulated}-${current.symbol!}`,
      `${pathLength}-`,
    );
    const cachedPathCombinations = await RedisUtil.getByPrefixOrRegex(key);
    if (cachedPathCombinations?.length > 0) {
      return this.parsePathCombinations(cachedPathCombinations);
    }

    const pathCombinations: PathCombinations = {};

    const pathArrays = this.generatePermutations(tokens, pathLength);
    pathArrays.forEach(
      (path) =>
        (pathCombinations[`${path[0].symbol}-${path[0].address}`] = [
          ...pathCombinations[`${path[0].symbol}-${path[0].address}`],
          path,
        ]),
    );

    await RedisUtil.write(key, JSON.stringify(pathCombinations));
    return pathCombinations;
  }

  private static generatePermutations<T>(elements: T[], length: number): T[][] {
    const result: T[][] = [];

    function permute(current: T[], remaining: T[]) {
      if (current.length === length) {
        result.push([...current]);
        return;
      }

      for (let i = 0; i < remaining.length; i++) {
        const next = remaining[i];
        permute(
          [...current, next],
          [...remaining.slice(0, i), ...remaining.slice(i + 1)],
        );
      }
    }

    permute([], elements);
    return result;
  }

  private static parsePathCombinations(input: object) {
    const pathCombinations: PathCombinations = {};
    Object.entries(input).forEach(([key, value]) => {
      pathCombinations[key] = value.forEach(
        (token) =>
          new Token(token.chainId, token.address, token.decimals, token.symbol),
      );
    });
    return pathCombinations;
  }
}
