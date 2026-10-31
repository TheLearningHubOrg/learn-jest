# Production Dockerfile for the Learn Jest companion project
# Stage 1 installs dev dependencies, runs the full test suite with coverage
# and compiles TypeScript. The build fails if any test or threshold fails.
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json jest.config.js ./
COPY src ./src
COPY tests ./tests

RUN npm run test:ci && npm run build

# Stage 2 ships only the compiled output, with no dev dependencies.
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY --from=builder /app/dist ./dist

USER node
CMD ["node", "dist/index.js"]
