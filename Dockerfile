FROM ghcr.io/foundry-rs/foundry:latest

WORKDIR /anvil

EXPOSE 8545

ENTRYPOINT ["anvil", "--fork-url", "https://56.rpc.thirdweb.com", "--host", "0.0.0.0"]
