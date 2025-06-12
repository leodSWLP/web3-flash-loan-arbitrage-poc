import { Currency, Token } from '@uniswap/sdk-core';
import { SubgraphEndpoint, SubgraphUtil } from './subgraph.util';

export class TradeAmount {
  currency: Currency;
  amount: string;

  constructor(currency: Currency, amount: string) {
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

export class SubgraphArbitrageUtil {
  static BORROW_COST = 25n;
  static BASIS_POINTS = 10000n; // 100% = 10000 basis points

  static async calculateArbitrage(tradeAmounts: TradeAmount[]) {
    tradeAmounts.forEach((tradeAmount) => tradeAmount.validate());

    const [uniswapPools, pancakeswapPools] = await Promise.all([
      SubgraphUtil.fetchSymbolToDetailMap(SubgraphEndpoint.UNISWAP_V3),
      SubgraphUtil.fetchSymbolToDetailMap(SubgraphEndpoint.PANCAKESWAP_V3),
    ]);
  }

  static findAllPossibleRoute(tokens: Token[]) {}
}
