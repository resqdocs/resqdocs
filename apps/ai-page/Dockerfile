# ai.resqdocs.app — nginx serviert das LOKAL gebaute Bundle (wie der Editor-Deploy: monorepo-Build
# lokal, da der Build die committeten Artefakte aus ../../ai-docs/ nach public/ kopiert; Image = nur dist).
# Vor dem Image-Bau:  npm install && npm run build   (in apps/ai-page, erzeugt dist/)
FROM nginx:1.27-alpine AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
