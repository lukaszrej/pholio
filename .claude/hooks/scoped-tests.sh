#!/bin/bash
FILE=$(cat | jq -r '.tool_input.file_path // empty')
if [[ -z "$FILE" ]]; then exit 0; fi
if [[ "$FILE" =~ src/lib/|src/components/transactions/ ]]; then
  npx vitest related "$FILE" --run
fi
