import { Currency } from '@pancakeswap/sdk';
import { start } from 'repl';
import { V3SmartRouterUtil } from '../pancakeswap/v3-smart-router.util';
import { ethers } from 'ethers';
import { bscTokens } from '@pancakeswap/tokens';

export class Ratio {
  numerator: bigint;
  denominator: bigint;
}

export class ArbitrageResult {
  isProfitable: boolean;
  repayAmount: bigint;
  initialAmount: bigint;
  finalAmount: bigint;
  netProfit: bigint;
  path: string[];
}

export class ArbitrageUtil {
  static BORROW_COST = 25n; // 0.25% = 25 basis points
  static BASIS_POINTS = 10000n; // 100% = 10000 basis points
  static DECIMAL_SCALE = 1000000000000000000n; // 10^18 for token decimals

  //entries point
  static async calculateArbitrage(currencies: Currency[]) {
    if (currencies.length != 3) {
      throw new Error('calculateArbitrage() only support 3');
    }

    const ratioMap = await this.collectAllPairRatio(currencies);
    const symbols = currencies.map((currency) => currency.symbol);

    return this.calculateCycle(
      symbols,
      ratioMap as any,
      ethers.parseEther('1'),
    );
  }

  private static swap(amountIn: bigint, ratio: Ratio) {
    return (amountIn * ratio.numerator) / ratio.denominator;
  }

  private static getRatio(
    InSymbol: string,
    OutSymbol: string,
    ratioMap: { string; Ratio },
  ) {
    const ratio = ratioMap[`${InSymbol}/${OutSymbol}`];

    if (!ratio) {
      throw new Error('V2ArbitrageUtil: invalid ratio Map');
    }
    return ratio;
  }

  static async collectAllPairRatio(currencies: Currency[]) {
    if (currencies.length != 3) {
      throw new Error('collectAllPairRatio() only support 3');
    }

    const rationMap: { string: Ratio } = {} as any;

    const calculatePair = async (token0: Currency, token1: Currency) => {
      let key = `${token0.symbol}/${token1.symbol}`;
      const trade = await V3SmartRouterUtil.getBestTrade(
        token0,
        ethers.parseEther('1'),
        token1,
      );
      if (!trade) {
        throw new Error('Unable to findTrade');
      }
      rationMap[key] = {
        numerator: trade.inputAmount.numerator / trade.inputAmount.denominator,
        denominator:
          trade.outputAmount.numerator / trade.outputAmount.denominator,
      };
    };
    await Promise.all([
      calculatePair(currencies[0], currencies[1]),
      calculatePair(currencies[1], currencies[0]),
      calculatePair(currencies[1], currencies[2]),
      calculatePair(currencies[2], currencies[1]),
      calculatePair(currencies[2], currencies[0]),
      calculatePair(currencies[0], currencies[2]),
    ]);

    return rationMap;
  }

  static calculateCycle(
    symbols: string[],
    ratioMap: { string; Ratio },
    initialAmount: bigint,
  ) {
    let arbitrageResults: ArbitrageResult[] = [];
    if (symbols.length !== 3) {
      throw new Error('Only Support 3 symbols');
    }

    for (let startSymbol of symbols) {
      let symbol0: string | undefined;
      let symbol1: string | undefined;

      symbols.forEach((symbol) => {
        if (symbol !== startSymbol && !symbol0) {
          symbol0 = symbol;
        } else if (symbol !== startSymbol) {
          symbol1 = symbol;
        }
      });
      if (!symbol0 || !symbol1) {
        throw new Error('calculateArbitrage(): Invalid Symbol');
      }

      if (symbol0 === symbol1) {
        throw new Error('calculateArbitrage(): Symbol should be unique');
      }

      const path1 = [startSymbol, symbol0, symbol1];
      const path2 = [startSymbol, symbol1, symbol0];
      arbitrageResults.push(
        this.calculatePathProfit(path1, ratioMap, initialAmount),
      );
      arbitrageResults.push(
        this.calculatePathProfit(path2, ratioMap, initialAmount),
      );
    }

    arbitrageResults = arbitrageResults.sort((a, b) =>
      Number(b.netProfit - a.netProfit),
    );

    console.log('arbitrageResults: ', arbitrageResults);
    return arbitrageResults;
  }

  private static calculatePathProfit(
    path: string[],
    ratioMap: { string; Ratio },
    initialAmount: bigint,
  ): ArbitrageResult {
    let currentAmount = initialAmount;
    for (let i = 0; i < path.length - 1; i++) {
      const ratio = this.getRatio(path[i], path[i + 1], ratioMap);
      currentAmount = this.swap(currentAmount, ratio);
    }

    const repayAmount =
      (initialAmount * (this.BASIS_POINTS + this.BORROW_COST)) /
      this.BASIS_POINTS;
    const finalAmount = currentAmount;
    const netProfit = finalAmount - repayAmount;
    const isProfitable = netProfit > 0n;

    return {
      isProfitable,
      repayAmount,
      initialAmount,
      finalAmount,
      netProfit,
      path,
    };
  }
}
