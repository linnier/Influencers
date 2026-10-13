# Verified official multi-platform images, pinned to the pulled manifest digest.
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY deploy/npm-cache/ /root/.npm/
ARG NPM_OFFLINE=false
RUN if [ "$NPM_OFFLINE" = "true" ]; then npm ci --offline --include=dev --no-audit --no-fund; else npm ci --include=dev --no-audit --no-fund; fi
COPY tsconfig.json next-env.d.ts next.config.mjs ./
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 INFLUENCERS_DB_PATH=/app/data/influencers.sqlite
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --chown=node:node deploy/database.mjs ./deploy/database.mjs
RUN mkdir -p /app/data /app/.next/cache && chown -R node:node /app/data /app/.next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e 'fetch("http://127.0.0.1:3000/api/health").then(async r=>{if(!r.ok||(await r.json()).status!=="ok")process.exit(1)}).catch(()=>process.exit(1))'
CMD ["node", "server.js"]
