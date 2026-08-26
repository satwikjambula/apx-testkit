import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ApexApplication } from '@apx/parser';
import { generate, resolveStaticApplicationSubstitutions } from '../src/lib.js';

const application: ApexApplication = {
  identifier: 'sample-reporting',
  name: 'Sample Reporting',
  alias: 'SAMPLE-REPORTING',
  version: null,
  type: 'standard',
  runtime: { friendlyUrls: true, compatibilityMode: '26.1' },
  staticSubstitutions: [
    {
      identifier: 'APP_NAME',
      name: 'APP_NAME',
      staticValue: 'Sample Reporting',
      loc: { file: 'application.apx', line: 8 },
      raw: { 'value.staticValue': 'Sample Reporting' },
    },
  ],
  loc: { file: 'application.apx', line: 1 },
  raw: {},
};

describe('static application substitution resolution', () => {
  it('resolves only exported static application substitutions', () => {
    expect(resolveStaticApplicationSubstitutions('Sign In | &APP_NAME.', application)).toEqual({
      value: 'Sign In | Sample Reporting',
      unresolvedTokens: [],
    });
  });

  it('leaves built-ins, filtered values, and template placeholders unresolved', () => {
    expect(
      resolveStaticApplicationSubstitutions(
        'User &APP_USER. / &APP_NAME!HTML. / #APP_VERSION#',
        application,
      ),
    ).toEqual({
      value: 'User &APP_USER. / &APP_NAME!HTML. / #APP_VERSION#',
      unresolvedTokens: ['#APP_VERSION#', '&APP_NAME!HTML.', '&APP_USER.'],
    });
  });

  it('does not recursively guess at substitutions embedded in a static value', () => {
    const nested: ApexApplication = {
      ...application,
      staticSubstitutions: [
        { ...application.staticSubstitutions[0]!, staticValue: 'Sample &APP_USER.' },
      ],
    };
    expect(resolveStaticApplicationSubstitutions('&APP_NAME.', nested)).toEqual({
      value: 'Sample &APP_USER.',
      unresolvedTokens: ['&APP_USER.'],
    });
  });
});

describe('generated title assertions', () => {
  it('uses a statically resolved title and omits runtime-dependent exact assertions', () => {
    const exportDir = mkdtempSync(join(tmpdir(), 'apx-title-substitution-export-'));
    const outDir = mkdtempSync(join(tmpdir(), 'apx-title-substitution-out-'));
    try {
      mkdirSync(join(exportDir, '.apex'));
      mkdirSync(join(exportDir, 'pages'));
      writeFileSync(
        join(exportDir, '.apex', 'apexlang.json'),
        JSON.stringify({ mmdVersion: '26.1.0-test' }),
      );
      writeFileSync(
        join(exportDir, 'application.apx'),
        `app sample-reporting (
  name: Sample Reporting
  alias: SAMPLE-REPORTING
  type: standard
  runtime {
    friendlyUrls: true
    compatibilityMode: "26.1"
  }
)
substitution APP_NAME (
  value {
    staticValue: Sample Reporting
  }
)
`,
      );
      writeFileSync(
        join(exportDir, 'pages', 'p00101-login.apx'),
        `page 101 (
  name: Login
  alias: LOGIN
  title: Sign In | &APP_NAME.
  security {
    pageAccessProtection: unrestricted
    authentication: public
  }
)
`,
      );
      writeFileSync(
        join(exportDir, 'pages', 'p00102-runtime-title.apx'),
        `page 102 (
  name: Runtime Title
  alias: RUNTIME-TITLE
  title: Welcome &APP_USER.
  security {
    pageAccessProtection: unrestricted
    authentication: public
  }
)
`,
      );

      generate(exportDir, outDir);
      const resolved = readFileSync(join(outDir, 'p00101-login.spec.ts'), 'utf8');
      expect(resolved).toContain("normalizeTitle('Sign In | Sample Reporting')");
      expect(resolved).not.toContain("normalizeTitle('Sign In | &APP_NAME.')");

      const unresolved = readFileSync(join(outDir, 'p00102-runtime-title.spec.ts'), 'utf8');
      expect(unresolved).toContain('Exact title assertion omitted');
      expect(unresolved).toContain('&APP_USER.');
      expect(unresolved).not.toContain("test('title matches metadata");
    } finally {
      rmSync(exportDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
