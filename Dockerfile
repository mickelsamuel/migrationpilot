# syntax=docker/dockerfile:1

# MigrationPilot CLI image.
#
# The CLI bundle keeps libpg-query (the real PostgreSQL parser, compiled to
# WASM) outside the esbuild bundle, so the runtime stage has to carry that
# module — and @pgsql/types, which libpg-query requires at runtime — alongside
# dist/cli.cjs. Everything else is bundled.

# ---- builder ----------------------------------------------------------------
FROM node:24-alpine AS builder

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /build

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN pnpm build

# pnpm's node_modules entries are symlinks into .pnpm, so dereference them
# (cp -L) into a flat tree the runtime stage can COPY as real files.
RUN mkdir -p /runtime/node_modules/@pgsql \
    && cp -rL node_modules/libpg-query /runtime/node_modules/libpg-query \
    && cp -rL node_modules/@pgsql/types /runtime/node_modules/@pgsql/types

# ---- runtime ----------------------------------------------------------------
FROM node:24-alpine

LABEL org.opencontainers.image.title="MigrationPilot" \
      org.opencontainers.image.description="Know exactly what your PostgreSQL migration will do to production — before you merge." \
      org.opencontainers.image.url="https://migrationpilot.dev" \
      org.opencontainers.image.source="https://github.com/mickelsamuel/migrationpilot" \
      org.opencontainers.image.licenses="MIT"

# Containers are non-interactive tooling contexts: no npm-registry round trip
# on every invocation.
ENV MIGRATIONPILOT_NO_UPDATE_CHECK=1

COPY --from=builder /build/dist/cli.cjs /opt/migrationpilot/cli.cjs
COPY --from=builder /runtime/node_modules /opt/migrationpilot/node_modules

RUN printf '#!/bin/sh\nexec node /opt/migrationpilot/cli.cjs "$@"\n' > /usr/local/bin/migrationpilot \
    && chmod +x /usr/local/bin/migrationpilot

# Mount your migrations here: docker run -v "$PWD:/work" ... analyze /work/x.sql
WORKDIR /work
USER node

ENTRYPOINT ["migrationpilot"]
CMD ["--help"]
