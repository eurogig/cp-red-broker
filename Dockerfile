# Release prerequisite: pin this tested base to an approved immutable image digest.
FROM node:24.11.1-bookworm-slim AS runner-base
ENV NODE_ENV=production NODE_USE_ENV_PROXY=1
WORKDIR /app
COPY --chown=10001:10001 src ./src
COPY --chown=10001:10001 demo ./demo
COPY --chown=10001:10001 scripts ./scripts
COPY --chown=10001:10001 examples ./examples
RUN mkdir /results && chown 10001:10001 /results
USER 10001:10001
ENTRYPOINT ["node", "src/cli.mjs"]
CMD ["/config/runner.json"]

# Credential-free image; no package-registry dependencies.
FROM runner-base AS demo

# Review sdk/package-lock.json before release.
# Deliberately fail if no lock exists rather than resolve unpinned transitives.
FROM node:24.11.1-bookworm-slim AS sdk-deps
WORKDIR /deps
COPY sdk/package*.json ./
# Optional registry configuration is mounted only for this build step.
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    test -f package-lock.json && npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM runner-base AS red
COPY --from=sdk-deps --chown=10001:10001 /deps/node_modules ./node_modules
