import { describe, expect, it } from 'vitest';
import { apexPageUrl, normalizeTitle } from '../src/fixtures/session.js';

describe('apexPageUrl', () => {
  it('lowercases the alias and joins without double slashes', () => {
    expect(apexPageUrl('https://host/ords/r/app/', 'DATA-ENTRY-SIMPLE-FORM')).toBe(
      'https://host/ords/r/app/data-entry-simple-form',
    );
  });

  it('handles a base with no trailing slash', () => {
    expect(apexPageUrl('https://host/ords/r/app', 'home')).toBe('https://host/ords/r/app/home');
  });
});

describe('normalizeTitle', () => {
  it('folds unicode dash variants to a plain hyphen', () => {
    expect(normalizeTitle('Data Entry – Simple Form')).toBe('Data Entry - Simple Form');
  });

  it('collapses whitespace and NBSP runs', () => {
    expect(normalizeTitle('Data Entry   Simple')).toBe('Data Entry Simple');
  });

  it('is idempotent', () => {
    const once = normalizeTitle('Data Entry – Simple Form');
    expect(normalizeTitle(once)).toBe(once);
  });
});
