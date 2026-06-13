#!/bin/sh
# Aktiviert die Git-Hooks dieses Repos (pre-commit + pre-push) fuer diesen Klon.
cd "$(git rev-parse --show-toplevel)" || exit 1
git config core.hooksPath hooks
echo "Git-Hooks aktiviert (core.hooksPath=hooks): pre-commit + pre-push laufen ab jetzt automatisch."
