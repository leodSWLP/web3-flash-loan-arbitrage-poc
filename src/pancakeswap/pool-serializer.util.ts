import { CurrencyAmount, ERC20Token, Percent } from '@pancakeswap/sdk';
import { Pool } from '@pancakeswap/smart-router';

export class PoolSerializerUtil {
  static parseCurrency(currency: any) {
    const parsedCurrency = new ERC20Token(
      currency.chainId,
      currency.address,
      currency.decimals,
      currency.symbol,
      currency.name,
      currency.projectLink,
    );

    return parsedCurrency;
  }

  static parseV2Reserve(reserve: any) {
    const numerator = BigInt(
      reserve.numerator.c ? reserve.numerator.c.join('') : reserve.numerator,
    );
    const denominator = BigInt(
      reserve.denominator.c
        ? reserve.denominator.c.join('')
        : reserve.denominator,
    );
    const currency = this.parseCurrency(reserve.currency);
    const parsedReserve = CurrencyAmount.fromRawAmount(
      currency,
      numerator / denominator,
    );
    return parsedReserve;
  }

  static parseV2Pool(pool: any) {
    pool.reserve0 = this.parseV2Reserve(pool.reserve0);
    pool.reserve1 = this.parseV2Reserve(pool.reserve1);
    return pool as Pool;
  }

  static parseV3Reserve(reserve: any) {
    const currency = this.parseCurrency(reserve.currency);
    console.log('reserve: ', reserve);
    console.log('reserve.numerator: ', reserve.numerator);

    const numerator = BigInt(
      reserve.numerator.c ? reserve.numerator.c.join('') : reserve.numerator,
    );
    const denominator = BigInt(
      reserve.denominator.c
        ? reserve.denominator.c.join('')
        : reserve.denominator,
    );
    const parsedReserve = CurrencyAmount.fromRawAmount(
      currency,
      numerator / denominator,
    );
    return parsedReserve;
  }

  static parseV3Pool(pool: any) {
    pool.reserve0 = this.parseV3Reserve(pool.reserve0);
    pool.reserve1 = this.parseV3Reserve(pool.reserve1);
    pool.token0 = this.parseCurrency(pool.token0);
    pool.token1 = this.parseCurrency(pool.token1);
    Percent;
    return pool as Pool;
  }
}
