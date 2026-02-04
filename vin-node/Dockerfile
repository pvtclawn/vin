FROM oven/bun:latest

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
