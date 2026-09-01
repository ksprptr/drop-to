import { TtlCache } from './ttl-cache.functions';

describe('TtlCache', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns a stored value before it expires', () => {
    const cache = new TtlCache<string>(1000, 10);

    cache.set('a', 'value');

    expect(cache.get('a')).toBe('value');
  });

  it('returns undefined for a key that was never set', () => {
    expect(new TtlCache<string>(1000, 10).get('missing')).toBeUndefined();
  });

  it('drops a value once its TTL has passed', () => {
    jest.useFakeTimers();

    const cache = new TtlCache<string>(1000, 10);
    cache.set('a', 'value');

    jest.advanceTimersByTime(1001);

    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts the oldest entry when the cap is reached', () => {
    const cache = new TtlCache<string>(1000, 2);

    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
  });

  it('refreshes the TTL when an existing key is written again', () => {
    jest.useFakeTimers();

    const cache = new TtlCache<string>(1000, 10);
    cache.set('a', 'first');

    jest.advanceTimersByTime(800);
    cache.set('a', 'second');
    jest.advanceTimersByTime(800);

    expect(cache.get('a')).toBe('second');
  });
});
