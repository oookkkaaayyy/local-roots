#!/bin/bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec "$HERE/DEPLOY_FULL_PWA.command"
