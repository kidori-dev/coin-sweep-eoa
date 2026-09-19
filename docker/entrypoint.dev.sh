#!/bin/sh
set -e

echo "[entrypoint] running migrations..."
npm run migration:run

echo "[entrypoint] starting: $*"
exec "$@"
