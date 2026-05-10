/**
 * STORY-001 acceptance tests — assert that the workspace scaffold matches the layout
 * pinned by `.design/foundation/naming-conventions.md` and the version pins in
 * `.design/technology/tech-stack.md`.
 *
 * These tests are filesystem assertions: they exercise no business logic (none exists
 * in wave 1) but they would fail if a future change deletes a required package, drops
 * a pinned version, or renames a contract module.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

interface PackageJson {
  name?: string;
  version?: string;
  type?: string;
  packageManager?: string;
  engines?: Record<string, string>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  main?: string;
  exports?: unknown;
}

const readJson = (relPath: string): PackageJson => {
  const abs = join(repoRoot, relPath);
  return JSON.parse(readFileSync(abs, 'utf8')) as PackageJson;
};

const REQUIRED_PACKAGES: Array<{ dir: string; name: string }> = [
  { dir: 'apps/ui', name: '@neo-search/ui' },
  { dir: 'services/api', name: '@neo-search/api' },
  { dir: 'services/agent', name: '@neo-search/agent' },
  { dir: 'packages/contracts', name: '@neo-search/contracts' },
  { dir: 'packages/tools', name: '@neo-search/tools' },
  { dir: 'packages/tools-web-search', name: '@neo-search/tools-web-search' },
  { dir: 'packages/tools-data-store', name: '@neo-search/tools-data-store' },
  { dir: 'packages/data-history', name: '@neo-search/data-history' },
  { dir: 'packages/data-bookmarks', name: '@neo-search/data-bookmarks' },
  { dir: 'packages/data-cache', name: '@neo-search/data-cache' },
  { dir: 'packages/test-fixtures', name: '@neo-search/test-fixtures' },
  { dir: 'packages/ui-tokens', name: '@neo-search/ui-tokens' },
];

describe('STORY-001 root package.json (FR-024, FR-025 substrate)', () => {
  const root = readJson('package.json');

  it('declares ESM ("type": "module") per .design/foundation/conventions.md', () => {
    expect(root.type).toBe('module');
  });

  it('pins pnpm via packageManager === pnpm@9.12.3 per technology/tech-stack.md', () => {
    expect(root.packageManager).toBe('pnpm@9.12.3');
  });

  it('pins Node 22.11.0 in engines per technology/tech-stack.md', () => {
    expect(root.engines?.node).toBe('22.11.0');
  });

  it('exposes install / build / lint / format / test scripts (clean-checkout smoke check)', () => {
    expect(root.scripts?.build).toBeTruthy();
    expect(root.scripts?.lint).toBeTruthy();
    expect(root.scripts?.format).toBeTruthy();
    expect(root.scripts?.test).toBeTruthy();
  });

  it('pins TypeScript 5.6.3, Prettier 3.3.3, ESLint 9.14.0, typescript-eslint 8.13.0, Nx 20.1.4', () => {
    expect(root.devDependencies?.typescript).toBe('5.6.3');
    expect(root.devDependencies?.prettier).toBe('3.3.3');
    expect(root.devDependencies?.eslint).toBe('9.14.0');
    expect(root.devDependencies?.['typescript-eslint']).toBe('8.13.0');
    expect(root.devDependencies?.nx).toBe('20.1.4');
  });
});

describe('STORY-001 workspace layout (naming-conventions.md)', () => {
  it.each(REQUIRED_PACKAGES)('has $dir with package.json named $name', ({ dir, name }) => {
    const pkgPath = join(repoRoot, dir, 'package.json');
    expect(existsSync(pkgPath), `missing package.json at ${dir}`).toBe(true);
    const pkg = readJson(`${dir}/package.json`);
    expect(pkg.name).toBe(name);
  });

  it.each(REQUIRED_PACKAGES)(
    'has $dir/tsconfig.json extending root tsconfig.base.json',
    ({ dir }) => {
      const tsconfigPath = join(repoRoot, dir, 'tsconfig.json');
      expect(existsSync(tsconfigPath), `missing tsconfig.json at ${dir}`).toBe(true);
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8')) as { extends?: string };
      expect(tsconfig.extends).toBeDefined();
      // Resolve the extends path and assert it lands on the repo's tsconfig.base.json.
      const extendsAbs = resolve(join(repoRoot, dir), tsconfig.extends!);
      expect(extendsAbs).toBe(join(repoRoot, 'tsconfig.base.json'));
    },
  );

  it.each(REQUIRED_PACKAGES)('has $dir/src/index.ts as the public surface', ({ dir }) => {
    const indexPath = join(repoRoot, dir, 'src', 'index.ts');
    expect(existsSync(indexPath), `missing src/index.ts at ${dir}`).toBe(true);
    expect(statSync(indexPath).isFile()).toBe(true);
  });

  it('every package declares "type": "module"', () => {
    for (const { dir } of REQUIRED_PACKAGES) {
      const pkg = readJson(`${dir}/package.json`);
      expect(pkg.type, `${dir}/package.json must set "type": "module"`).toBe('module');
    }
  });
});

describe('STORY-001 root tsconfig.base.json (conventions.md)', () => {
  const tsconfigBase = JSON.parse(readFileSync(join(repoRoot, 'tsconfig.base.json'), 'utf8')) as {
    compilerOptions: Record<string, unknown>;
  };

  it('enables strict mode', () => {
    expect(tsconfigBase.compilerOptions.strict).toBe(true);
  });

  it('uses NodeNext module + moduleResolution', () => {
    expect(tsconfigBase.compilerOptions.module).toBe('NodeNext');
    expect(tsconfigBase.compilerOptions.moduleResolution).toBe('NodeNext');
  });

  it('targets ES2022', () => {
    expect(tsconfigBase.compilerOptions.target).toBe('ES2022');
  });
});

describe('STORY-001 contract module placeholders (FR-021)', () => {
  const contractFiles = [
    'packages/contracts/src/ui-api.ts',
    'packages/contracts/src/api-agent.ts',
    'packages/contracts/src/agent-tools.ts',
    'packages/contracts/src/tools/data-store.ts',
  ];

  it.each(contractFiles)('%s exists as a placeholder module', (relPath) => {
    expect(existsSync(join(repoRoot, relPath))).toBe(true);
  });

  it('packages/contracts/src/index.ts re-exports each of the four boundary modules', () => {
    const index = readFileSync(join(repoRoot, 'packages/contracts/src/index.ts'), 'utf8');
    expect(index).toMatch(/from '\.\/ui-api\.js'/);
    expect(index).toMatch(/from '\.\/api-agent\.js'/);
    expect(index).toMatch(/from '\.\/agent-tools\.js'/);
    expect(index).toMatch(/from '\.\/tools\/data-store\.js'/);
  });
});

describe('STORY-001 exact-version pinning (technology/tech-stack.md)', () => {
  // No `^`, `~`, `>=`, `*`, or `latest` ranges allowed in any package.json.
  // CI in STORY-018 will add a grep for this same rule.
  const RANGE_FORBIDDEN = /^(\^|~|>=|>|<=|<|\*|latest)/;
  // Workspace protocol IS allowed for cross-package internal links.
  const WORKSPACE_PROTOCOL = /^workspace:/;

  const allPackageJsons = [
    'package.json',
    ...REQUIRED_PACKAGES.map(({ dir }) => `${dir}/package.json`),
  ];

  it.each(allPackageJsons)('%s pins every dependency to an exact version', (relPath) => {
    const pkg = readJson(relPath);
    const buckets = [
      pkg.dependencies,
      pkg.devDependencies,
      pkg.peerDependencies,
      pkg.optionalDependencies,
    ];
    for (const bucket of buckets) {
      if (!bucket) continue;
      for (const [name, version] of Object.entries(bucket)) {
        if (WORKSPACE_PROTOCOL.test(version)) continue;
        expect(
          RANGE_FORBIDDEN.test(version),
          `${relPath}: ${name}@${version} uses a range; tech-stack.md forbids ^/~/latest`,
        ).toBe(false);
      }
    }
  });
});

describe('STORY-001 README smoke check (Definition of done)', () => {
  it('README.md documents pnpm install && pnpm build && pnpm lint', () => {
    const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
    expect(readme).toMatch(/pnpm install/);
    expect(readme).toMatch(/pnpm build/);
    expect(readme).toMatch(/pnpm lint/);
  });
});

describe('STORY-001 workspace plumbing', () => {
  it('pnpm-workspace.yaml lists apps/services/packages globs', () => {
    const ws = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
    expect(ws).toMatch(/apps\/\*/);
    expect(ws).toMatch(/services\/\*/);
    expect(ws).toMatch(/packages\/\*/);
  });

  it('nx.json exists at the repo root', () => {
    expect(existsSync(join(repoRoot, 'nx.json'))).toBe(true);
  });

  it('eslint.config.mjs exists at the repo root (flat config per ESLint 9)', () => {
    expect(existsSync(join(repoRoot, 'eslint.config.mjs'))).toBe(true);
  });

  it('Prettier config exists at the repo root', () => {
    expect(existsSync(join(repoRoot, '.prettierrc.json'))).toBe(true);
  });
});
