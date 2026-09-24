---
description: Drop all pending /queue prompts without running them
---

Clear the prompt queue file at `~/.config/opencode/.queue.md` using the
`bash` tool:

```bash
: > ~/.config/opencode/.queue.md
```

Then reply confirming how many `## ` entries were dropped (count them with
`read` BEFORE truncating), e.g. "Dropped 3 queued prompt(s)." If the queue
was already empty, reply "Queue was already empty."
