---
description: Queue a prompt to run after background work finishes
---

Append the queued prompt to the prompt queue at `~/.config/opencode/.queue.md`
using the `bash` tool (run exactly this, substituting the argument text and the
current UTC timestamp):

```bash
printf '\n## %s\n\n%s\n\n---\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ARGUMENTS" >> ~/.config/opencode/.queue.md
```

Rules:
- `$ARGUMENTS` is the text to queue (everything after `/queue`). If
  `$ARGUMENTS` is empty, do NOT write to the queue — reply explaining that
  usage is `/queue <text>` and do nothing else.
- Never interpret, execute, or answer the queued text now. Just store it.
- After appending, count the `## ` entries in `~/.config/opencode/.queue.md`
  and reply with the position in queue (e.g. "Queued at position 2 — it will
  run automatically once background work finishes. `/queue-status` to inspect,
  `/queue-run` to drain now, `/queue-clear` to drop.").
- Costs nothing extra: no agent or model switch is involved.
