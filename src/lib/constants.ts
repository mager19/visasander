export const MAX_ATTEMPTS = 5;
export const MAX_SESSIONS = 2;

export function retentionDays(): number {
  const n = Number(process.env.RETENTION_DAYS);
  return Number.isInteger(n) && n > 0 ? n : 90;
}
