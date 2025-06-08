import { CurrencyAmount, ERC20Token } from '@pancakeswap/sdk';
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
    const currency = PoolSerializerUtil.parseCurrency(reserve.currency);
    const parsedReserve = CurrencyAmount.fromRawAmount(
      currency,
      BigInt(reserve.numerator.c.join('')) /
        BigInt(reserve.denominator.c.join('')),
    );
    return parsedReserve;
  }

  static parseV2Pool(pool: any) {
    pool.reserve0 = PoolSerializerUtil.parseV2Reserve(pool.reserve0);
    pool.reserve1 = PoolSerializerUtil.parseV2Reserve(pool.reserve1);
    return pool as Pool;
  }

  static parseV3Reserve(reserve: any) {
    const currency = PoolSerializerUtil.parseCurrency(reserve.currency);
    const parsedReserve = CurrencyAmount.fromRawAmount(
      currency,
      BigInt(reserve.numerator.c.join('')),
    );
    return parsedReserve;
  }

  static parseV3Pool(pool: any) {
    pool.reserve0 = PoolSerializerUtil.parseV3Reserve(pool.reserve0);
    pool.reserve1 = PoolSerializerUtil.parseV3Reserve(pool.reserve1);
    return pool as Pool;
  }
}
