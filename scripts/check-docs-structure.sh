#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
if [[ ! -d docs ]]; then
  echo "::error::docs/ not found — run this script from within the repo"
  exit 1
fi

allowed=(features runbooks guides tasks)
status=0
shopt -s nullglob dotglob

for entry in docs/*; do
  name="$(basename "$entry")"
  if [[ -d "$entry" ]]; then
    ok=0
    for a in "${allowed[@]}"; do
      [[ "$name" == "$a" ]] && ok=1
    done
    if [[ "$ok" -eq 0 ]]; then
      echo "::error::Unexpected top-level docs/ directory: docs/$name — allowed: ${allowed[*]} (plus loose *.md files at docs/ root). See docs/README.md."
      status=1
    fi
  elif [[ -f "$entry" ]]; then
    if [[ "$name" != *.md ]]; then
      echo "::error::Unexpected top-level docs/ file: docs/$name — only *.md files are allowed loose at docs/ root. See docs/README.md."
      status=1
    fi
  fi
done

exit "$status"
