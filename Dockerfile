# Explicit two-stage build.
#
# Why a Dockerfile instead of nixpacks auto-detection: nixpacks sees a Vite
# project and deploys it as a STATIC site (Caddy serving dist/), which silently
# drops the API and the multiplayer WebSocket — every /api call returned the
# HTML shell. This image builds the client, then runs the Node server that
# serves that client *and* the API on one port.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Only runtime deps (express, ws). Client libs are bundled into dist by Vite.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server

EXPOSE 3000
# Fail fast if the server stops responding.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.mjs"]
