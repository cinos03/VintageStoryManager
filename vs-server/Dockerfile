FROM mcr.microsoft.com/dotnet/runtime:7.0

# Vintage Story dedicated server runtime image.
# The actual game files are downloaded at runtime by entrypoint.sh into the
# /game volume, keyed by version, so a single image can run any version.

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        wget \
        tar \
    && rm -rf /var/lib/apt/lists/*

ENV VS_VERSION=1.22.3 \
    VS_CHANNEL=stable \
    GAME_DIR=/game \
    DATA_DIR=/data

VOLUME ["/game", "/data"]
EXPOSE 42420/tcp 42420/udp

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
