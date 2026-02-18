FROM node:20-slim

# Install curl (needed for permission hooks) + ca-certificates
RUN apt-get update && apt-get install -y curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Install Claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Copy package files and install all deps (need devDeps for tsc)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Remove devDependencies
RUN npm prune --production

EXPOSE 3001

CMD ["npm", "start"]
