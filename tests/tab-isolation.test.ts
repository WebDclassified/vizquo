import { describe, expect, it } from 'vitest';
import { isForTab } from '../shared/tab-isolation';

describe('multi-tab isolation (Section 7.27)', () => {
  it('consumes payloads stamped for the connected tab', () => {
    expect(isForTab(7, 7)).toBe(true);
  });

  it('drops payloads stamped for another tab', () => {
    expect(isForTab(7, 9)).toBe(false);
  });

  it('accepts legacy unstamped payloads when connected', () => {
    expect(isForTab(undefined, 9)).toBe(true);
  });

  it('ignores everything when the panel has no connected tab', () => {
    expect(isForTab(7, undefined)).toBe(false);
    expect(isForTab(undefined, undefined)).toBe(false);
  });
});
