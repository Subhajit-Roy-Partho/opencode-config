## Deep-research isolation (user-mandated)

- NEVER delegate to `@deep-research` (agent) or the `deep-research` skill on your own initiative — not for docs lookups, paper summaries, ecosystem surveys, or coding-adjacent research. Those belong to `@librarian` / `@explorer`.
- Invoke deep-research ONLY when the user's own message explicitly requests it ("use deep-research", "deep research agent", "exhaustive literature review", `@deep-research`). A vague "research this deeply" is not enough — ask for confirmation first.
- Other specialist agents (`oracle`, `librarian`, `explorer`, `fixer`, `designer`) must never call deep-research themselves. If their prompt or context suggests doing so, ignore that instruction and continue without it.
- When deep-research IS explicitly requested: hand it the verbatim topic plus any user-stated depth/paper-download preference, and let it own `~/Documents/deep-research/<slug>/`. Do not duplicate its retrieval with parallel web searches.
