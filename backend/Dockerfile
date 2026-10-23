FROM node:20-alpine

WORKDIR /app

# Install system dependencies required by Prisma engine on Alpine
RUN apk add --no-cache openssl libc6-compat

# Install pnpm
RUN npm install -g pnpm@12.14.0

# Copy dependency manifests and approved build configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm exec prisma generate

# Copy source and configuration files
COPY tsconfig.json ./
COPY src ./src/
COPY scripts ./scripts/

# Build TypeScript to JavaScript
RUN pnpm build

# Expose backend API port
EXPOSE 4000

# Push database schema, seed products, and start server
CMD ["sh", "-c", "pnpm exec prisma db push && pnpm exec prisma db seed && node dist/index.js"]
