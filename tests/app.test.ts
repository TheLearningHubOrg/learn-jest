// One test file, four sections: matchers, test doubles, async code and fake timers.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { formatCents, subtotal, totalFor } from '../src/pricing.js';
import { debounce, isExpired, retryWithBackoff } from '../src/retry.js';
import { UserService } from '../src/userService.js';
import { NotFoundError, type HttpClient, type Notifier, type User } from '../src/types.js';

const ada: User = { id: 'u1', name: 'Ada', email: 'ada@example.com', plan: 'pro' };
const linus: User = { id: 'u2', name: 'Linus', email: 'linus@example.com', plan: 'free' };

// ---------------------------------------------------------------------------
// 1. Matchers on pure functions
// ---------------------------------------------------------------------------
describe('pricing', () => {
  const cart = [
    { sku: 'BOOK-1', unitPrice: 2999, quantity: 2 },
    { sku: 'PEN-9', unitPrice: 199, quantity: 3 },
  ];

  it('adds line items in cents', () => {
    expect(subtotal(cart)).toBe(6595);
    expect(subtotal([])).toBe(0);
  });

  it.each([
    ['free', 6595],
    ['pro', 5936],
    ['enterprise', 4946],
  ] as const)('applies the %s plan discount', (plan, expected) => {
    expect(totalFor({ plan }, cart)).toBe(expected);
  });

  it('rejects invalid quantities with a RangeError', () => {
    const bad = [{ sku: 'X', unitPrice: 100, quantity: 1.5 }];
    expect(() => subtotal(bad)).toThrow(RangeError);
    expect(() => subtotal(bad)).toThrow(/Invalid quantity for X/);
  });

  it('formats cents as currency', () => {
    expect(formatCents(5936)).toBe('$59.36');
    expect(0.1 + 0.2).toBeCloseTo(0.3, 10);
  });

  it('matches object shapes and inline snapshots', () => {
    const receipt = { user: ada.id, total: totalFor(ada, cart), issuedAt: new Date() };
    expect(receipt).toMatchObject({ user: 'u1', total: expect.any(Number) });
    expect(receipt).toMatchInlineSnapshot(
      { issuedAt: expect.any(Date) },
      `
{
  "issuedAt": Any<Date>,
  "total": 5936,
  "user": "u1",
}
`,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Test doubles: jest.fn(), typed mocks and spies
// ---------------------------------------------------------------------------
function makeDoubles() {
  // HttpClient.get is generic; the mock is pinned to the one payload this suite returns.
  const get = jest.fn<(url: string) => Promise<User | null>>();
  const send = jest.fn<Notifier['send']>().mockResolvedValue(undefined);
  const http = { get } as unknown as HttpClient;
  const service = new UserService(http, { send }, 'https://api.test');
  return { get, send, service };
}

describe('UserService', () => {
  it('fetches a user once and serves later calls from cache', async () => {
    const { get, service } = makeDoubles();
    get.mockResolvedValueOnce(ada);

    await expect(service.getUser('u1')).resolves.toEqual(ada);
    await expect(service.getUser('u1')).resolves.toBe(ada);

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('https://api.test/users/u1');
  });

  it('throws NotFoundError when the API returns null', async () => {
    const { get, service } = makeDoubles();
    get.mockResolvedValue(null);

    await expect(service.getUser('ghost')).rejects.toThrow(NotFoundError);
    await expect(service.getUser('ghost')).rejects.toThrow('User ghost not found');
  });

  it('rejects getUsers when any single fetch fails', async () => {
    const { get, service } = makeDoubles();
    get.mockImplementation(async (url: string) => {
      if (url.endsWith('/u2')) throw new Error('503 Service Unavailable');
      return ada;
    });

    await expect(service.getUsers(['u1', 'u2'])).rejects.toThrow('503');
  });

  it('welcome reports partial failures instead of throwing', async () => {
    const { get, send, service } = makeDoubles();
    get.mockImplementation(async (url: string) => (url.endsWith('/u1') ? ada : linus));
    send.mockRejectedValueOnce(new Error('SMTP down')); // the first send fails

    const result = await service.welcome(['u1', 'u2']);

    expect(result).toEqual({ sent: ['u2'], failed: ['u1'] });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls).toEqual(
      expect.arrayContaining([['linus@example.com', expect.stringContaining('Linus')]]),
    );
  });

  it('spies on an existing method without replacing its behaviour', async () => {
    const { get, service } = makeDoubles();
    get.mockResolvedValue(ada);
    const spy = jest.spyOn(service, 'getUser');

    await service.getUsers(['u1', 'u1']);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(2, 'u1');
    // restoreMocks: true in jest.config.js puts the original method back after each test
  });
});

// ---------------------------------------------------------------------------
// 3 + 4. Async retries and fake timers
// ---------------------------------------------------------------------------
describe('timers', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries with exponential backoff and eventually succeeds', async () => {
    const task = jest
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('flaky 1'))
      .mockRejectedValueOnce(new Error('flaky 2'))
      .mockResolvedValue('ok');
    const onRetry = jest.fn();

    const promise = retryWithBackoff(task, { retries: 3, baseDelayMs: 100, onRetry });

    await jest.advanceTimersByTimeAsync(99);
    expect(task).toHaveBeenCalledTimes(1); // still inside the first 100 ms delay

    await jest.advanceTimersByTimeAsync(1 + 200); // finish delay one, then the 200 ms delay
    await expect(promise).resolves.toBe('ok');

    expect(task).toHaveBeenCalledTimes(3);
    expect(onRetry.mock.calls.map(([attempt]) => attempt)).toEqual([1, 2]);
  });

  it('gives up after the configured number of retries', async () => {
    const task = jest.fn<() => Promise<never>>().mockRejectedValue(new Error('always down'));

    const promise = retryWithBackoff(task, { retries: 2, baseDelayMs: 50, maxDelayMs: 60 });
    const assertion = expect(promise).rejects.toThrow('always down'); // attach before advancing

    await jest.runAllTimersAsync();
    await assertion;
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('debounces bursts of calls into one trailing call', () => {
    const save = jest.fn<(draft: string) => void>();
    const debounced = debounce(save, 300);

    debounced('a');
    jest.advanceTimersByTime(200);
    debounced('ab');
    jest.advanceTimersByTime(200);
    debounced('abc');

    expect(save).not.toHaveBeenCalled();
    jest.advanceTimersByTime(300);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('abc');
  });

  it('cancel drops the pending call', () => {
    const save = jest.fn();
    const debounced = debounce(save, 300);

    debounced();
    debounced.cancel();
    jest.runAllTimers();

    expect(save).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('controls Date.now() through the fake clock', () => {
    const expiresAt = Date.parse('2026-01-01T00:05:00Z');
    expect(isExpired(expiresAt)).toBe(false);

    jest.setSystemTime(new Date('2026-01-01T00:04:31Z')); // inside the 30 s skew window
    expect(isExpired(expiresAt)).toBe(true);
  });
});
