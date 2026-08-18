#!/usr/bin/env bash
# Practice Relay API container entrypoint. Why: map file-mounted S3 credentials without bypassing the API's direct auth/LTI file readers, then preserve container signal handling.
set -euo pipefail

export_secret_file() {
  local target_name="$1"
  local source_name="$2"
  local source_path="${!source_name-}"

  if [[ -z "$source_path" ]]; then
    return 0
  fi
  if [[ ! -r "$source_path" ]]; then
    printf 'required secret file from %s is not readable\n' "$source_name" >&2
    return 1
  fi

  local value
  value="$(tr -d '\r\n' < "$source_path")"
  if [[ -z "$value" ]]; then
    printf 'required secret file from %s is empty\n' "$source_name" >&2
    return 1
  fi

  printf -v "$target_name" '%s' "$value"
  export "${target_name?}"
}

export_secret_file PRACTICE_RELAY_S3_ACCESS_KEY PRACTICE_RELAY_S3_ACCESS_KEY_FILE
export_secret_file PRACTICE_RELAY_S3_SECRET_KEY PRACTICE_RELAY_S3_SECRET_KEY_FILE

if [[ "$#" -eq 0 ]]; then
  printf 'Practice Relay API entrypoint requires a command\n' >&2
  exit 64
fi

exec "$@"
