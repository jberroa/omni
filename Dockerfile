# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG GEMINI_API_KEY
ENV GEMINI_API_KEY=$GEMINI_API_KEY

RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/omnistock.db

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY server.ts ./
COPY server ./server

EXPOSE 3000

CMD ["npm", "start"]
