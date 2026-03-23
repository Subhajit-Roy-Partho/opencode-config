# Large Project Playbook

- Treat monorepos and multi-package workspaces as graphs, not flat directories. Identify owners, entrypoints, shared packages, generated outputs, and deploy boundaries.
- Ignore noisy derived trees unless they are directly relevant: dependency folders, coverage, caches, generated artifacts, and build outputs.
- For cross-cutting changes, stage the work: discovery, invariant check, narrow edits, targeted validation, and a durable handoff.
- Use compaction intentionally. Before long-context transitions, preserve decisions, risks, and next actions with `/compact-handoff`.
- For C++, Python, JavaScript, and TypeScript, trust LSP diagnostics and symbols before broad textual guessing.
- When a task mixes repo analysis and implementation, keep architectural notes short and push the rest into durable memory if configured.
