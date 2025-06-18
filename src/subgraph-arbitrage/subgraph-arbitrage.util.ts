import { Currency, Token } from '@uniswap/sdk-core';
import { PoolDetail, SubgraphEndpoint, SubgraphUtil } from './subgraph.util';
import { ethers } from 'ethers';
import { RouterUtil } from '../common/router.util';
import { LogUtil } from '../log/log.util';

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
  permit2Address: string;
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
  profitRate: string;
  path: string[];
  SwapPath: SwapDetail[];
}

export class Ratio {
  numerator: bigint;
  denominator: bigint;
  feeTier: bigint;
}

export class SubgraphArbitrageUtil {
  static AAVE_BORROW_COST = 500n; //todo this is not a fix amount for v3
  static BASIS_POINTS = 1000000n; // 100% = 10000 basis points

  static async calculateArbitrage(tokenAmounts: TokenAmount[]) {
    tokenAmounts.forEach((tokenAmount) => tokenAmount.validate());
  }
  //Entry Point
  static async calculateAllPaths(
    tokenAmounts: TokenAmount[],
    pathLength: number | undefined = 3,
  ) {
    const [uniswapPools, pancakeswapPools] = await Promise.all([
      SubgraphUtil.fetchSymbolToDetailMap(SubgraphEndpoint.UNISWAP_V3),
      SubgraphUtil.fetchSymbolToDetailMap(SubgraphEndpoint.PANCAKESWAP_V3),
    ]);
    const poolDetailMap = {
      uniswapPools,
      pancakeswapPools,
    };

    const tokens = tokenAmounts.map((item) => item.currency);
    const pathCombinations = await RouterUtil.getAllRoute(tokens, pathLength);

    const arbitrageResults: ArbitrageResult[] = [];
    for (const element of tokenAmounts) {
      const tokenKey = `${element.currency.symbol}-${element.currency.address}`;
      if (!element.amount) {
        LogUtil.debug(`Skip token: ${tokenKey}, reason: Missing AmountIn`);
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
        tokenAmountPaths[0].amount = element.amount;

        const arbitrageResult = this.calculatePairProfit(
          tokenAmountPaths,
          poolDetailMap,
        );
        if (arbitrageResult) arbitrageResults.push(arbitrageResult);
      });
    }

    arbitrageResults.sort((a, b) => Number(ethers.parseUnits(a.profitRate.slice(0, -1), 5) - ethers.parseUnits(b.profitRate.slice(0, -1), 5)));
    return arbitrageResults;
  }

  static calculatePairProfit(
    tokenAmount: TokenAmount[],
    poolDetailMap: {
      uniswapPools: Map<string, PoolDetail[]>;
      pancakeswapPools: Map<string, PoolDetail[]>;
    },
  ) {
    if (tokenAmount.length > 3) {
      throw new Error('Only Support less than 3 symbols');
    }
    const symbols = tokenAmount.map((item) => item.currency.symbol!);

    if (!tokenAmount[0].amount) {
      LogUtil.debug(
        `Trading Path: [${symbols.join(' -> ')}] missing initialAmount`,
      );
    }

    const arbitrageResult: ArbitrageResult = new ArbitrageResult();

    const initialAmount = ethers.parseUnits(
      tokenAmount[0].amount!,
      tokenAmount[0].currency.decimals,
    );

    const repayAmount =
      (initialAmount * (this.BASIS_POINTS + this.AAVE_BORROW_COST)) /
      this.BASIS_POINTS;

    LogUtil.debug(
      `-------------Start Calculate Path: ${symbols.join(' -> ')}-------------`,
    );
    let currentAmount = initialAmount;
    for (let i = 0; i < tokenAmount.length; i++) {
      const tokenIn = tokenAmount[i].currency;
      const tokenOut = tokenAmount[(i + 1) % tokenAmount.length].currency;

      const uniswapRatio = this.getRatio(
        tokenIn,
        tokenOut,
        poolDetailMap.uniswapPools,
      );

      if (!uniswapRatio) {
        LogUtil.debug(
          `Not Found Uniswap token pair: ${tokenIn.symbol}/${tokenOut.symbol}`,
        );
      }
      const uniswapTokenOut = uniswapRatio
        ? this.swap(currentAmount, uniswapRatio)
        : 0n;

      const pancakeRatio = this.getRatio(
        tokenIn,
        tokenOut,
        poolDetailMap.pancakeswapPools,
      );

      if (!pancakeRatio) {
        LogUtil.debug(
          `Not Found Pancakeswap token pair: ${tokenIn.symbol}/${tokenOut.symbol}`,
        );
      }

      const pancakeTokenOut = pancakeRatio
        ? this.swap(currentAmount, pancakeRatio)
        : 0n;

      LogUtil.debug(
        `${tokenIn.symbol} -> ${tokenOut.symbol} -- uniswapTokenOut: ${uniswapTokenOut}`,
      );
      LogUtil.debug(
        `${tokenIn.symbol} -> ${tokenOut.symbol} -- pancakeTokenOut: ${pancakeTokenOut}`,
      );

      if (uniswapTokenOut === 0n && pancakeTokenOut === 0n) {
        LogUtil.debug(
          `Not Found Any avaliable token pair: ${tokenIn.symbol}/${tokenOut.symbol}`,
        );

        LogUtil.debug(
          `-------------End Calculate Path: ${symbols.join(
            ' -> ',
          )}-------------\n\n`,
        );
        return undefined;
      }

      if (uniswapTokenOut > pancakeTokenOut) {
        arbitrageResult.SwapPath = [
          ...(arbitrageResult.SwapPath ?? []),
          {
            routerType: RouterType.UNISWAP_V3,
            routerAddress: '0x5Dc88340E1c5c6366864Ee415d6034cadd1A9897',
            permit2Address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            fee: uniswapRatio!.feeTier,
          },
        ];
        currentAmount = uniswapTokenOut;
      } else {
        arbitrageResult.SwapPath = [
          ...(arbitrageResult.SwapPath ?? []),
          {
            routerType: RouterType.PANCAKESWAP_V3,
            routerAddress: '0xd9c500dff816a1da21a48a732d3498bf09dc9aeb',
            permit2Address: '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768',
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            fee: pancakeRatio!.feeTier,
          },
        ];
        currentAmount = pancakeTokenOut;
      }
    }

    LogUtil.debug(
      `-------------End Calculate Path: ${symbols.join(
        ' -> ',
      )}-------------\n\n`,
    );

    arbitrageResult.repayAmount = repayAmount;
    arbitrageResult.initialAmount = initialAmount;
    arbitrageResult.finalAmount = currentAmount;
    arbitrageResult.netProfit = currentAmount - repayAmount;
    arbitrageResult.readableNetProfit = ethers.formatUnits(
      arbitrageResult.netProfit,
      tokenAmount[0].currency.decimals,
    );
    arbitrageResult.profitRate = ethers.formatUnits(
      (arbitrageResult.netProfit * 100000n) / repayAmount,
      3,
    ) + '%';
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
  ): Ratio | undefined {
    const key = SubgraphUtil.getDetailMapKey(tokenIn, tokenOut);

    const targetPoolDetail = poolDetailMap.get(key)?.[0];

    if (!targetPoolDetail) {
      return undefined;
    }
    const feeTier = targetPoolDetail.feeTier;
    const ratio = targetPoolDetail.netSwapRate;

    if (!ratio) {
      throw new Error(`Not Found After Fee Swap Rate of Detail Map Key: ${key} `)
    }

      return {
        numerator: ratio.numerator * (this.BASIS_POINTS - feeTier),
        denominator: ratio.denominator * this.BASIS_POINTS,
        feeTier: feeTier,
      };
  }
}
