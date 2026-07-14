/**
 * Code generation. Never coupled to the application.
 *
 *   interface CodeGenerator { build(task, ctx): Promise<Result> }
 *
 * V1 implementation: @anthropic-ai/claude-agent-sdk — Claude Code's engine as a
 * library, running IN-PROCESS inside the worker with `cwd` set to the checkout.
 * It does `fs` and `bash` on whatever machine the worker happens to be on, and the
 * worker commits afterwards. There is no "cloud filesystem" to design; it is just
 * a directory.
 *
 * Future implementations (Codex, Gemini, Cursor, OpenHands) slot in behind the same
 * interface. Nothing else changes. Never let the app know which one it is talking to.
 *
 * PHASE 5. Not implemented.
 */

// TODO(phase-5): ClaudeCodeGenerator implements CodeGenerator.
export {};
