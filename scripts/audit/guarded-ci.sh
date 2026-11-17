#!/usr/bin/env bash
set -euo pipefail
# GITHUB_ENV refuses NODE_OPTIONS. Export inside the workload shell instead;
# Node children inherit it, while checkout/setup actions remain unaffected.
export NODE_OPTIONS="--import=\"$PWD/scripts/audit/no-distribution-guard.mjs\" ${NODE_OPTIONS:-}"
node scripts/audit/assert-distribution-preload.mjs
exec bash --noprofile --norc -e -o pipefail "$@"
