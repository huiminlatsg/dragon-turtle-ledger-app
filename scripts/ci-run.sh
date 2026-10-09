#!/usr/bin/env bash
# Run a CI step and, if it fails, attach the end of its output to the run as an
# error annotation, so the reason shows on the pull request without opening logs.
#   scripts/ci-run.sh "Build" npm run build
set -uo pipefail
title="$1"; shift
log="$(mktemp)"
"$@" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
if [ "$status" -ne 0 ]; then
  # Annotations are one line: encode %, CR and LF; strip ANSI colours.
  body="$(tail -n 80 "$log" | sed -e 's/\x1b\[[0-9;]*m//g' | sed -e ':a;N;$!ba;s/%/%25/g;s/\r//g;s/\n/%0A/g')"
  echo "::error title=${title} failed::${body}"
fi
exit "$status"
