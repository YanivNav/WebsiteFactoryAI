/**
 * Create the Wix site and the local repository.
 *
 *   npm create @wix/new@latest -- headless \
 *     --folder-name <x> --business-name <y> --site-template <t>
 *
 * Runs non-interactively (the Wix docs recommend exactly this for automated
 * scripts and AI agents). It provisions the Wix business + site, installs
 * dependencies, runs `git init`, builds, and publishes.
 *
 * THIS MUST RUN BEFORE CODE GENERATION. The scaffold *creates the repository* —
 * running it afterwards would overwrite everything Claude just wrote. This is a
 * correction to the original stage order; do not reorder it back.
 *
 * PHASE 5. Not implemented.
 */

// TODO(phase-5): implement via services/wix.
export {};
