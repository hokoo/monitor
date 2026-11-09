FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && npm install --global --omit=dev @openai/codex@0.167.0
WORKDIR /app
COPY --chown=node:node server.mjs core.mjs demo.mjs zai.mjs codex.mjs ./
COPY --chown=node:node public ./public
USER node
CMD ["node", "server.mjs"]
