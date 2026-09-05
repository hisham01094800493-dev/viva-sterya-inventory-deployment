#!/usr/bin/env bash
set -Eeuo pipefail

: "${RAILWAY_MYSQL_URL:?Set RAILWAY_MYSQL_URL to the Railway MySQL connection URL first}"
OUTPUT="${1:-railway-mysql-$(date +%Y%m%d-%H%M%S).sql}"

umask 077
mysqldump --protocol=TCP \
  --host="$(node -e 'const u=new URL(process.argv[1]); process.stdout.write(u.hostname)' "$RAILWAY_MYSQL_URL")" \
  --port="$(node -e 'const u=new URL(process.argv[1]); process.stdout.write(u.port || "3306")' "$RAILWAY_MYSQL_URL")" \
  --user="$(node -e 'const u=new URL(process.argv[1]); process.stdout.write(decodeURIComponent(u.username))' "$RAILWAY_MYSQL_URL")" \
  --password="$(node -e 'const u=new URL(process.argv[1]); process.stdout.write(decodeURIComponent(u.password))' "$RAILWAY_MYSQL_URL")" \
  --databases "$(node -e 'const u=new URL(process.argv[1]); process.stdout.write(u.pathname.replace(/^\//, ""))' "$RAILWAY_MYSQL_URL")" \
  --single-transaction --quick --routines --triggers --set-gtid-purged=OFF > "$OUTPUT"

printf 'Exported database to %s\n' "$OUTPUT"
