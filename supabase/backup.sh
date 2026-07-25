#!/usr/bin/env bash

set -Eeuo pipefail

# Override these when backing up a hosted database:
#   DATABASE_URL='postgresql://...' BACKUP_DATE='2026-07-25' ./backup.sh
DATABASE_URL_WAS_SET="${DATABASE_URL:+true}"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
BACKUP_DATE="${BACKUP_DATE:-$(date +%Y-%m-%d)}"
BACKUP_TARGET="${BACKUP_TARGET:-local}"

if [[ ! "${BACKUP_TARGET}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "Error: BACKUP_TARGET may contain only letters, numbers, underscores, and hyphens." >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/backups/${BACKUP_TARGET}/${BACKUP_DATE}"

if command -v pg_dump >/dev/null 2>&1; then
  DUMP_MODE="host"
elif command -v docker >/dev/null 2>&1; then
  PROJECT_ID="$(
    sed -nE 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' \
      "${SCRIPT_DIR}/config.toml" |
      head -n 1
  )"
  DB_CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_${PROJECT_ID}}"

  if ! docker inspect "${DB_CONTAINER}" >/dev/null 2>&1; then
    echo "Error: pg_dump is unavailable and Supabase container '${DB_CONTAINER}' is not running." >&2
    echo "Run 'supabase start', install PostgreSQL client tools, or set SUPABASE_DB_CONTAINER." >&2
    exit 1
  fi

  DUMP_MODE="docker"
  if [[ "${DATABASE_URL_WAS_SET}" == "true" ]]; then
    DOCKER_DATABASE_URL="${DATABASE_URL}"
  else
    DOCKER_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/postgres"
  fi
else
  echo "Error: neither pg_dump nor Docker is available." >&2
  exit 1
fi

TABLE_NAMES=(
  "discord_users"
  "guild_chat_logs"
  "guild_command_settings"
  "guild_members"
  "guild_tts_settings"
  "guilds"
  "pokemon"
  "user_pokemon"
)

mkdir -p "${BACKUP_DIR}"

for table in "${TABLE_NAMES[@]}"; do
  destination="${BACKUP_DIR}/${table}.sql"
  temporary="${destination}.tmp"

  echo "Dumping public.${table} to ${destination}"

  if [[ "${DUMP_MODE}" == "host" ]]; then
    if pg_dump \
      --dbname="${DATABASE_URL}" \
      --table="public.${table}" \
      --data-only \
      --column-inserts \
      --no-owner \
      --no-privileges \
      --file="${temporary}"; then
      dump_status=0
    else
      dump_status=$?
    fi
  else
    if docker exec "${DB_CONTAINER}" pg_dump \
      --dbname="${DOCKER_DATABASE_URL}" \
      --table="public.${table}" \
      --data-only \
      --column-inserts \
      --no-owner \
      --no-privileges > "${temporary}"; then
      dump_status=0
    else
      dump_status=$?
    fi
  fi

  if [[ "${dump_status}" -eq 0 ]]; then
    mv -- "${temporary}" "${destination}"
  else
    rm -f -- "${temporary}"
    echo "Error: failed to dump public.${table}" >&2
    exit 1
  fi
done

echo "Backup complete: ${BACKUP_DIR}"
