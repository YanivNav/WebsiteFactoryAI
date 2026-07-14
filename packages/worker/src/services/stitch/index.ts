/**
 * Design generation — Google Stitch.
 *
 *   interface DesignGenerator { generate(spec): Promise<Design> }
 *
 * @google/stitch-sdk, authenticated with STITCH_API_KEY:
 *
 *   create_project
 *   project.generate(prompt, deviceType)
 *   screen.getHtml()    → HTML download URL
 *   screen.getImage()   → screenshot URL
 *   screen.variants(prompt, { variantCount, creativeRange, aspects })
 *
 * Models: GEMINI_3_PRO | GEMINI_3_FLASH.
 *
 * Output is HTML + a screenshot per screen — reviewable by a human, and directly
 * consumable by code generation.
 *
 * PHASE 4. Not implemented.
 */

// TODO(phase-4): StitchDesignGenerator implements DesignGenerator.
export {};
