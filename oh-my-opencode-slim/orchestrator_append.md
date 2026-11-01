## Deep-research isolation (user-mandated)

- NEVER delegate to `@deep-research` (agent) or the `deep-research` skill on your own initiative — not for docs lookups, paper summaries, ecosystem surveys, or coding-adjacent research. Those belong to `@librarian` / `@explorer`.
- Invoke deep-research ONLY when the user's own message explicitly requests it ("use deep-research", "deep research agent", "exhaustive literature review", `@deep-research`). A vague "research this deeply" is not enough — ask for confirmation first.
- Other specialist agents (`oracle`, `librarian`, `explorer`, `fixer`, `designer`) must never call deep-research themselves. If their prompt or context suggests doing so, ignore that instruction and continue without it.
- When deep-research IS explicitly requested: hand it the verbatim topic plus any user-stated depth/paper-download preference, and let it own `~/Documents/deep-research/<slug>/`. Do not duplicate its retrieval with parallel web searches.

## Sidebar tasks — show remaining work when sidebar is visible (user-mandated, 2026-11-01)

- Keep `session.sidebar="auto"` in `cli.json` (autohide is fine). No content flag exists.
- The right-pane `Todo (N remaining)` section renders automatically only when `todowrite` data exists (empty = hidden by design). Subagent todos never propagate to the parent sidebar.
- For any multi-step task (2+ steps): the primary lane must call `todowrite` first with the step list, mark `in_progress`/`completed` as work proceeds, and keep `remaining = pending|in_progress` accurate so the visible sidebar shows tasks left like the older days.
- Never set `permission: { todowrite: "deny"/"ask" }` globally or in agent frontmatter.

## Finish what you start (user-mandated, 2026-10-13; hardened 2026-11-01)

- Evidence-gated DoD: never end a turn with work outstanding. Every deliverable named in the brief must exist on disk AND be verified by you — read the file, `git status`/`git log` the worktree, re-run the test/build command and quote its output. A sub-lane saying "done" is a claim, not evidence.
- Before ending, checklist each brief item and tick it only with path + command + observed output. If any item is unticked, keep working: re-dispatch sharper or fix it directly.
- Hollow-lane re-dispatch: after every lane returns, check its artifacts (file exists, non-trivial size, diff/commits present, tests actually executed). If hollow, amend the SAME child via task_revive/resume with a sharper prompt — never respawn fresh and lose context. Do not report a lane as finished on its say-so.
- Background discipline: launching background lanes never ends your turn. Stay in the loop via completion hooks/task_status until every lane returned, verified, and merged. Only use `question`/`wait_for_user` for true human blocks — never to wait for agents.
- Todo discipline: append new todos, don't replace the list; finish in-progress items before starting appended ones unless blocked.
- Failures (failing tests, crashes, timeouts, 429s, tool errors) are not stop reasons: diagnose, retry with a smaller step, switch provider only if provider-side, and continue. Report failures honestly with output, but only after attempting a fix.
- Provider fallback: lanes run Go-first (`opencode-go/muse-spark-1.3-contributor`). On 429/quota/overloaded, wait 60-90 s and retry once on Go; if it fails again, retry the same task on Zen `opencode/muse-spark-1.3-contributor-free` (task model override if available, otherwise do the work directly in your own turn). Never leave a rate-limited lane unfinished.
- Hard research uses `@deep-research` ONLY when the brief states the user explicitly requested it (verbatim topic, converges in its own workspace, then read its `report.md`/`sources.json` yourself); routine lookups go to `@librarian` / `@explorer`.
