---
description: Manually drain the /queue prompt queue now
---

Drain the prompt queue file at `~/.config/opencode/.queue.md` now, oldest
entry first, using the `read`, `bash`, and session prompt tools.

Steps:
1. Read `~/.config/opencode/.queue.md`. If it has no `## ` entries, reply
   "Queue is empty — nothing to run." and stop.
2. Take the OLDEST (first) `## ` entry. Remove exactly that entry from the
   file (keep the remaining entries intact; if it was the last entry, leave
   the file empty).
3. Execute the popped entry's text as the user's next prompt (run it now,
   in this session).
4. If entries remain, repeat from step 1 until the queue is empty or a
   background task is still busy (never run queued prompts while background
   work is in flight — leave the rest queued for the idle drain).
