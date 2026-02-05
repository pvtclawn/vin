# Pinned base image for reproducibility (updated 2026-02-05)
FROM oven/bun:1.3-alpine@sha256:b0885548002187f088af5c7e04008f852c0a30cbe4192b5d75c3266a7f0b01f5

WORKDIR /app

# Copy package files
COPY vin-node/package.json ./

# Install dependencies
RUN bun install

# Copy source
COPY vin-node/src ./src

# Create data directory for persistent keys
RUN mkdir -p /data

EXPOSE 3402

CMD ["bun", "run", "src/server.ts"]
