FROM ghcr.io/foundry-rs/foundry:latest

WORKDIR /anvil

EXPOSE 8545

RUN echo '#!/bin/sh' > /anvil/entrypoint.sh && \
    echo 'if [ -n "$FORK_BLOCK_NUMBER" ]; then' >> /anvil/entrypoint.sh && \
    echo '  exec anvil --fork-url "$FORK_URL" --host "0.0.0.0" --fork-block-number "$FORK_BLOCK_NUMBER"' >> /anvil/entrypoint.sh && \
    echo 'else' >> /anvil/entrypoint.sh && \
    echo '  exec anvil --fork-url "$FORK_URL" --host "0.0.0.0"' >> /anvil/entrypoint.sh && \
    echo 'fi' >> /anvil/entrypoint.sh && \
    chmod +x /anvil/entrypoint.sh

ENTRYPOINT ["/anvil/entrypoint.sh"]