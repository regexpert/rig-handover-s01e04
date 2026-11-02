import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('has 5 jobs, sorted by job, and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night!.badLines).toBe(1);
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries and keeps the last status, error and offset times', () => {
    const byJob = new Map(night!.rows.map((r) => [r.job, r]));
    expect(byJob.get('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      first: '2026-10-29T01:30:00+01:00',
      last: '2026-10-29T01:37:00+01:00',
    });
    expect(byJob.get('lane/sync')).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok' });
    expect(byJob.get('lane/sync')!.first).toBe('2026-10-28T23:00:06+01:00');
    expect(byJob.get('notes/backup')).toMatchObject({
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
      owner: 'lane-07',
    });
  });

  it('keeps a row whose owner is null', () => {
    const row = night!.rows.find((r) => r.job === 'digest/render');
    expect(row).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok' });
  });
});

describe('readNight edge cases (temp runs dir)', () => {
  it('returns null when the night has no file', () => {
    expect(readNight(tmp, '2026-01-01')).toBeNull();
    expect(readNight(join(tmp, 'nope'), '2026-01-01')).toBeNull();
    expect(readNight(tmp, '../etc')).toBeNull();
  });

  it('returns no rows and no bad lines for an empty file', () => {
    writeFileSync(join(tmp, '2026-01-02.jsonl'), '');
    expect(readNight(tmp, '2026-01-02')).toEqual({ rows: [], badLines: 0 });
  });

  it('counts unparseable and wrongly shaped lines without throwing', () => {
    const lines = [
      '{"at":"2026-01-03T01:00:00+02:00","job":"a","status":"retry","owner":null,"error":"x"}',
      'not json',
      '[]',
      '{"at":"2026-01-03T02:00:00+02:00","job":"a","status":"maybe","owner":null}',
      '{"at":"2026-01-03T02:00:00+02:00","job":"a","status":"ok","owner":5}',
      '',
      '{"at":"2026-01-03T03:00:00+02:00","job":"a","status":"fail","owner":null,"error":"boom"}',
    ];
    writeFileSync(join(tmp, '2026-01-03.jsonl'), lines.join('\n') + '\n');
    expect(readNight(tmp, '2026-01-03')).toEqual({
      badLines: 4,
      rows: [
        {
          job: 'a',
          owner: null,
          runs: 2,
          retries: 1,
          lastStatus: 'fail',
          lastError: 'boom',
          first: '2026-01-03T01:00:00+02:00',
          last: '2026-01-03T03:00:00+02:00',
        },
      ],
    });
  });
});
