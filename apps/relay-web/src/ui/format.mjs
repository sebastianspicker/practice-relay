/**
 * Shared Practice Relay formatting helpers.
 * Why residual: date and identity formatting must stay uniform across panels
 * without each render path inventing its own locale rules.
 */

/** Format an ISO or parseable date as en-GB day short-month year; invalid values become "Local example". */
export function formatDate(value) {
  const dateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(value == null || value === "" ? NaN : value);
  return Number.isNaN(date.valueOf())
    ? "Local example"
    // Date-only strings parse as UTC midnight; format in UTC so the day never shifts.
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", ...(dateOnly && { timeZone: "UTC" }) });
}
