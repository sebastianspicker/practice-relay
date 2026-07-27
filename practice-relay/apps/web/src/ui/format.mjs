/**
 * Shared Practice Relay formatting and DOM lookup helpers.
 * Why residual: date and identity formatting must stay uniform across panels
 * without each render path inventing its own locale rules.
 */

import { escapeHtml } from "../html-escape.mjs";

/** Escape untrusted text before HTML interpolation (re-export of escapeHtml). */
export const escape = escapeHtml;

/** Resolve a DOM node by id for workspace wiring. */
export const byId = (id) => document.getElementById(id);

/** Format an ISO or parseable date as en-GB day short-month year; invalid values become "Local example". */
export function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Local example"
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
