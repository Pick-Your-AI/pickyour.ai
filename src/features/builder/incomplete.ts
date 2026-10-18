import type {
  BuildSnapshot,
  ComponentKind,
  EvaluationReport,
  Expression,
  Ruleset,
} from '../../contracts';

/** Provisional presentation inference: only conjunctions of primary selection-presence checks.
 * Never infer from rule names, messages, affected kinds alone, or arbitrary predicates.
 */
function requiredKinds(expression: Expression): ComponentKind[] | undefined {
  if (expression.op === 'all') {
    const parts = expression.args.map(requiredKinds);
    return parts.length && parts.every((part) => part !== undefined)
      ? parts.flatMap((part) => part!)
      : undefined;
  }
  if (expression.op !== 'exists' || !('ref' in expression.value)) return undefined;
  const ref = expression.value.ref;
  return !ref.selection_id &&
    ref.scope === 'selection' &&
    ref.role === 'primary' &&
    ref.pointer === '/id' &&
    ref.kind
    ? [ref.kind]
    : undefined;
}

export function incompleteBuild(
  build: BuildSnapshot | undefined,
  report: EvaluationReport | undefined,
  ruleset: Ruleset | undefined,
) {
  if (
    !build ||
    !report ||
    !ruleset ||
    report.build_id !== build.id ||
    report.build_revision !== build.revision ||
    report.dependency_graph_id !== build.locks.dependency_graph_id ||
    report.dependency_graph_revision !== build.locks.dependency_graph_revision ||
    report.catalog_snapshot_id !== build.locks.catalog_snapshot_id ||
    report.ruleset_id !== ruleset.id ||
    report.ruleset_version !== ruleset.version ||
    build.locks.ruleset_id !== ruleset.id ||
    build.locks.ruleset_version !== ruleset.version
  )
    return undefined;
  const failures = report.findings.filter((finding) => finding.outcome === 'fail');
  if (!failures.length || failures.length !== report.summary.failed) return undefined;
  const selected = new Set(
    build.selections.filter((s) => s.enabled && s.role === 'primary').map((s) => s.kind),
  );
  const required = new Set<ComponentKind>();
  for (const finding of failures) {
    const rule = ruleset.rules.find((candidate) => candidate.id === finding.rule_id);
    const kinds = rule && requiredKinds(rule.assert);
    if (
      !rule ||
      !kinds ||
      kinds.some(
        (kind) =>
          build.selections.filter((s) => s.enabled && s.role === 'primary' && s.kind === kind)
            .length > 1,
      ) ||
      !kinds.some((kind) => !selected.has(kind)) ||
      !kinds.every((kind) => rule.affected_kinds.includes(kind))
    )
      return undefined;
    kinds.forEach((kind) => required.add(kind));
  }
  return {
    chosen: [...required].filter((kind) => selected.has(kind)).length,
    total: required.size,
    ruleIds: new Set(failures.map((finding) => finding.rule_id)),
    remediation: failures
      .map((finding) => finding.remediation)
      .filter(Boolean)
      .join(' '),
  };
}
export type IncompleteBuild = ReturnType<typeof incompleteBuild>;
