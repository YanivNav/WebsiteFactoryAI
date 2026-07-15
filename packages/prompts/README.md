# Prompts

Prompts are **files**, not string literals. Never hardcode one in TypeScript.

Two reasons, and the second is the one that matters:

1. You can iterate on them without touching code.
2. **They are inputs, so they must be hashed.** Every artifact records the
   `promptHash` of the prompt that produced it. That is what makes "every stage is
   deterministic from its inputs" an _enforceable_ claim rather than a hopeful one —
   if the same inputs produce a different output, the hash tells you whether the
   prompt moved underneath you.

| File        | Stage                                        | Phase |
| ----------- | -------------------------------------------- | ----- |
| `spec.md`   | Brief → specification                        | 3     |
| `design.md` | Specification → design (Stitch)              | 4     |
| `code.md`   | Specification + design → Astro app           | 5     |
| `fix.md`    | Build error → repair (the self-healing loop) | 5     |

`fix.md` is not a nice-to-have. Our user cannot read a stack trace, so the AI has to
repair its own build failures before a human ever sees one.
