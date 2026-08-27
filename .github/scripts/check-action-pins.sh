#!/usr/bin/env bash
# Fail if any `uses:` under .github/ is not pinned to a full 40-character
# commit SHA. Local refs (./...) are exempt: they resolve inside this repo
# rather than against a remote tag that someone else can move.
set -euo pipefail

targets=()
for dir in .github/workflows .github/actions; do
  [[ -d "$dir" ]] && targets+=("$dir")
done

if [[ ${#targets[@]} -eq 0 ]]; then
  echo "No .github/workflows or .github/actions directory; nothing to check."
  exit 0
fi

all_uses=$(grep -rnE '^[[:space:]]*-?[[:space:]]*uses:' "${targets[@]}" || true)
unpinned=$(
  printf '%s\n' "$all_uses" \
    | grep -vE 'uses:[[:space:]]*\./' \
    | grep -vE 'uses:[[:space:]]*[^@]+@[0-9a-f]{40}([[:space:]]|$)' \
    | grep -vE '^[[:space:]]*$' \
    || true
)

if [[ -n "$unpinned" ]]; then
  echo "Unpinned GitHub Actions found. Every 'uses:' must reference a full 40-character commit SHA."
  echo
  while IFS= read -r line; do
    file="${line%%:*}"; rest="${line#*:}"; lineno="${rest%%:*}"
    ref=$(printf '%s' "$line" | sed 's/.*uses:[[:space:]]*//')
    echo "::error file=${file},line=${lineno}::Not pinned to a commit SHA: ${ref}"
    echo "  ${file}:${lineno}  ${ref}"
  done <<< "$unpinned"
  echo
  echo "Pin to the SHA the tag resolves to, keeping the version as a comment:"
  echo "  uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1"
  exit 1
fi

count=$(printf '%s\n' "$all_uses" | grep -cE 'uses:' || true)
echo "All ${count} action reference(s) are pinned to a commit SHA."
