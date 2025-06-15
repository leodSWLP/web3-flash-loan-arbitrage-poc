FROM ghcr.io/foundry-rs/foundry:latest

WORKDIR /anvil

EXPOSE 8545

ENTRYPOINT ["anvil", "--fork-url", "https://bsc-mainnet.infura.io/v3/246c4b36c59d4eb3a034cf16bd329c2a", "--host", "0.0.0.0"]
