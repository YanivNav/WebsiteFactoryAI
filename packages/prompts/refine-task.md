The site is already built and working. Make the following change, keeping everything
else intact.

Read `.factory/brief.json` for context (the original spec, approved designs, and owner
content). The `requestedChange` field describes what to change.

Before writing any code:
1. Read the existing files you need to modify — understand the current structure
2. Only touch files relevant to the change; don't rewrite pages or features that
   aren't mentioned
3. Follow your global AGENTS.md rules and the Wix skill docs installed in this project

Work until `npx wix build` passes, then write `.factory/report.json` exactly as your
rules describe (summary, unitsBuilt, questions, manualTasks, content).
