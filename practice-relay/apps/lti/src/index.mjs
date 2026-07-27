/**
 * Public facade for Practice Relay's local-mock LTI protocol primitives.
 *
 * Why: preserve the package entrypoint while keeping assignment, signing, AGS, and OIDC concerns bounded.
 */
export * from "./assignment.mjs";
export * from "./jwt.mjs";
export * from "./ags.mjs";
export * from "./oidc.mjs";
