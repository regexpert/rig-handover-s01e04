// Morning digest: shared types (plan.md § 1). Views, routes and tests build against this file;
// the implementation lives in `src/digest/read.ts` (`export const readNight: ReadNight`).

/** Status of one run line in `runs/<night>.jsonl`. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/** One row per job for a night. */
export type DigestRow = {
  job: string;
  /** Owner on the job's latest line; `null` when the log says so. Keep the row; views show `—`. */
  owner: string | null;
  /** Count of valid lines for this job. */
  runs: number;
  /** Count of valid lines for this job with status `retry`. */
  retries: number;
  /** Status of the job's latest line (by `at`; file order breaks ties). */
  lastStatus: RunStatus;
  /** `error` of the job's latest line, or `null` if that line has none. */
  lastError: string | null;
  /** `at` of the job's earliest line, the original string with its offset (never converted to UTC). */
  first: string;
  /** `at` of the job's latest line, the original string with its offset (never converted to UTC). */
  last: string;
};

/** A night that has a file on disk. */
export type NightDigest = {
  /** Rows sorted by `job` (ascending, plain string compare). Empty for an empty file. */
  rows: DigestRow[];
  /** Non-blank lines that did not parse as JSON or failed the shape check. Counted, never thrown. */
  badLines: number;
};

/**
 * Read `<runsDir>/<night>.jsonl` (`night` is `YYYY-MM-DD`).
 *
 * - Returns `null` when there is no file for that night (or `night` is not `YYYY-MM-DD`):
 *   routes answer 404.
 * - An empty file returns `{ rows: [], badLines: 0 }`: the page renders "nothing ran".
 * - Never throws on bad lines; blank lines are ignored and not counted as bad.
 * - Synchronous, pure logic (no Hono).
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
