/**
 * Regression test for a real, documented incident (see
 * .ai/knowledge/generator.md, .claude/agents/runtime-test-automation-engineer.md):
 * `coverage.ts`'s `UNTRACKABLE_REGION_TYPES` and `unsupported.ts`'s
 * region-shaped stubs (`TreeRegion`/`Calendar`/`MapRegion`) must name the
 * EXACT same set of `ApexRegion.type` strings. When Interactive Grid
 * graduated from a stub to a real component (`ApexInteractiveGridRegion`),
 * its type string ('interactiveGrid') was removed from `unsupported.ts` but
 * NOT from `UNTRACKABLE_REGION_TYPES` -- Interactive Grid's real, recorded
 * coverage was silently excluded from every coverage report for an entire
 * prior session as a result.
 *
 * "In sync" here means EXACT set equality between:
 *   - `UNTRACKABLE_REGION_TYPES` (packages/generator/src/coverage.ts)
 *   - `Object.keys(REGION_STUB_TYPES)` (packages/testkit/src/components/unsupported.ts)
 * NOT a subset relationship either direction -- a type present in one but
 * not the other is drift, regardless of which side is missing it. Verified
 * against the real, current shape of both files before writing this (see
 * their own doc comments) rather than assumed.
 *
 * `REGION_STUB_TYPES` is `unsupported.ts`'s own single source of truth for
 * "these are the region-shaped stubs" (item-shaped stubs like Switch/
 * RadioGroup/PopupLov/RichText/FileBrowse/Shuttle are deliberately NOT region
 * types and must never appear here) -- this test cross-references it
 * directly against `coverage.ts`'s set, rather than hand-duplicating the
 * list a third time.
 */
import { describe, expect, it } from 'vitest';
import { REGION_STUB_TYPES, UnsupportedComponentError } from '@apx/testkit';
import { UNTRACKABLE_REGION_TYPES } from '../src/coverage.js';

describe('UNTRACKABLE_REGION_TYPES <-> unsupported.ts REGION_STUB_TYPES sync', () => {
  it('coverage.ts and unsupported.ts agree on the exact same set of untrackable region types', () => {
    const fromCoverage = [...UNTRACKABLE_REGION_TYPES].sort();
    const fromStubs = Object.keys(REGION_STUB_TYPES).sort();

    // Two-directional check, reported separately so a failure states EXACTLY
    // which file is out of date, not just "these don't match".
    const missingFromCoverage = fromStubs.filter((t) => !UNTRACKABLE_REGION_TYPES.has(t));
    const missingFromStubs = fromCoverage.filter((t) => !(t in REGION_STUB_TYPES));

    expect(
      missingFromCoverage,
      'unsupported.ts has a region-shaped stub whose type is not in coverage.ts\'s ' +
        'UNTRACKABLE_REGION_TYPES -- that region type\'s coverage will be silently counted ' +
        'as "untouched" instead of "untrackable". Add it to UNTRACKABLE_REGION_TYPES.',
    ).toEqual([]);

    expect(
      missingFromStubs,
      'coverage.ts\'s UNTRACKABLE_REGION_TYPES names a type with no corresponding region-shaped ' +
        'stub in unsupported.ts\'s REGION_STUB_TYPES -- either the stub graduated to a real ' +
        'component and this entry was never removed (the exact Interactive Grid incident), or ' +
        'the type was added to coverage.ts without ever adding the matching stub. Fix ' +
        'whichever file is wrong.',
    ).toEqual([]);

    expect(fromCoverage).toEqual(fromStubs);
  });

  it('every region type in UNTRACKABLE_REGION_TYPES still resolves to a genuine, unbuilt stub (has not graduated)', () => {
    // Guards specifically against the "graduated but the set was never
    // trimmed" half of the Interactive Grid incident: if a stub's
    // constructor stops throwing (e.g. its name got quietly reused by a
    // real, working component), this fails loudly instead of silently
    // under-reporting coverage forever.
    for (const type of UNTRACKABLE_REGION_TYPES) {
      const Stub = REGION_STUB_TYPES[type];
      expect(Stub, `no stub registered in REGION_STUB_TYPES for untrackable type '${type}'`).toBeDefined();
      expect(
        () => new Stub({} as never, 'dummy-id'),
        `REGION_STUB_TYPES['${type}'] did not throw UnsupportedComponentError -- it may have ` +
          'graduated to a real component without being removed from UNTRACKABLE_REGION_TYPES.',
      ).toThrow(UnsupportedComponentError);
    }
  });
});
