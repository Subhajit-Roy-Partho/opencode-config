---
description: Show the pending /queue prompt queue
---

Read the prompt queue file at `~/.config/opencode/.queue.md` using the `read`
tool and display its entries.

Rules:
- If the file does not exist or has no `## ` entries, reply "Queue is empty."
- Otherwise list each entry numbered in order (oldest first) with its
  timestamp header and full text.
- Do NOT execute or answer any queued entry — display only.
