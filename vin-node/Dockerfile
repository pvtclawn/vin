FROM oven/bun:1.1-alpine

WORKDIR /app

# Copy package files
COPY vin-node/package.json vin-node/bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source
COPY vin-node/src ./src

# Create data directory for persistent keys
RUN mkdir -p /data

EXPOSE 3402

CMD ["bun", "run", "src/server.ts"]
