import { Currency } from '@pancakeswap/sdk';

export class PancakeCommonUtil {
  static sortToken(tokenA: Currency, tokenB: Currency) {
    return [tokenA, tokenB].sort((a, b) =>
      a.asToken.address.localeCompare(b.asToken.address),
    );
  }
}
