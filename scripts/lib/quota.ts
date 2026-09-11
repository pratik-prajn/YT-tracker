// YouTube Data API v3 unit accounting. Default project quota is 10,000 units/day.
// We hard-stop at 8,000 so a bug can never burn the whole day.
const LIMIT = Number(process.env.YT_QUOTA_LIMIT ?? 8000);
let used = 0;

export function spend(units: number, what: string) {
  used += units;
  if (used > LIMIT) throw new Error(`Quota guard: ${used} units used, stopping before ${what}`);
}
export const quotaUsed = () => used;
