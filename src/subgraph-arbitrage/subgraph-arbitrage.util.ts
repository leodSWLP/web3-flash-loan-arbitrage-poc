import { Currency, Token } from '@uniswap/sdk-core';
import { PoolDetail, SubgraphEndpoint, SubgraphUtil } from './subgraph.util';
import { ethers } from 'ethers';
import { RouterUtil } from '../common/router.util';

export class TokenAmount {
  currency: Token;
  amount?: string;

  constructor(currency: Token, amount?: string) {
    this.currency = currency;
    this.amount = amount;
  }

  validate(): void {
    if (!this.currency) {
      throw new Error(
        `Invalid or missing currency: ${this.currency || 'undefined'}`,
      );
    }

    if (!this.amount || this.amount.trim() === '') {
      throw new Error('Amount is empty or undefined');
    }

    try {
      const parsedAmount = BigInt(this.amount);
      if (parsedAmount <= 0) {
        throw new Error(
          `Amount must be a positive number, got: ${this.amount}`,
        );
      }
    } catch (error) {
      throw new Error(`Failed to parse amount as BigInt: ${this.amount}`);
    }
  }
}

export enum RouterType {
  UNISWAP_V3,
  PANCAKESWAP_V3,
}

export class SwapDetail {
  routerType: RouterType;
  routerAddress: string;
  tokenIn: string;
  tokenOut: string;
  fee: bigint;
}

export class ArbitrageResult {
  isProfitable: boolean;
  repayAmount: bigint;
  initialAmount: bigint;
  finalAmount: bigint;
  netProfit: bigint;
  readableNetProfit: string;
  path: string[];
  SwapPath: SwapDetail[];
}

export class Ratio {
  numerator: bigint;
  denominator: bigint;
  feeTier: bigint;
}

export class SubgraphArbitrageUtil {
  static BORROW_COST = 30n; //todo this is not a fix amount for v3
  static BASIS_POINTS = 10000n; // 100% = 10000 basis points

  static async calculateArbitrage(tokenAmounts: TokenAmount[]) {
    tokenAmounts.forEach((tokenAmount) => tokenAmount.validate());
  }

  //Entry Point
  static async calculateAllPaths(tokenAmounts: TokenAmount[]) {
    const [uniswapPools, pancakeswapPools] = await Promise.all([
      SubgraphUtil.fetchSymbolToDetailMap(SubgraphEndpoint.UNISWAP_V3),
      SubgraphUtil.fetchSymbolToDetailMap(SubgraphEndpoint.PANCAKESWAP_V3),
    ]);
    const poolDetailMap = {
      uniswapPools,
      pancakeswapPools,
    };

    const tokens = tokenAmounts.map((item) => item.currency);
    const pathCombinations = await RouterUtil.getAllRoute(tokens);

    const arbitrageResults: ArbitrageResult[] = [];
    for (let i = 0; i < tokenAmounts.length; i++) {
      const tokenKey = `${tokenAmounts[i].currency.symbol}-${tokenAmounts[i].currency.address}`;
      if (!tokenAmounts[i].amount) {
        console.log(`Skip token: ${tokenKey}, reason: Missing AmountIn`);
        continue;
      }
      const combinations = pathCombinations[tokenKey];
      if (!combinations || combinations.length == 0) {
        throw new Error(`Token combinations not found, key: ${tokenKey}`);
      }

      combinations.forEach((tokenPath) => {
        const tokenAmountPaths: TokenAmount[] = tokenPath.map((item) => {
          return new TokenAmount(item);
        });
        tokenAmountPaths[0].amount = tokenAmounts[i].amount;
        arbitrageResults.push(
          this.calculatePairProfit(tokenAmountPaths, poolDetailMap),
        );
      });
    }

    return arbitrageResults;
  }

  static calculatePairProfit(
    tokenAmount: TokenAmount[],
    poolDetailMap: {
      uniswapPools: Map<string, PoolDetail[]>;
      pancakeswapPools: Map<string, PoolDetail[]>;
    },
  ) {
    if (tokenAmount.length !== 3) {
      throw new Error('Only Support 3 symbols');
    }
    const symbols = tokenAmount.map((item) => item.currency.symbol!);

    if (!tokenAmount[0].amount) {
      console.log(
        `Trading Path: [${symbols.join(' -> ')}] missing initialAmount`,
      );
    }

    const arbitrageResult: ArbitrageResult = new ArbitrageResult();

    const repayAmount = ethers.parseUnits(
      tokenAmount[0].amount!,
      tokenAmount[0].currency.decimals,
    );
    const initialAmount =
      (repayAmount * (this.BASIS_POINTS - this.BORROW_COST)) /
      this.BASIS_POINTS; //todo roughly 0.3% fee

    let currentAmount = initialAmount;
    for (let i = 0; i < tokenAmount.length; i++) {
      const tokenIn = tokenAmount[i].currency;
      const tokenOut = tokenAmount[(i + 1) % tokenAmount.length].currency;

      const uniswapRatio = this.getRatio(
        tokenIn,
        tokenOut,
        poolDetailMap.uniswapPools,
      );
      const uniswapTokenOut = this.swap(currentAmount, uniswapRatio);

      const pancakeRatio = this.getRatio(
        tokenIn,
        tokenOut,
        poolDetailMap.pancakeswapPools,
      );
      const pancakeTokenOut = this.swap(currentAmount, pancakeRatio);

      console.log(
        `${tokenIn.symbol} -> ${tokenOut.symbol} -- uniswapTokenOut: ${uniswapTokenOut}`,
      );
      console.log(
        `${tokenIn.symbol} -> ${tokenOut.symbol} -- pancakeTokenOut: ${pancakeTokenOut}`,
      );

      if (uniswapTokenOut > pancakeTokenOut) {
        arbitrageResult.SwapPath = [
          ...(arbitrageResult.SwapPath ?? []),
          {
            routerType: RouterType.UNISWAP_V3,
            routerAddress: 'todo',
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            fee: uniswapRatio.feeTier,
          },
        ];
        currentAmount = uniswapTokenOut;
      } else {
        arbitrageResult.SwapPath = [
          ...(arbitrageResult.SwapPath ?? []),
          {
            routerType: RouterType.PANCAKESWAP_V3,
            routerAddress: 'todo',
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            fee: pancakeRatio.feeTier,
          },
        ];
        currentAmount = pancakeTokenOut;
      }
    }

    arbitrageResult.repayAmount = repayAmount;
    arbitrageResult.initialAmount = initialAmount;
    arbitrageResult.finalAmount = currentAmount;
    arbitrageResult.netProfit = currentAmount - repayAmount;
    arbitrageResult.readableNetProfit = ethers.formatUnits(
      arbitrageResult.netProfit,
      tokenAmount[0].currency.decimals,
    );
    arbitrageResult.path = symbols;
    arbitrageResult.isProfitable = arbitrageResult.netProfit > 0;

    return arbitrageResult;
  }

  private static swap(amountIn: bigint, ratio: Ratio) {
    return (amountIn * ratio.numerator) / ratio.denominator;
  }

  private static getRatio(
    tokenIn: Token,
    tokenOut: Token,
    poolDetailMap: Map<string, PoolDetail[]>,
  ): Ratio {
    const token0 = tokenIn.address < tokenOut.address ? tokenIn : tokenOut;
    const token1 = tokenIn.address > tokenOut.address ? tokenIn : tokenOut;
    const symbol = `${token0.symbol}/${token1.symbol}`;

    const targetPoolDetail = poolDetailMap.get(symbol)?.[0]; //todo check price other then only check fee tier

    if (!targetPoolDetail) {
      throw new Error(
        'Unable to find Corresponding Pair for symbol: ' + symbol,
      );
    }
    const feeTier = targetPoolDetail.feeTier;
    const ratio = targetPoolDetail.swapRate;
    if (tokenIn === token0) {
      return {
        numerator: ratio.numerator * (this.BASIS_POINTS - feeTier),
        denominator: ratio.denominator * this.BASIS_POINTS,
        feeTier: feeTier,
      };
    }

    return {
      numerator: ratio.denominator * (this.BASIS_POINTS - feeTier),
      denominator: ratio.numerator * this.BASIS_POINTS,
      feeTier: feeTier,
    };
  }
}
