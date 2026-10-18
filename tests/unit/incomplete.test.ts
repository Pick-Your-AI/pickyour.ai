import { describe, expect, it } from 'vitest';
import { BASELINE_RULESET } from '../../src/contracts';
import { evaluateBuild } from '../../src/domain/evaluator';
import { incompleteBuild } from '../../src/features/builder/incomplete';
import { selectionOutcome } from '../../src/features/builder/analysis';
import { apiChat, buildWith, CATALOG, contradictory } from './scenarios';

const evaluate = (build: ReturnType<typeof buildWith>) =>
  evaluateBuild({ build, catalog: CATALOG, ruleset: BASELINE_RULESET });

describe('provisional incomplete presentation', () => {
  it.each([0, 1])('counts required primary choices on a build with %i picks', (count) => {
    const build = buildWith(count ? [['workload', 'support-chat']] : []);
    const report = evaluate(build);
    const before = JSON.stringify(report);
    const incomplete = incompleteBuild(build, report, BASELINE_RULESET);
    expect(incomplete).toMatchObject({ chosen: count, total: 4 });
    expect(incomplete?.remediation).toContain('Choose workload');
    expect(JSON.stringify(report)).toBe(before);
    expect(report.findings.find((f) => f.rule_id === 'rule.required.foundation')?.outcome).toBe(
      'fail',
    );
    if (count) {
      expect(selectionOutcome(report, build.selections[0]!.id)).toBe('fail');
      expect(selectionOutcome(report, build.selections[0]!.id, incomplete?.ruleIds)).toBe(
        'unknown',
      );
    }
  });

  it('does not infer completion for ambiguous duplicate primary selections', () => {
    const build = buildWith([['workload', 'support-chat']]);
    build.selections.push({ ...build.selections[0]!, id: 'selection.duplicate' });
    expect(incompleteBuild(build, evaluate(build), BASELINE_RULESET)).toBeUndefined();
  });

  it('does not count disabled or secondary choices', () => {
    const build = buildWith([['workload', 'support-chat']]);
    build.selections[0]!.enabled = false;
    expect(incompleteBuild(build, evaluate(build), BASELINE_RULESET)?.chosen).toBe(0);
    build.selections[0]!.enabled = true;
    build.selections[0]!.role = 'secondary';
    expect(incompleteBuild(build, evaluate(build), BASELINE_RULESET)?.chosen).toBe(0);
  });

  it('keeps actual conflicts incompatible even with required slots missing', () => {
    const build = contradictory();
    build.selections = build.selections.filter((s) => s.kind !== 'context_policy');
    expect(incompleteBuild(build, evaluate(build), BASELINE_RULESET)).toBeUndefined();
  });

  it('does not label complete builds incomplete', () => {
    const build = apiChat();
    expect(incompleteBuild(build, evaluate(build), BASELINE_RULESET)).toBeUndefined();
  });

  it('rejects stale reports, other builds, missing rules and mismatched versions', () => {
    const build = buildWith([]);
    const report = evaluate(build);
    expect(
      incompleteBuild(build, { ...report, build_revision: build.revision + 1 }, BASELINE_RULESET),
    ).toBeUndefined();
    expect(
      incompleteBuild(build, { ...report, build_id: 'other.build' }, BASELINE_RULESET),
    ).toBeUndefined();
    expect(incompleteBuild(build, report, undefined)).toBeUndefined();
    expect(
      incompleteBuild(
        build,
        { ...report, dependency_graph_revision: report.dependency_graph_revision + 1 },
        BASELINE_RULESET,
      ),
    ).toBeUndefined();
    expect(
      incompleteBuild(build, { ...report, dependency_graph_id: 'other.graph' }, BASELINE_RULESET),
    ).toBeUndefined();
    expect(
      incompleteBuild(build, report, { ...BASELINE_RULESET, version: '9.0.0' }),
    ).toBeUndefined();
  });

  it('preserves unknown evidence alongside missing required choices', () => {
    const build = buildWith([['model', 'aurora-large']]);
    const report = evaluate(build);
    expect(report.summary.unknown).toBeGreaterThan(0);
    expect(incompleteBuild(build, report, BASELINE_RULESET)).toMatchObject({ chosen: 1, total: 4 });
    expect(
      selectionOutcome(
        report,
        build.selections[0]!.id,
        incompleteBuild(build, report, BASELINE_RULESET)?.ruleIds,
      ),
    ).toBe('unknown');
  });

  it('does not infer presence from names or affected kinds on arbitrary assertions', () => {
    const build = buildWith([]);
    const ruleset = structuredClone(BASELINE_RULESET);
    ruleset.rules[0]!.assert = { op: 'eq', left: { literal: 1 }, right: { literal: 2 } };
    expect(incompleteBuild(build, evaluate(build), ruleset)).toBeUndefined();
  });
});
