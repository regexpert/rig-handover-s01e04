import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { DigestRow } from '../src/digest/types.js';

const runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
afterAll(() => rmSync(runsDir, { recursive: true, force: true }));

const config: RigConfig = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
};
const app = createApp(config);

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

// Jobs are written out of order on purpose: both routes must sort by job.
writeFileSync(
  join(runsDir, '2026-02-01.jsonl'),
  [
    line('2026-02-01T02:00:00+01:00', 'zeta/job', 'ok', 'rook'),
    line('2026-02-01T01:00:00+01:00', 'alpha/job', 'retry', null, 'flaky'),
    line('2026-02-01T01:10:00+01:00', 'alpha/job', 'ok', null),
    line('2026-02-01T03:00:00+01:00', 'mid/job', 'fail', 'lane-07', 'boom'),
  ].join('\n') + '\n',
);
writeFileSync(join(runsDir, '2026-02-02.jsonl'), '');
writeFileSync(
  join(runsDir, '2026-02-03.jsonl'),
  [
    line('2026-02-03T01:00:00+01:00', 'b/job', 'ok', 'rook'),
    'this is not json',
    line('2026-02-03T02:00:00+01:00', 'a/job', 'ok', 'rook'),
  ].join('\n') + '\n',
);

const JOBS = ['alpha/job', 'mid/job', 'zeta/job'];

// The JSON may be the bare rows or an object carrying them; both carry DigestRow[].
function rowsOf(body: unknown): DigestRow[] {
  if (Array.isArray(body)) return body as DigestRow[];
  const rows = (body as { rows?: unknown }).rows;
  expect(Array.isArray(rows)).toBe(true);
  return rows as DigestRow[];
}

// Jobs in the order they first appear in the page.
function pageJobs(html: string, jobs: string[]): string[] {
  return jobs
    .map((job) => ({ job, at: html.indexOf(job) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.job);
}

describe('GET /digest/:night', () => {
  it('200 for a night with rows, listing every job', async () => {
    const res = await app.request('/digest/2026-02-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of JOBS) expect(html).toContain(job);
    expect(html).not.toContain('nothing ran');
  });

  it('404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-02-09');
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await app.request('/digest/2026-02-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders a night with a bad line, and counts it', async () => {
    const res = await app.request('/digest/2026-02-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('a/job');
    expect(html).toContain('b/job');
    expect(html).toMatch(/\b1\b[^<]*(bad|unparse|skipped)|(bad|unparse|skipped)[^<]*\b1\b/i);
  });
});

describe('GET /api/digest/:night', () => {
  it('200 for a night with rows, as JSON', async () => {
    const res = await app.request('/api/digest/2026-02-01');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const rows = rowsOf(await res.json());
    expect(rows.map((r) => r.job)).toEqual(JOBS);
    expect(rows[0]).toMatchObject({
      job: 'alpha/job',
      owner: null,
      runs: 2,
      retries: 1,
      lastStatus: 'ok',
      lastError: null,
      first: '2026-02-01T01:00:00+01:00',
      last: '2026-02-01T01:10:00+01:00',
    });
  });

  it('404 for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-02-09');
    expect(res.status).toBe(404);
  });

  it('has empty rows for an empty night', async () => {
    const res = await app.request('/api/digest/2026-02-02');
    expect(res.status).toBe(200);
    expect(rowsOf(await res.json())).toEqual([]);
  });

  it('still answers 200 with the good rows for a night with a bad line', async () => {
    const res = await app.request('/api/digest/2026-02-03');
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(rowsOf(body).map((r) => r.job)).toEqual(['a/job', 'b/job']);
    // The bad line is counted when the body carries the count.
    if (!Array.isArray(body)) expect(JSON.stringify(body)).toMatch(/"badLines":1/);
  });
});

describe('page and JSON agree', () => {
  it.each(['2026-02-01', '2026-02-03'])('list the same jobs in the same order for %s', async (night) => {
    const html = await (await app.request(`/digest/${night}`)).text();
    const rows = rowsOf(await (await app.request(`/api/digest/${night}`)).json());
    const jobs = rows.map((r) => r.job);
    expect(jobs.length).toBeGreaterThan(0);
    expect(pageJobs(html, jobs)).toEqual(jobs);
  });
});
