# Build the browser renderer and native authoritative server from pinned source.
FROM emscripten/emsdk:6.0.8 AS build
RUN apt-get update && apt-get install -y --no-install-recommends cmake ninja-build git curl python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /arena
COPY scripts scripts
COPY patches patches
RUN bash scripts/build-engine.sh

FROM node:24-bookworm-slim
WORKDIR /arena
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY web web
COPY server server
COPY --from=build /arena/bin bin
COPY --from=build /arena/public public
COPY public/source public/source
COPY public/assets/*.jpg public/assets/
COPY public/fonts public/fonts
COPY docs docs
RUN mkdir -p runtime && chown -R node:node /arena
USER node
ENV HOST=0.0.0.0 PORT=8787 ARENA_RUNTIME=/arena/runtime
EXPOSE 8787
HEALTHCHECK --interval=30s --start-period=60s CMD node -e 'fetch("http://127.0.0.1:8787/healthz").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'
CMD ["node","server/index.mjs"]
