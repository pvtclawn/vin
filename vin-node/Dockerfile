# Pinned base image for reproducibility (updated 2026-02-05)
FROM oven/bun:1.3-alpine@sha256:b0885548002187f088af5c7e04008f852c0a30cbe4192b5d75c3266a7f0b01f5

WORKDIR /app

# Copy package files and lockfile
COPY vin-node/package.json vin-node/bun.lock ./

# Install dependencies (frozen lockfile for reproducibility)
RUN bun install --frozen-lockfile

# Copy source
COPY vin-node/src ./src

# Create data directory for persistent keys
RUN mkdir -p /data

EXPOSE 3402

CMD ["bun", "run", "src/server.ts"]
