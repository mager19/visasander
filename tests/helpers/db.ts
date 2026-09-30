import { beforeEach, describe } from 'vitest';
import { sql } from '@/lib/db';

export const describeDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

export function resetDb(): void {
  beforeEach(async () => {
    await sql()`truncate table rate_limits, files, sessions, applications`;
  });
}
