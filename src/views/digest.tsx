import type { NightDigest } from '../digest/types.js';

const dash = '—';

export function DigestPage({ night, digest }: { night: string; digest: NightDigest }) {
  return (
    <>
      <h1>digest · {night}</h1>
      {digest.badLines > 0 ? (
        <p class="warn">
          {digest.badLines} bad line{digest.badLines === 1 ? '' : 's'} skipped
        </p>
      ) : null}
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((r) => (
              <tr>
                <td>{r.job}</td>
                <td>{r.owner ?? dash}</td>
                <td>{r.runs}</td>
                <td class={r.retries >= 3 ? 'warn' : undefined}>
                  {r.retries}
                  {r.retries >= 3 ? ' [!] many retries' : ''}
                </td>
                <td class={r.lastStatus === 'fail' ? 'warn' : undefined}>
                  {r.lastStatus === 'fail' ? '[FAIL] fail' : r.lastStatus}
                </td>
                <td>{r.lastError ?? dash}</td>
                <td>{r.first}</td>
                <td>{r.last}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
