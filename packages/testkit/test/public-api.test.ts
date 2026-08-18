import { describe, expect, it } from 'vitest';
import * as testkit from '../src/index.js';

describe('public runtime evidence boundary', () => {
  it('does not export arbitrary region method dispatchers', () => {
    expect('callRegionMethod' in testkit).toBe(false);
    expect('callRegionMethodAndWaitForEvent' in testkit).toBe(false);
  });

  it('exports only named lifecycle operations', () => {
    expect(typeof testkit.refreshRegionAndWait).toBe('function');
    expect(typeof testkit.fetchFacetCountsAndWait).toBe('function');
  });

  it('does not expose Cards methods confirmed broken at runtime', () => {
    const cards = new testkit.ApexCardsRegion({} as any, 'cards');
    expect('getRecords' in cards).toBe(false);
    expect('getModel' in cards).toBe(false);
  });
});
