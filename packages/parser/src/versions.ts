/**
 * APEXlang export releases this parser accepts, and the per-release facts
 * that differ between them.
 *
 * Support here means STATIC parsing of exports (see docs/support-matrix.md);
 * it is not a claim that runtime behaviour was verified on that release.
 */
export const SUPPORTED_APEX_RELEASES = ['26.1', '26.2'] as const;
export type SupportedApexRelease = (typeof SUPPORTED_APEX_RELEASES)[number];

/** `"26.2.0+3479"` -> `"26.2"`; `null` when the string does not start with `<major>.<minor>`. */
export function apexReleaseOf(mmdVersion: string): string | null {
  const match = /^(\d+\.\d+)(?:\.|$)/.exec(mmdVersion);
  return match ? match[1]! : null;
}

export function supportedApexRelease(mmdVersion: string): SupportedApexRelease | null {
  const release = apexReleaseOf(mmdVersion);
  return (SUPPORTED_APEX_RELEASES as readonly string[]).includes(release ?? '')
    ? (release as SupportedApexRelease)
    : null;
}

export type PageAccessProtection = 'unrestricted' | 'argumentsMustHaveChecksum' | 'noArgumentsSupported' | 'noUrlAccess';

/**
 * What an OMITTED `security.pageAccessProtection` means, per release.
 *
 * 26.2 exports omit `argumentsMustHaveChecksum` where 26.1 wrote it
 * explicitly. Evidence (static, oracle/apex `26.1` vs `26.2` branches, the
 * same 33 sample apps, 1,490 pages paired by app + page number): 1,431 pages
 * went `argumentsMustHaveChecksum` -> omitted, 13 went omitted ->
 * `unrestricted`, 17 stayed `noArgumentsSupported`. Zero 26.2 pages write
 * `argumentsMustHaveChecksum` explicitly. See docs/grammar-assumptions.md.
 *
 * 26.1 is `null` (no default asserted): this keeps the 26.1 behaviour
 * unchanged -- an omitted value stays unrecognized and the generator
 * refuses to assume direct navigation is safe.
 */
export const OMITTED_PAGE_ACCESS_PROTECTION: Record<SupportedApexRelease, PageAccessProtection | null> = {
  '26.1': null,
  '26.2': 'argumentsMustHaveChecksum',
};
