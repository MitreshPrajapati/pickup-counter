FROM node:20-alpine

WORKDIR /app

# Install libc6-compat for Next.js on Alpine
RUN apk add --no-cache libc6-compat

# Install pnpm
RUN npm install -g pnpm@12.14.0

# Copy dependency manifests and approved build configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy application files
COPY next.config.ts tsconfig.json eslint.config.mjs ./
COPY public ./public/
COPY src ./src/

# Build environment variables
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NODE_ENV=production

# Build Next.js production bundle
RUN pnpm build

# Expose Kiosk UI port
EXPOSE 3000

# Start production server
CMD ["pnpm", "start"]
