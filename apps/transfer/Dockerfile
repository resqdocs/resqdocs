# Transfer-Dienst (Node) — erster dynamischer Dienst. Laeuft als non-root, schreibt nur nach /data
# (SQLite, gemountetes Volume) und /tmp. node:sqlite ist Node-Core (kein npm-Modul); Node 24 strippt
# TypeScript ohne Flag. --experimental-sqlite haelt den node:sqlite-Pfad ueber Versionsgrenzen stabil.
FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY src ./src

# Datenverzeichnis fuer die SQLite-Datei (als Volume gemountet, siehe docker-compose.yml).
RUN mkdir -p /data && chown -R node:node /data
USER node

ENV PORT=8086
ENV TRANSFER_DB=/data/transfer.db
EXPOSE 8086

CMD ["node", "--experimental-sqlite", "src/server.ts"]
