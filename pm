#!/usr/bin/env bash
set -euo pipefail
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/PROJECT_OS/pm/pm" "$@"
