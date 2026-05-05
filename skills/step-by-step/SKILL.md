---
name: step-by-step
description: Step-by-step structured workflow for complex tasks with planning, tracking, and verification
license: MIT
compatibility: opencode
---

## What I do

Guide the implementation of complex tasks through a structured step-by-step workflow:
1. **Analyze** - Break the task into discrete, ordered steps
2. **Plan** - Create a detailed implementation plan for each step
3. **Execute** - Implement one step at a time, marking progress
4. **Verify** - After each step, verify the changes work correctly
5. **Review** - After all steps, do a final review

## When to use me

Use this skill when:
- The task involves 3 or more distinct changes
- The task requires changes across multiple files
- The user asks for a structured or step-by-step approach
- The task has dependencies between steps

## How I work

### Step Format
For each step, I provide:
- **Step N: [Name]** - Clear title
- **Description** - What this step accomplishes
- **Files affected** - Which files will be modified
- **Implementation** - The actual code changes
- **Verification** - How to confirm this step succeeded

### Progress Tracking
I track progress using a checklist format:
- [ ] Step 1: ...
- [ ] Step 2: ...
- [x] Step 3: ... (completed)

### Rules
- Never skip steps or combine them without explicit approval
- Always verify before moving to the next step
- If a step fails, diagnose and fix before proceeding
- Update the progress checklist after each completed step
