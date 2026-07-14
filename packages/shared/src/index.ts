// Extensionless on purpose. `@factory/shared` is consumed straight from TS source by
// three different bundlers — Next/Turbopack, Convex's esbuild, and tsx — and Turbopack
// will not remap a `./stages.js` specifier onto `stages.ts`. `moduleResolution:
// "Bundler"` (see tsconfig.base.json) makes extensionless the correct form for all three.
export * from "./stages";
export * from "./artifacts";
