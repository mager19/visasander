import { sql } from './db';

/** Returns true while the caller is still within `limit` hits per `windowSeconds`. */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const rows = await sql()`
    insert into rate_limits (key, count, window_start) values (${key}, 1, now())
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}::int) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}::int) then now() else rate_limits.window_start end
    returning count`;
  return (rows[0].count as number) <= limit;
}
