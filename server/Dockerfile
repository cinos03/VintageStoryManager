# Multi-stage build for the Vintage Story Manager.
# Build context is the repository root (see docker-compose.yml).

# ---- Build the web frontend ----
FROM node:20-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

# ---- Build the server (TypeScript -> JS) ----
FROM node:20-slim AS server-build
WORKDIR /srv
COPY server/package.json server/package-lock.json* ./
RUN npm install
COPY server/ ./
RUN npm run build

# ---- Runtime image ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PUBLIC_DIR=/app/public
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=server-build /srv/dist ./dist
COPY --from=web /web/dist ./public
EXPOSE 8080
CMD ["node", "dist/index.js"]
