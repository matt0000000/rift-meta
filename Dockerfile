# Two runtime targets from one dependency graph:
#   web     — adapter-node server, no browser, stays small
#   scraper — Playwright + Chromium, only pulled when building that target
#
# Node is pinned rather than floating: better-sqlite3 compiles against the V8
# ABI, so a base image bump silently invalidates the compiled binding.
ARG NODE_VERSION=22-bookworm-slim

# --- dependencies -----------------------------------------------------------
# node-gyp needs a toolchain to build better-sqlite3 when no prebuilt binary
# matches this platform. Kept in its own stage so the toolchain never ships.
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
# The `playwright` package downloads browsers from its postinstall hook. The web
# target never needs them and the scraper installs them deliberately later, so
# suppress it here — otherwise every stage pays for a Chromium download.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# --- production dependencies ------------------------------------------------
# A separate resolve rather than pruning the one above: `npm ci --omit=dev`
# from the lockfile is reproducible, where `npm prune` mutates a tree in place.
FROM node:${NODE_VERSION} AS proddeps
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- build ------------------------------------------------------------------
FROM deps AS build
ENV NODE_ENV=production
COPY . .
RUN npm run build

# --- web runtime ------------------------------------------------------------
FROM node:${NODE_VERSION} AS web
WORKDIR /app
ENV NODE_ENV=production \
	PORT=3000 \
	HOST=0.0.0.0 \
	DATABASE_URL=/app/data/stats.db
# The compiled binding links against libstdc++, which the slim base already
# carries; the build toolchain itself is left behind in the deps stage.
COPY --from=proddeps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
# The bind-mounted data directory is owned by the host user, so the container
# user needs a matching uid to write the database. See UID/GID in compose.
USER node
EXPOSE 3000
CMD ["node", "build/index.js"]

# --- scraper runtime --------------------------------------------------------
FROM node:${NODE_VERSION} AS scraper
WORKDIR /app
ENV NODE_ENV=production \
	DATABASE_URL=/app/data/stats.db \
	PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
# `--with-deps` resolves Chromium's shared-library dependencies for this base
# image, which is the part that is tedious to maintain by hand. Browsers go to a
# world-readable path so the unprivileged runtime user can reach them.
RUN npx playwright install --with-deps chromium \
	&& chmod -R a+rx /ms-playwright \
	&& rm -rf /var/lib/apt/lists/*
COPY scraper ./scraper
COPY src ./src
COPY tsconfig.json ./
COPY deploy/docker/scrape-loop.sh /usr/local/bin/scrape-loop
RUN chmod +x /usr/local/bin/scrape-loop
USER node
CMD ["/usr/local/bin/scrape-loop"]
