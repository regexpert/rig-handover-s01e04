import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus } from './types.js';

type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly string[] = ['ok', 'retry', 'fail'] satisfies RunStatus[];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStatus(v: unknown): v is RunStatus {
  return typeof v === 'string' && STATUSES.includes(v);
}

// Parse one log line at the edge. Returns null for anything that is not a valid run line.
export function parseLine(text: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { at, job, status, owner, error } = value;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  return { at, job, status, owner, error: error ?? null };
}

// Fold the lines of one night into rows, one per job, sorted by job.
export function digestLines(lines: string[]): NightDigest {
  const byJob = new Map<string, { row: DigestRow; firstMs: number; lastMs: number }>();
  let badLines = 0;

  for (const text of lines) {
    if (text.trim() === '') continue;
    const line = parseLine(text);
    if (!line) {
      badLines++;
      continue;
    }
    const ms = Date.parse(line.at);
    const seen = byJob.get(line.job);
    if (!seen) {
      byJob.set(line.job, {
        row: {
          job: line.job,
          owner: line.owner,
          runs: 1,
          retries: line.status === 'retry' ? 1 : 0,
          lastStatus: line.status,
          lastError: line.error,
          first: line.at,
          last: line.at,
        },
        firstMs: ms,
        lastMs: ms,
      });
      continue;
    }
    seen.row.runs++;
    if (line.status === 'retry') seen.row.retries++;
    if (ms < seen.firstMs) {
      seen.firstMs = ms;
      seen.row.first = line.at;
    }
    if (ms >= seen.lastMs) {
      seen.lastMs = ms;
      seen.row.last = line.at;
      seen.row.lastStatus = line.status;
      seen.row.lastError = line.error;
      seen.row.owner = line.owner;
    }
  }

  const rows = [...byJob.values()]
    .map((s) => s.row)
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { rows, badLines };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if (isRecord(err) && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
    throw err;
  }
  return digestLines(text.split(/\r?\n/));
};
