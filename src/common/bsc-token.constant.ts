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
};
