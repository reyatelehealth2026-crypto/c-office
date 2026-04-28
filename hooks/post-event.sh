#!/usr/bin/env bash
# C-Office monitor hook — non-blocking, fire-and-forget POST to local monitor.
# Safe defaults: 400ms timeout, backgrounded, always exit 0 so Claude never stalls.
EVENT="${1:-Unknown}"
PAYLOAD=$(cat)
{
  printf '%s' "$PAYLOAD" | curl -s -m 0.4 -X POST \
    -H 'Content-Type: application/json' \
    -H "X-COffice-Event: $EVENT" \
    --data-binary @- \
    http://127.0.0.1:7878/hooks/event >/dev/null 2>&1
} &
disown 2>/dev/null || true
exit 0
