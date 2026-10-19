---
name: codex-kanban
description: Register completed Codex work from this repository in the shared CONES Kanban board. Use when Codex finishes a meaningful implementation, bug fix, investigation, or project task here and the result should be visible to the team.
---

# Register Codex work in CONES Kanban

When a meaningful task is complete:

1. Run `npm run cli -- list` and check whether the same work is already recorded.
2. If it is missing, add one concise board item with its result and status:

   ```sh
   npm run cli -- add "Short task title" --status "Done" --description "What changed and where to review it."
   ```

3. If an existing Codex item covers the same work, move it instead of adding a duplicate:

   ```sh
   npm run cli -- move <item-id> "Done"
   ```

The board server must be running with `npm run dev`. Use `In Progress` for work that is still underway and `Done` only after the requested work is complete. Do not record routine chat answers or claim an item was shared unless the CLI/API confirms the write.
