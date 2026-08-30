#!/bin/sh
set -eu

target_directory="$1"
shift

if [ "${1:-}" = "&&" ]; then
  shift
fi

cd "$target_directory"
exec "$@"
