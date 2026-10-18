/* Synthetic scenarios required by MASTER_PROMPT §11 (domain level). */
import { describe, expect, it } from 'vitest';
import { BASELINE_GRAPH, BASELINE_RULESET, validateContract } from '../../src/contracts';
import { buildContext, coverage, kindNeed } from '../../src/domain/activation';
import {
  addOrReplace,
  commit,
  createDraft,
  removeSelection,
  setEnabled,
  updateObjectives,
} from '../../src/domain/build';
import { estimateCost } from '../../src/domain/cost';
import { evaluateBuild } from '../../src/domain/evaluator';
import { buildStaleness } from '../../src/domain/freshness';
import { affectedByChange } from '../../src/domain/invalidation';
import {
  decodeShareFragment,
  encodeShareFragment,
  exportBuild,
  importBuild,
} from '../../src/domain/share';
import { DEMO_PRICEBOOK } from '../../src/data/fixture/pricebook';
import {
  BY_ID,
  CATALOG,
  NOW,
  apiChat,
  buildWith,
  contradictory,
  item,
  ragMismatch,
  resourceEstimate,
  selfHosted,
} from './scenarios';

const evaluate = (
  build: ReturnType<typeof apiChat>,
  extra: Parameters<typeof evaluateBuild>[0] extends infer P ? Partial<P> : never = {},
) =>
  evaluateBuild({ build, catalog: CATALOG, ruleset: BASELINE_RULESET, evaluatedAt: NOW, ...extra });

const outcome = (r: ReturnType<typeof evaluate>, ruleId: string) =>
  r.findings.find((f) => f.rule_id === ruleId)?.outcome;

describe('optional workstreams', () => {
  it('an API chat build with T2–T6 omitted is valid and complete', () => {
    const b = apiChat();
    const r = evaluate(b);
    expect(r.result).toBe('valid');
    expect(r.summary.failed).toBe(0);
    expect(r.summary.unknown).toBe(0);
    const ctx = buildContext(b, BY_ID);
    const cov = coverage(b, ctx);
    expect(cov.missing).toEqual([]);
    expect(kindNeed('accelerator', ctx.mode)).toBe('not_needed');
    expect(kindNeed('hosting_platform', ctx.mode)).toBe('not_needed');
    expect(kindNeed('vector_database', ctx.mode)).toBe('optional');
    expect(
      b.selections.some((s) => ['T3', 'T4', 'T5'].includes(BY_ID.get(s.catalog_item_id)!.tier)),
    ).toBe(false);
  });

  it('self-hosted mode makes T2 infrastructure needed', () => {
    const ctx = buildContext(buildWith([['deployment_mode', 'self-hosted']]), BY_ID);
    expect(kindNeed('accelerator', ctx.mode)).toBe('needed');
    expect(kindNeed('hosting_platform', ctx.mode)).toBe('needed');
    const managed = buildContext(buildWith([['deployment_mode', 'managed']]), BY_ID);
    expect(kindNeed('hosting_platform', managed.mode)).toBe('needed');
    expect(kindNeed('accelerator', managed.mode)).toBe('not_needed');
  });

  it('before a mode is chosen, mode-dependent kinds are "depends on mode", not needed or pass', () => {
    const b = buildWith([['workload', 'support-chat']]);
    expect(kindNeed('compute_profile', buildContext(b, BY_ID).mode)).toBe('depends_on_mode');
    const r = evaluate(b);
    expect(outcome(r, 'rule.required.foundation')).toBe('fail');
    expect(outcome(r, 'rule.selfhost.requires.infrastructure')).toBe('unknown');
  });
});

describe('contradictory selections', () => {
  it('API mode with a weights-only model from another provider fails two blocking rules', () => {
    const r = evaluate(contradictory());
    expect(r.result).toBe('invalid');
    expect(r.deployment_readiness).toBe('blocked');
    const fails = r.findings.filter((f) => f.outcome === 'fail');
    expect(fails.map((f) => f.rule_id).sort()).toEqual([
      'rule.api.model.access',
      'rule.model.provider.match',
    ]);
    for (const f of fails) {
      expect(f.severity).toBe('error');
      expect(f.remediation).not.toBe('');
      expect(f.selection_ids).toContain('sel_model');
    }
  });

  it('RAG embedding/index dimension mismatch fails', () => {
    expect(outcome(evaluate(ragMismatch()), 'rule.embedding.dimension')).toBe('fail');
  });
});

describe('unknown compatibility', () => {
  it('missing capacity evidence is unknown, never pass', () => {
    const r = evaluate(selfHosted());
    expect(outcome(r, 'rule.vram.estimate.fit')).toBe('unknown');
    expect(r.result).toBe('indeterminate');
    expect(r.deployment_readiness).toBe('blocked');
  });

  it('evidence below the build confidence policy stays unknown', () => {
    const b = selfHosted();
    expect(
      outcome(
        evaluate(b, { resourceEstimate: resourceEstimate(b, '20.0', 'estimated') }),
        'rule.vram.estimate.fit',
      ),
    ).toBe('unknown');
  });

  it('calibrated evidence decides pass or fail', () => {
    const b = selfHosted();
    expect(
      outcome(
        evaluate(b, { resourceEstimate: resourceEstimate(b, '20.0', 'calibrated') }),
        'rule.vram.estimate.fit',
      ),
    ).toBe('pass');
    expect(
      outcome(
        evaluate(b, { resourceEstimate: resourceEstimate(b, '30.0', 'verified') }),
        'rule.vram.estimate.fit',
      ),
    ).toBe('fail');
  });
});

describe('cross-tier invalidation', () => {
  it('changing the model invalidates infrastructure, context and downstream tiers', () => {
    const before = selfHosted();
    const after = addOrReplace(before, item('model', 'open-70b'), BY_ID);
    const res = affectedByChange(
      BASELINE_GRAPH,
      ['model'],
      buildContext(before, BY_ID),
      buildContext(after, BY_ID),
    );
    for (const k of ['accelerator', 'inference_engine', 'compute_profile', 'deployment_mode']) {
      expect(res.affectedKinds).toContain(k);
    }
    expect(res.via.length).toBeGreaterThan(3);
  });

  it('is bidirectional: changing an accelerator invalidates the model it depends on', () => {
    const b = selfHosted();
    const ctx = buildContext(b, BY_ID);
    const res = affectedByChange(BASELINE_GRAPH, ['accelerator'], ctx, ctx);
    expect(res.affectedKinds).toContain('model');
    const dependentEdge = res.via.find((e) => e.dependent_kind === 'accelerator');
    expect(dependentEdge).toBeDefined();
  });

  it('a mode switch considers edges active before or after the change', () => {
    const api = apiChat();
    const self = addOrReplace(api, item('deployment_mode', 'self-hosted'), BY_ID);
    const apiCtx = buildContext(api, BY_ID);
    const selfCtx = buildContext(self, BY_ID);
    const res = affectedByChange(BASELINE_GRAPH, ['deployment_mode'], apiCtx, selfCtx);
    expect(res.affectedKinds).toEqual(expect.arrayContaining(['hosting_platform', 'model']));
    // Self-hosted-only edges are inactive in API mode both before and after an API-only change.
    const unchanged = affectedByChange(BASELINE_GRAPH, ['context_policy'], apiCtx, apiCtx);
    expect(unchanged.via.every((e) => e.activation !== 'self_hosted')).toBe(true);
  });

  it('evidence for an earlier revision is stale and ignored after a change', () => {
    const draft0 = createDraft(selfHosted());
    const evidence = resourceEstimate(draft0.build, '20.0', 'calibrated');
    expect(
      outcome(evaluate(draft0.build, { resourceEstimate: evidence }), 'rule.vram.estimate.fit'),
    ).toBe('pass');
    const draft1 = commit(
      draft0,
      (b) => addOrReplace(b, item('accelerator', 'c80'), BY_ID),
      'Swap GPU',
      ['accelerator'],
      NOW,
    );
    const r = evaluate(draft1.build, { resourceEstimate: evidence });
    expect(r.build_revision).toBe(draft0.build.revision + 1);
    expect(outcome(r, 'rule.vram.estimate.fit')).toBe('unknown');
  });
});

describe('missing prices', () => {
  it('an API build with complete synthetic rates has complete coverage', () => {
    const q = estimateCost(apiChat(), BY_ID, DEMO_PRICEBOOK, { now: NOW });
    expect(q.coverage).toBe('complete');
    expect(q.total.amount).toBe('324.00');
    expect(validateContract('CostEstimate', q).ok).toBe(true);
    for (const l of q.line_items) expect(l.confidence).toBe('low');
  });

  it('an expired rate leaves the selection unpriced and coverage partial', () => {
    const b = addOrReplace(apiChat(), item('model', 'aurora-mini'), BY_ID);
    const q = estimateCost(b, BY_ID, DEMO_PRICEBOOK, { now: NOW });
    expect(q.coverage).toBe('partial');
    expect(q.unpriced_selection_ids).toContain('sel_model');
    expect(q.warnings.join(' ')).toMatch(/expired/);
  });

  it('unknown billing class is never treated as zero', () => {
    const b = buildWith([['compute_profile', 'rack-2x-r48']], selfHosted());
    const q = estimateCost(b, BY_ID, DEMO_PRICEBOOK, { now: NOW });
    expect(q.unpriced_selection_ids).toContain('sel_compute_profile');
    expect(q.coverage).not.toBe('complete');
  });

  it('a partial quote makes the budget rule unknown, not pass', () => {
    let b = buildWith(
      [['cost_policy', 'hard-cap']],
      addOrReplace(apiChat(), item('model', 'aurora-mini'), BY_ID),
    );
    b = updateObjectives(b, { monthly_budget_amount: '10000.00' });
    const q = estimateCost(b, BY_ID, DEMO_PRICEBOOK, { now: NOW });
    expect(outcome(evaluate(b, { costEstimate: q }), 'rule.budget.monthly.cap')).toBe('unknown');
    const complete = updateObjectives(buildWith([['cost_policy', 'hard-cap']], apiChat()), {
      monthly_budget_amount: '100.00',
    });
    const q2 = estimateCost(complete, BY_ID, DEMO_PRICEBOOK, { now: NOW });
    expect(outcome(evaluate(complete, { costEstimate: q2 }), 'rule.budget.monthly.cap')).toBe(
      'fail',
    );
  });

  it('a quote in another currency is not converted', () => {
    const b = updateObjectives(apiChat(), { currency: 'EUR' });
    const q = estimateCost(b, BY_ID, DEMO_PRICEBOOK, { now: NOW });
    expect(q.line_items).toHaveLength(0);
    expect(q.coverage).toBe('unknown');
  });
});

describe('catalog evidence dates and version matching', () => {
  it('reports capture dates without an age-based validity verdict', () => {
    const old = { ...CATALOG, captured_at: '2000-01-01T00:00:00Z' };
    expect(buildStaleness(apiChat(), old).catalog).toEqual({
      checkedAt: old.captured_at,
      basis: 'capture',
    });
  });

  it('a newer snapshot alone does not invalidate version-pinned selections', () => {
    const build = apiChat();
    const newer = {
      ...CATALOG,
      id: 'catalog.demo.newer',
      revision: 2,
      captured_at: '2030-01-01T00:00:00Z',
    };
    expect(buildStaleness(build, newer)).toMatchObject({
      snapshotMismatch: true,
      driftedSelectionIds: [],
      missingSelectionIds: [],
    });
    const before = evaluateBuild({ build, catalog: CATALOG, ruleset: BASELINE_RULESET });
    const after = evaluateBuild({ build, catalog: newer, ruleset: BASELINE_RULESET });
    expect(after.result).toBe(before.result);
    expect(after.findings).toEqual(before.findings);
  });

  it('detects selections pinned to a different item version and an older snapshot lock', () => {
    const b = apiChat();
    const newer = {
      ...CATALOG,
      id: 'catalog.demo.2',
      revision: 2,
      items: CATALOG.items.map((i) =>
        i.id === 'demo.model.aurora-large' ? { ...i, version: 'demo-2026.11' } : i,
      ),
    };
    const s = buildStaleness(b, newer);
    expect(s.snapshotMismatch).toBe(true);
    expect(s.driftedSelectionIds).toEqual(['sel_model']);
    // The evaluator refuses to read catalog facts across a version mismatch.
    const r = evaluateBuild({ build: b, catalog: newer, ruleset: BASELINE_RULESET });
    expect(outcome(r, 'rule.model.context.fit')).toBe('unknown');
  });
});

describe('build revision changes', () => {
  it('every change creates a new immutable revision and keeps history', () => {
    let d = createDraft(apiChat());
    const r1 = d.build;
    d = commit(
      d,
      (b) => setEnabled(b, 'sel_context_policy', false),
      'Disable context',
      ['context_policy'],
      NOW,
    );
    d = commit(d, (b) => removeSelection(b, 'sel_workload'), 'Remove workload', ['workload'], NOW);
    expect(d.build.revision).toBe(r1.revision + 2);
    expect(d.revisions.map((r) => r.revision)).toEqual([1, 2, 3]);
    expect(d.revisions[0]).toEqual(r1);
    expect(r1.selections.find((s) => s.id === 'sel_workload')).toBeDefined();
    expect(d.changes.at(-1)?.summary).toBe('Remove workload');
  });

  it('removing a primary promotes the next selection of that kind and drops dangling links', () => {
    let b = addOrReplace(apiChat(), item('model', 'aurora-mini'), BY_ID, { additional: true });
    b = {
      ...b,
      links: [
        {
          id: 'link.1',
          from_selection_id: 'sel_model',
          to_selection_id: 'sel_model_provider',
          relation: 'provided_by',
        },
      ],
    };
    const next = removeSelection(b, 'sel_model');
    expect(next.links).toEqual([]);
    expect(next.selections.find((s) => s.kind === 'model')?.role).toBe('primary');
  });

  it('cardinality "one" kinds replace instead of adding', () => {
    const b = addOrReplace(apiChat(), item('context_policy', 'long-128k'), BY_ID, {
      additional: true,
    });
    expect(b.selections.filter((s) => s.kind === 'context_policy')).toHaveLength(1);
  });
});

describe('configuration import/export', () => {
  it('round-trips through an export file', () => {
    const b = apiChat();
    const file = JSON.stringify(exportBuild(b, 'fixture', NOW));
    const result = importBuild(file, 'fixture');
    expect(result.ok && result.build).toEqual(b);
  });

  it('round-trips through a share fragment', () => {
    const b = ragMismatch();
    const result = decodeShareFragment('#' + encodeShareFragment(b, 'fixture'), 'fixture');
    expect(result.ok && result.build).toEqual(b);
  });

  it('rejects malformed, foreign and schema-invalid files', () => {
    expect(importBuild('{nope', 'fixture').ok).toBe(false);
    expect(importBuild(JSON.stringify({ format: 'other' }), 'fixture').ok).toBe(false);
    const bad = { ...apiChat(), revision: -1 };
    const r = importBuild(JSON.stringify(bad), 'fixture');
    expect(r.ok).toBe(false);
    const secret = apiChat();
    secret.selections[2]!.settings = { credential_ref: 'sk-live-not-a-secret-ref' };
    expect(importBuild(JSON.stringify(secret), 'fixture').ok).toBe(false);
    expect(decodeShareFragment('#b1.@@@', 'fixture').ok).toBe(false);
  });

  it('warns when a build came from another data mode', () => {
    const file = JSON.stringify(exportBuild(apiChat(), 'http', NOW));
    const r = importBuild(file, 'fixture');
    expect(r.ok && r.warnings.length).toBe(1);
  });
});
