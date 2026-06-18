import crypto from "node:crypto";

/** Two-digit zero padding. */
function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Build a change id of the form `chg_YYYYMMDD_HHMMSS_hash`. The hash is a short
 * digest of the diff content so two captures in the same second still differ.
 */
export function generateChangeId(diff: string, date: Date = new Date()): string {
  const y = date.getFullYear();
  const stamp =
    `${y}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const hash = crypto
    .createHash("sha1")
    .update(diff + date.toISOString())
    .digest("hex")
    .slice(0, 8);
  return `chg_${stamp}_${hash}`;
}
