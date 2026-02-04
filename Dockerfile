# VIN Node - Docker Container for dstack TEE
#
# Build: docker build -t vin-node .
# Run:   docker run -p 3402:3402 vin-node

FROM oven/bun:1.3-alpine

WORKDIR /app

# Copy package files
COPY vin-node/package.json ./
COPY vin-node/bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source
COPY vin-node/src ./src

# Environment
ENV VIN_PORT=3402
ENV VIN_PAY_TO=0xeC6cd01f6fdeaEc192b88Eb7B62f5E72D65719Af
ENV VIN_PRICE_USD=$0.001
ENV VIN_NETWORK=eip155:8453

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3402/health || exit 1

# Expose port
EXPOSE 3402

# Run
CMD ["bun", "run", "src/server.ts"]
