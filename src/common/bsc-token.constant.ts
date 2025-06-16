import { ChainId, Token } from '@uniswap/sdk-core';

export const BscTokenConstant = {
  wbnb: new Token(
    ChainId.BNB,
    '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
    18,
    'WBNB',
    'WBNB',
  ),
  usdt: new Token(
    ChainId.BNB,
    '0x55d398326f99059fF775485246999027B3197955',
    18,
    'USDT',
    'Tether USD',
  ),
  eth: new Token(
    ChainId.BNB,
    '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    18,
    'ETH',
    'Binance-Peg Ethereum Token',
  ),
  btcb: new Token(
    ChainId.BNB,
    '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
    18,
    'BTCB',
    'Binance BTC',
  ),
  zk: new Token(
    ChainId.BNB,
    '0xc71b5f631354be6853efe9c3ab6b9590f8302e81',
    18,
    'ZK',
    'Polyhedra Network',
  ),
  usdc: new Token(
    ChainId.BNB,
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
    18,
    'USDC',
    'USD Coin',
  ),
  b2: new Token(
    ChainId.BNB,
    '0x783c3f003f172c6ac5ac700218a357d2d66ee2a2',
    18,
    'B2',
    'BSquared Token',
  ),
  busd: new Token(
    ChainId.BNB,
    '0xe9e7cea3dedca5984780bafc599bd69add087d56',
    18,
    'BUSD',
    'BUSD Token',
  ),
};
