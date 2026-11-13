#!/usr/bin/env bash
# Keeps the repository's Actions storage small (GitHub bills caches and artifacts against one allowance: 0.5 GB on this plan).
# Needs GH_TOKEN with actions: write, and GITHUB_REPOSITORY. Everything it removes is rebuilt on demand (a cache misses once,
# a run's artifact is only handed between jobs). Rules:
#   caches    keep only the newest of each kind (key without its trailing hash) per branch; drop any untouched for 2 days
#   artifacts drop any older than 1 day (every workflow already asks for 1-3 days; this catches the ones that did not expire)
# DRY_RUN=1 only prints. The summary goes to $GITHUB_STEP_SUMMARY when set.
set -euo pipefail
R="${GITHUB_REPOSITORY:?}"
out="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
now=$(date -u +%s)
del() { if [ -n "${DRY_RUN:-}" ]; then echo "would delete $1"; else gh api -X DELETE "$1" --silent || echo "could not delete $1"; fi; }
mb() { awk -v b="$1" 'BEGIN { printf "%.1f MB", b / 1048576 }'; }

caches=$(gh api --paginate "repos/$R/actions/caches?per_page=100" -q '.actions_caches[]' | jq -s '.')
arts=$(gh api --paginate "repos/$R/actions/artifacts?per_page=100" -q '.artifacts[] | select(.expired == false)' | jq -s '.')

{
  echo "### Actions storage before"
  echo "caches: $(jq 'length' <<<"$caches") entries, $(mb "$(jq '[.[].size_in_bytes] | add // 0' <<<"$caches")")"
  echo "artifacts: $(jq 'length' <<<"$arts") live, $(mb "$(jq '[.[].size_in_bytes] | add // 0' <<<"$arts")")"
  echo
  echo "| cache kind | ref | entries | size |"
  echo "|---|---|---|---|"
  jq -r 'map(. + {kind: (.key | sub("-[^-]*$"; ""))}) | group_by([.kind, .ref])[] | "| \(.[0].kind) | \(.[0].ref) | \(length) | \(([.[].size_in_bytes] | add) / 1048576 | floor) MB |"' <<<"$caches"
} >> "$out"

# Caches: every entry but the newest of its kind and branch, and anything idle for two days.
jq -r --argjson now "$now" '
  map(. + {kind: (.key | sub("-[^-]*$"; "")), used: (.last_accessed_at | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601)})
  | group_by([.kind, .ref])
  | map(sort_by(.used) | reverse | to_entries | map(select(.key > 0 or ($now - .value.used) > 172800) | .value))
  | flatten | .[] | "\(.id) \(.size_in_bytes) \(.key)"' <<<"$caches" |
while read -r id size key; do echo "cache $key ($(mb "$size"))" >> "$out"; del "repos/$R/actions/caches/$id"; done

# Artifacts older than a day.
jq -r --argjson now "$now" '.[] | select(($now - (.created_at | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601)) > 86400) | "\(.id) \(.size_in_bytes) \(.name)"' <<<"$arts" |
while read -r id size name; do echo "artifact $name ($(mb "$size"))" >> "$out"; del "repos/$R/actions/artifacts/$id"; done
echo "Done." >> "$out"
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && cat "$GITHUB_STEP_SUMMARY"
