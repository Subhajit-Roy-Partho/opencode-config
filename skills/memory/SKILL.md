---
name: memory
description: Persistent memory and context awareness across sessions for consistent behavior
license: MIT
compatibility: opencode
---

## What I do

Maintain persistent memory and context awareness across sessions:
- Remember user preferences (coding style, framework choices, naming conventions)
- Track project decisions and their rationale
- Recall frequently used patterns and utilities in the project
- Maintain awareness of project structure and conventions

## When to use me

Use this skill when:
- Starting a new session on an existing project
- The user references past decisions or preferences
- Working on a project where consistency across sessions matters
- The user asks you to remember something for next time

## How I work

### Memory Categories
- **Project Context** - Architecture, tech stack, directory structure
- **User Preferences** - Coding style, naming conventions, preferred libraries
- **Decisions Log** - Important decisions made and their rationale
- **Common Patterns** - Frequently used utilities, helpers, and patterns
- **Gotchas** - Known issues, workarounds, and things to watch out for

### Memory Storage
Memory is persisted through:
1. AGENTS.md - Project-level instructions committed to git
2. Compaction hooks - Context preserved across context window compaction
3. The opencode-supermemory plugin - Cross-session persistent memory

### Rules
- Always check AGENTS.md for existing project context first
- When a user expresses a preference, acknowledge and remember it
- When making architectural decisions, document the rationale
- Proactively reference past context when it's relevant to the current task
