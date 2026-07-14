/**
 * Build and check the generated site — and repair it if it is broken.
 *
 *   wix build  +  astro check   → buildReport artifact
 *
 * THE SELF-HEALING LOOP LIVES HERE, AND IT IS NOT OPTIONAL POLISH.
 *
 * Our user is a Wix merchant who cannot read code. `astro check: TS2304 cannot find
 * name 'Foo'` is not merely unhelpful to them — it is *unactionable*. They cannot
 * fix it, ever. Therefore the AI must fix its own mistakes:
 *
 *   build fails → feed the error back to Claude → fix → rebuild → up to N attempts
 *               → only then escalate
 *
 * Escalation surfaces "We hit a snag while building your site — retrying." Never a
 * stack trace. Raw output goes to the structured logs, behind a collapsed
 * "Technical details" disclosure, for the operator — not for the user.
 *
 * PHASE 5. Not implemented.
 */

// TODO(phase-5): implement via services/wix (build) + services/claude (repair).
export {};
