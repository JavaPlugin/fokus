import { describe, expect, it } from 'vitest';
import { withRetry } from './github';

const noSleep = { sleep: async () => undefined };

describe('withRetry', () => {
  it('übersteht kurze Netzaussetzer', async () => {
    let n = 0;
    const flaky: typeof fetch = async () => {
      n++;
      if (n < 3) throw new TypeError('fetch failed: ECONNRESET');
      return new Response('ok');
    };
    const res = await withRetry(flaky, 'https://api.github.com/x', {}, noSleep);
    expect(await res.text()).toBe('ok');
    expect(n).toBe(3);
  });

  it('wiederholt 5xx, aber nicht 4xx', async () => {
    let n = 0;
    const status =
      (code: number): typeof fetch =>
      async () => (n++, new Response('', { status: code }));
    await expect(withRetry(status(502), 'u', {}, noSleep)).rejects.toThrow(
      'GitHub nicht erreichbar',
    );
    expect(n).toBe(4);
    n = 0;
    expect((await withRetry(status(404), 'u', {}, noSleep)).status).toBe(404);
    expect(n).toBe(1);
  });
});
