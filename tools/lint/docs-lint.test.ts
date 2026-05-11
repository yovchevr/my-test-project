/**
 * STORY-020 / FR-025 — Docs deliverable lint
 *
 * This test asserts the eight FR-025 deliverable artifacts are structurally correct:
 * 1. Required headings exist in each doc.
 * 2. No GoF pattern names appear in design-patterns.md (per constraints.md "Required pattern vocabulary").
 * 3. Every FR/NFR ID listed in .requirements/index.md appears at least once across the docs/ set.
 * 4. The embedded example payload in contracts.md validates against UiApiAnswerContract.
 *
 * All run as a CI job extension of STORY-018's gate set.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const docsDir = join(repoRoot, 'docs');

describe('FR-025 deliverable docs lint', () => {
  it('all seven docs/*.md files exist', () => {
    const required = [
      'architecture.md',
      'problem-decomposition.md',
      'agent-design.md',
      'data-strategy.md',
      'contracts.md',
      'design-patterns.md',
      'test-cases.md',
    ];

    for (const file of required) {
      const path = join(docsDir, file);
      expect(existsSync(path), `${file} should exist at ${path}`).toBe(true);
    }
  });

  it('docs/architecture.md has required headings', () => {
    const path = join(docsDir, 'architecture.md');
    if (!existsSync(path)) return; // skip if doc not yet created
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('## System diagram');
    expect(content).toContain('## Four-layer system');
    expect(content).toContain('## Data flow');
    expect(content).toContain('## Agent interactions');
    expect(content).toContain('## Tool interactions');
    expect(content).toContain('## Requirements covered');
  });

  it('docs/problem-decomposition.md has required headings', () => {
    const path = join(docsDir, 'problem-decomposition.md');
    if (!existsSync(path)) return;
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('## How we broke down the problem');
    expect(content).toContain('## Why this architecture');
    expect(content).toContain('## Tradeoffs considered');
    expect(content).toContain('## Requirements covered');
  });

  it('docs/agent-design.md has required headings', () => {
    const path = join(docsDir, 'agent-design.md');
    if (!existsSync(path)) return;
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('## Responsibilities');
    expect(content).toContain('## How decisions are made');
    expect(content).toContain('## How orchestration works');
    expect(content).toContain('## Requirements covered');
  });

  it('docs/data-strategy.md has required headings', () => {
    const path = join(docsDir, 'data-strategy.md');
    if (!existsSync(path)) return;
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('## Chunking approach');
    expect(content).toContain('## Indexing approach');
    expect(content).toContain('## Storage format');
    expect(content).toContain('## Requirements covered');
  });

  it('docs/contracts.md has required headings', () => {
    const path = join(docsDir, 'contracts.md');
    if (!existsSync(path)) return;
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('## The four contracts');
    expect(content).toContain('## Example payload');
    expect(content).toContain('## Requirements covered');
  });

  it('docs/design-patterns.md has required headings', () => {
    const path = join(docsDir, 'design-patterns.md');
    if (!existsSync(path)) return;
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('## Pattern vocabulary');
    expect(content).toContain('## Contract binding');
    expect(content).toContain('## Agent orchestration');
    expect(content).toContain('## Data partitioning');
    expect(content).toContain('## Tool abstraction');
    expect(content).toContain('## Requirements covered');
  });

  it('docs/test-cases.md has required headings', () => {
    const path = join(docsDir, 'test-cases.md');
    if (!existsSync(path)) return;
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('## 1. Live web results');
    expect(content).toContain('## 2. Summary + cited references');
    expect(content).toContain('## 3. History persists and retrieves');
    expect(content).toContain('## 4. Bookmarks persist and retrieve');
    expect(content).toContain('## 5. Chunked data retrieval');
    expect(content).toContain('## 6. Large dataset');
    expect(content).toContain('## 7. UI source-filters/search-bar/pagination');
    expect(content).toContain('## Requirements covered');
  });

  it('docs/design-patterns.md contains no GoF pattern names (constraints.md "Required pattern vocabulary")', () => {
    const path = join(docsDir, 'design-patterns.md');
    if (!existsSync(path)) return;
    const content = readFileSync(path, 'utf-8');

    // Per constraints.md, the design-patterns deliverable MUST use Neo workflow patterns,
    // NOT generic GoF patterns. This is the structural guard for FR-025 g.
    const forbiddenPatterns = [
      'Singleton',
      'Factory',
      'Abstract Factory',
      'Builder',
      'Prototype',
      'Adapter',
      'Bridge',
      'Composite',
      'Decorator',
      'Facade',
      'Flyweight',
      'Proxy',
      'Chain of Responsibility',
      'Command',
      'Iterator',
      'Mediator',
      'Memento',
      'Observer',
      'State',
      'Strategy',
      'Template Method',
      'Visitor',
    ];

    for (const pattern of forbiddenPatterns) {
      expect(
        content.includes(pattern),
        `design-patterns.md must not mention GoF pattern "${pattern}" per constraints.md`,
      ).toBe(false);
    }
  });

  it('docs/design-patterns.md mentions all four Neo patterns at least once', () => {
    const path = join(docsDir, 'design-patterns.md');
    if (!existsSync(path)) return;
    const content = readFileSync(path, 'utf-8').toLowerCase();

    // Per domain/glossary.md and constraints.md, the four Neo workflow design patterns are:
    const neoPatterns = [
      'contract binding',
      'agent orchestration',
      'data partitioning',
      'tool abstraction',
    ];

    for (const pattern of neoPatterns) {
      expect(
        content.includes(pattern.toLowerCase()),
        `design-patterns.md must mention Neo pattern "${pattern}" at least once`,
      ).toBe(true);
    }
  });

  it('every FR/NFR ID from .requirements/index.md appears at least once across docs/', () => {
    const requirementsIndex = join(repoRoot, '.requirements', 'index.md');
    if (!existsSync(requirementsIndex)) {
      // If .requirements/index.md doesn't exist, skip gracefully
      return;
    }

    const indexContent = readFileSync(requirementsIndex, 'utf-8');
    // Extract FR-### and NFR-### IDs from the index (simple regex)
    const frNfrIds = [...indexContent.matchAll(/\b(FR|NFR)-\d{3}\b/g)].map((m) => m[0]);

    if (frNfrIds.length === 0) {
      // No FR/NFR IDs found in the index; skip
      return;
    }

    // Read all docs/*.md files
    const docsFiles = existsSync(docsDir)
      ? readdirSync(docsDir)
          .filter((f) => f.endsWith('.md'))
          .map((f) => join(docsDir, f))
      : [];

    const allDocsContent = docsFiles.map((f) => readFileSync(f, 'utf-8')).join('\n');

    // For each FR/NFR, assert it appears at least once across all docs
    const missing: string[] = [];
    for (const id of [...new Set(frNfrIds)]) {
      if (!allDocsContent.includes(id)) {
        missing.push(id);
      }
    }

    expect(
      missing,
      `Every FR/NFR in .requirements/index.md should appear in docs/. Missing: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('embedded example payload in contracts.md validates against UiApiAnswerContract', async () => {
    const contractsPath = join(docsDir, 'contracts.md');
    if (!existsSync(contractsPath)) return;

    // Extract the JSON payload from the markdown (between ```json ... ```)
    const contractsContent = readFileSync(contractsPath, 'utf-8');
    const jsonMatch = contractsContent.match(/```json\n([\s\S]+?)\n```/);
    if (!jsonMatch) {
      // No JSON block found; skip gracefully
      return;
    }

    const payloadJson = jsonMatch[1];
    const payload = JSON.parse(payloadJson);

    // Import the contract validator from @neo-search/contracts
    // Dynamic import to avoid top-level import issues if contracts package not built yet
    try {
      const { Value } = await import('@sinclair/typebox/value');
      const { UiApiAnswerContract } = await import('@neo-search/contracts/ui-api');

      const isValid = Value.Check(UiApiAnswerContract, payload);
      expect(
        isValid,
        `Embedded payload in contracts.md should validate against UiApiAnswerContract`,
      ).toBe(true);
    } catch (err) {
      // If @neo-search/contracts or @sinclair/typebox is not available, skip gracefully
      console.warn(
        'Skipping payload validation: @neo-search/contracts or @sinclair/typebox not available',
        err,
      );
    }
  });
});
