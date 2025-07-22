import { Address } from "viem";

export const BscContractConstant = {
  subgraph: {
    uniswapV3:
      'https://gateway.thegraph.com/api/subgraphs/id/G5MUbSBM7Nsrm9tH2tGQUiAF4SZDGf2qeo1xPLYjKr7K',
    pancakeswapV3:
      'https://gateway.thegraph.com/api/subgraphs/id/A1fvJWQLBeUAggX2WQTMm3FKjXTekNXo77ZySun4YN2m',
    uniswapV4:
      'https://gateway.thegraph.com/api/subgraphs/id/2qQpC8inZPZL4tYfRQPFGZhsE8mYzE67n5z3Yf5uuKMu',
  },
  uniswapV4: {
    stateView: "0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4" as Address,
    positionManager: "0x7a4a5c919ae2541aed11041a1aeee68f1287f95b" as Address,
  },
  uniswap: {
    universalRouter: '0x1906c1d672b88cd1b9ac7593301ca990f94eae07' as Address,
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3'  as Address,
    quoter: '0x5e55C9e631FAE526cd4B0526C4818D6e0a9eF0e3', //todo remove
    factory: '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7'  as Address,
  },
  pancakeswap: {
    universalRouter: '0xd9c500dff816a1da21a48a732d3498bf09dc9aeb'  as Address,
    permit2: '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768'  as Address,
    quoter: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997', //todo remove
    factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865'  as Address,
  },
};
