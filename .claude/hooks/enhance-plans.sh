#!/bin/bash
# Appends parallel execution footer to plan files

set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

# Only process plan files (in /plans/ directory or named *plan*.md)
if [[ ! "$file_path" =~ /plans/ ]] && [[ ! "$file_path" =~ plan.*\.md$ ]]; then
  exit 0
fi

# Append execution instructions if not already present
if ! grep -q "## Execution Strategy" "$file_path" 2>/dev/null; then
  cat >> "$file_path" << 'EOF'

---

## Execution Strategy

**MANDATORY: Use multi-agent parallel execution**

1. Analyze dependencies - identify independent vs dependent tasks
2. Group into parallel batches - cluster independent tasks
3. Execute with up to 5 agents in parallel via Task tool
4. Serialize only when dependencies require it

See CLAUDE.md "Execution Preferences" for parallelization rules.
EOF
fi

exit 0
