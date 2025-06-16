import { Currency, CurrencyAmount } from '@pancakeswap/sdk';
import { V3SmartRouterUtil } from '../pancakeswap/v3-smart-router.util';

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
//todo symbol change back to Currency
export class V3ArbitrageUtil {
  static BORROW_COST = 25n; // 0.25% = 25 basis points
  static BASIS_POINTS = 10000n; // 100% = 10000 basis points

  //entries point
  static async calculateArbitrage(currencyAmounts: CurrencyAmount<Currency>[]) {
    if (currencyAmounts.length > 3) {
      throw new Error('calculateArbitrage() only support less than 3');
    }

    const ratioMap = await this.collectAllPairRatio(currencyAmounts);

    return this.calculateCycle(currencyAmounts, ratioMap as any);
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
      throw new Error('V3ArbitrageUtil: invalid ratio Map');
    }
    return ratio;
  }

  static async collectAllPairRatio(
    currencyAmounts: CurrencyAmount<Currency>[],
  ) {
    if (currencyAmounts.length > 3) {
      throw new Error('collectAllPairRatio() only support less than 3');
    }

    const rationMap: { string: Ratio } = {} as any;

    const calculatePair = async (
      token0: Currency,
      token1: Currency,
      amountIn: bigint,
    ) => {
      let key = `${token0.symbol}/${token1.symbol}`;
      const trade = await V3SmartRouterUtil.getBestTrade(
        token0,
        amountIn,
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
      calculatePair(
        currencyAmounts[0].currency.asToken,
        currencyAmounts[1].currency.asToken,
        currencyAmounts[0].numerator / currencyAmounts[0].denominator,
      ),
      calculatePair(
        currencyAmounts[1].currency.asToken,
        currencyAmounts[0].currency.asToken,
        currencyAmounts[1].numerator / currencyAmounts[1].denominator,
      ),
      calculatePair(
        currencyAmounts[1].currency.asToken,
        currencyAmounts[2].currency.asToken,
        currencyAmounts[1].numerator / currencyAmounts[1].denominator,
      ),
      calculatePair(
        currencyAmounts[2].currency.asToken,
        currencyAmounts[1].currency.asToken,
        currencyAmounts[2].numerator / currencyAmounts[2].denominator,
      ),
      calculatePair(
        currencyAmounts[2].currency.asToken,
        currencyAmounts[0].currency.asToken,
        currencyAmounts[1].numerator / currencyAmounts[1].denominator,
      ),
      calculatePair(
        currencyAmounts[0].currency.asToken,
        currencyAmounts[2].currency.asToken,
        currencyAmounts[0].numerator / currencyAmounts[0].denominator,
      ),
    ]);

    return rationMap;
  }

  static calculateCycle(
    currencyAmounts: CurrencyAmount<Currency>[],
    ratioMap: { string; Ratio },
  ) {
    const symbols = currencyAmounts.map((item) => item.currency.asToken.symbol);
    let arbitrageResults: ArbitrageResult[] = [];
    if (symbols.length > 3) {
      throw new Error('Only Support less than 3 symbols');
    }

    for (let i = 0; i < symbols.length; i++) {
      const startSymbol = symbols[i];
      const startSymbolUnit = currencyAmounts[i].currency.asToken.decimals;
      const initialAmount =
        currencyAmounts[i].numerator / currencyAmounts[i].denominator;
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
        this.calculatePathProfit(
          path1,
          ratioMap,
          //   ethers.parseUnits(initialAmount.toString(), startSymbolUnit), //todo
          initialAmount,
        ),
      );
      arbitrageResults.push(
        this.calculatePathProfit(
          path2,
          ratioMap,
          //   ethers.parseUnits(initialAmount.toString(), startSymbolUnit), //todo
          initialAmount,
        ),
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
    console.log(`Swap() - Path: ${path}, initialAmount: ${initialAmount}`);
    for (let i = 0; i < path.length; i++) {
      const ratio = this.getRatio(
        path[(i + 1) % path.length],
        path[i],
        ratioMap,
      ); // swap USDT to ETH should use (initialAmount * ETH) / USDT, time target first and divided by source, so get TARGET/SOURCE ratio
      currentAmount = this.swap(currentAmount, ratio);
      console.log(
        `Swap() - swapFrom: ${path}[i], swapTo: ${
          path[i + 1]
        }, swapOutputAmount: ${currentAmount}`,
      );
    }

    console.log(`Swap() ----- end ----\n`);

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
