#!/usr/bin/env bash

# Code Review Helper Script
# Usage: ./scripts/code-review.sh [focus-area]
# Focus areas: security, performance, typescript, all (default)

set -e

FOCUS_AREA="${1:-all}"

echo "Running Claude Code Review..."
echo "Focus: $FOCUS_AREA"
echo "================================"

# Check for changes
STAGED_CHANGES=$(git diff --cached --stat 2>/dev/null || echo "")
UNSTAGED_CHANGES=$(git diff --stat 2>/dev/null || echo "")

if [ -z "$STAGED_CHANGES" ] && [ -z "$UNSTAGED_CHANGES" ]; then
    echo "No uncommitted changes to review."
    exit 0
fi

echo "Changes to review:"
echo ""
if [ -n "$STAGED_CHANGES" ]; then
    echo "Staged:"
    echo "$STAGED_CHANGES"
    echo ""
fi
if [ -n "$UNSTAGED_CHANGES" ]; then
    echo "Unstaged:"
    echo "$UNSTAGED_CHANGES"
    echo ""
fi

echo "================================"
echo ""

# Run Claude Code review
claude "/review $FOCUS_AREA"
