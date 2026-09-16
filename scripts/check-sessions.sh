#!/usr/bin/env bash
# Checks that every session folder follows the layout in CONTRIBUTING.md.
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
err() { echo "::error file=$1::$2"; fail=1; }

for term in sessions/*/; do
  term=${term%/}
  [[ $(basename "$term") =~ ^[0-9]{4}-(winter|summer|fall)$ ]] || err "$term" "Term folder must be YYYY-winter, YYYY-summer, or YYYY-fall"
  for s in "$term"/*/; do
    s=${s%/}; name=$(basename "$s")
    [[ $name =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2}|TBD)-[a-z0-9]+(-[a-z0-9]+)*$ ]] || err "$s" "Session folder must be YYYY-MM-DD-short-name or TBD-short-name"
    for f in README.md deck.md recap.md; do
      [[ -f $s/$f ]] || err "$s" "Missing $f (copy it from templates/session/)"
    done
    for p in "$s"/*.pptx; do
      [[ -e $p ]] || continue
      [[ $(basename "$p") == "$name.pptx" ]] || err "$p" "Slides must be named $name.pptx"
    done
    grep -q "$name" sessions/README.md || err "sessions/README.md" "No row for $name in the index"
  done
done

exit $fail
