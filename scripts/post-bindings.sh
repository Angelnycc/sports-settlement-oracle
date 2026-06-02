#!/usr/bin/env bash
set -e
for f in contracts/evm/ts/generated/*.ts; do
  if ! head -1 "$f" | grep -q "@ts-nocheck"; then
    { echo "// @ts-nocheck"; cat "$f"; } > "$f.tmp" && mv "$f.tmp" "$f"
  fi
done
echo "Post-generate: prepended // @ts-nocheck to generated bindings"
