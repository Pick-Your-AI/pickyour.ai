import { useRuleset } from '../../app/queries';
import { incompleteBuild } from './incomplete';
import { useState } from 'react';
import { Link } from 'react-router';
import type {
  BuildSnapshot,
  CatalogItem,
  CatalogSnapshot,
  CostEstimate,
  EvaluationReport,
} from '../../contracts';
import { KIND_LABELS } from '../../contracts';
import type { Coverage } from '../../domain/activation';
import { buildStaleness } from '../../domain/freshness';
import type { ResourceEstimateResult } from '../../data/types';
import { OutcomeBadge } from '../../components/status';
import { costHeadline, nextAction, overall } from './analysis';

export function OverallStrip({
  report,
  current,
  build,
}: {
  report: EvaluationReport | undefined;
  current: boolean;
  build?: BuildSnapshot;
}) {
  const ruleset = useRuleset();
  const incomplete = incompleteBuild(build, current ? report : undefined, ruleset.data);
  const o = overall(report);
  let text = 'Add components to start checking compatibility.';
  let cls = 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900';
  if (report && o) {
    const { failed, unknown, passed, skipped } = report.summary;
    if (incomplete) {
      text = `${incomplete.chosen} of ${incomplete.total} required choices made. ${incomplete.remediation} Provisional inference from presence rules; contract findings remain unchanged.${unknown ? ` ${unknown} checks remain unknown.` : ''}`;
      cls = 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950';
    } else if (o === 'fail') {
      text = `${failed} failing check${failed === 1 ? '' : 's'}${unknown ? ` and ${unknown} unknown` : ''} — this stack is not compatible as configured.`;
      cls = 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950';
    } else if (o === 'unknown') {
      text = `No failures, but ${unknown} check${unknown === 1 ? ' is' : 's are'} unknown — missing information is not treated as compatible.`;
      cls = 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950';
    } else if (o === 'pass') {
      text = `${passed} checks pass, ${skipped} do not apply. Compatibility is not proof of quality or production readiness.`;
      cls = 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950';
    }
  }
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${cls}`}
      data-testid="overall-status"
    >
      {o ? (
        <OutcomeBadge
          outcome={incomplete ? 'unknown' : o}
          label={
            incomplete
              ? 'Incomplete'
              : o === 'pass'
                ? 'Compatible (rules pass)'
                : o === 'fail'
                  ? 'Incompatible'
                  : o === 'unknown'
                    ? 'Unknowns'
                    : 'Not evaluated'
          }
        />
      ) : null}
      <p className="text-sm font-medium">{text}</p>
      {!current && report ? (
        <span className="muted text-xs" role="status">
          Showing revision {report.build_revision} while the new revision is evaluated…
        </span>
      ) : null}
    </div>
  );
}

export function SummaryPanel({
  build,
  byId,
  snapshot,
  coverage,
  report,
  reportIsCurrent,
  cost,
  costIsCurrent,
  resources,
  variant,
}: {
  variant: 'mobile' | 'aside';
  build: BuildSnapshot;
  byId: ReadonlyMap<string, CatalogItem>;
  snapshot: CatalogSnapshot;
  coverage: Coverage;
  report: EvaluationReport | undefined;
  reportIsCurrent: boolean;
  cost: CostEstimate | undefined;
  costIsCurrent: boolean;
  resources: ResourceEstimateResult | undefined;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const ruleset = useRuleset();
  const incomplete = incompleteBuild(build, reportIsCurrent ? report : undefined, ruleset.data);
  const o = overall(report);
  const headline = costHeadline(costIsCurrent ? cost : undefined);
  const staleness = buildStaleness(build, snapshot);
  const active = build.selections.filter((s) => s.enabled);
  const neededDone = coverage.satisfied.length;
  const neededTotal = coverage.needed.length;

  const body = (
    <div className="grid gap-4 text-sm">
      <div>
        <h3 className="font-semibold">Selected</h3>
        <p className="tabular">
          {active.length} active component{active.length === 1 ? '' : 's'}
          {build.selections.length !== active.length
            ? ` (${build.selections.length - active.length} disabled)`
            : ''}
        </p>
        <ul className="muted mt-1 max-h-40 space-y-0.5 overflow-auto text-xs">
          {active.map((s) => (
            <li key={s.id}>
              {KIND_LABELS[s.kind]}: {byId.get(s.catalog_item_id)?.name ?? s.catalog_item_id}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-semibold">Coverage</h3>
        <p className="tabular">
          {neededDone} of {neededTotal} needed kinds chosen
        </p>
        <div
          className="mt-1 h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-700"
          aria-hidden="true"
        >
          <div
            className="h-full bg-brand-600"
            style={{ width: `${neededTotal ? (neededDone / neededTotal) * 100 : 0}%` }}
          />
        </div>
        {coverage.missing.length ? (
          <p className="mt-1 text-xs">
            Still needed: {coverage.missing.map((k) => KIND_LABELS[k]).join(', ')}
          </p>
        ) : null}
        {coverage.dependsOnMode.length ? (
          <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
            {coverage.dependsOnMode.length} infrastructure kinds depend on the deployment mode.
          </p>
        ) : null}
      </div>
      <div>
        <h3 className="font-semibold">Compatibility</h3>
        {report ? (
          <ul className="mt-1 grid grid-cols-2 gap-1 tabular">
            <li>
              <OutcomeBadge outcome="fail" label={`${report.summary.failed} fail`} />
            </li>
            <li>
              <OutcomeBadge outcome="unknown" label={`${report.summary.unknown} unknown`} />
            </li>
            <li>
              <OutcomeBadge outcome="pass" label={`${report.summary.passed} pass`} />
            </li>
            <li>
              <OutcomeBadge outcome="skipped" label={`${report.summary.skipped} skipped`} />
            </li>
          </ul>
        ) : (
          <p className="muted">Not evaluated yet.</p>
        )}
        <p className="muted mt-1 text-xs">
          Readiness: {report ? report.deployment_readiness.replace('_', ' ') : '—'} (deployment
          approval is a separate process).
        </p>
      </div>
      <div>
        <h3 className="font-semibold">Capacity evidence</h3>
        <p className="muted text-xs">
          {resources?.status === 'available'
            ? `Estimator evidence for revision ${resources.estimate.build_revision}.`
            : (resources?.reason ?? 'Checking…')}
        </p>
      </div>
      <div>
        <h3 className="font-semibold">Estimated cost</h3>
        <p className="text-base font-semibold tabular" data-testid="cost-headline">
          {headline.text}
        </p>
        <p className="muted text-xs">{headline.detail}</p>
        {cost && costIsCurrent ? (
          <p className="text-xs">
            <span className="font-semibold text-violet-800 dark:text-violet-300">
              Synthetic prices.
            </span>{' '}
            Pricebook {cost.pricebook_id}.{' '}
            <Link className="link" to="/summary#cost">
              Breakdown
            </Link>
          </p>
        ) : null}
      </div>
      <div>
        <h3 className="font-semibold">Evidence freshness</h3>
        <p className="text-xs">
          Catalog {snapshot.id} captured {staleness.catalog.ageDays} day
          {staleness.catalog.ageDays === 1 ? '' : 's'} ago —{' '}
          {staleness.catalog.state === 'stale' ? (
            <strong className="text-amber-900 dark:text-amber-200">stale</strong>
          ) : (
            'fresh'
          )}
          .
        </p>
        {staleness.snapshotMismatch ? (
          <p className="text-xs text-amber-900 dark:text-amber-200">
            Build is locked to snapshot {build.locks.catalog_snapshot_id}.
          </p>
        ) : null}
        {staleness.driftedSelectionIds.length || staleness.missingSelectionIds.length ? (
          <p className="text-xs text-amber-900 dark:text-amber-200">
            {staleness.driftedSelectionIds.length + staleness.missingSelectionIds.length}{' '}
            selection(s) no longer match the catalog.
          </p>
        ) : null}
      </div>
      <div className="rounded-md bg-brand-50 p-3 dark:bg-brand-950">
        <h3 className="font-semibold">Next recommended action</h3>
        <p className="mt-1">
          {nextAction(
            build,
            coverage,
            reportIsCurrent ? report : undefined,
            costIsCurrent ? cost : undefined,
          )}
        </p>
      </div>
      <Link to="/summary" className="btn-secondary">
        Open full build summary
      </Link>
    </div>
  );

  if (variant === 'mobile') {
    return (
      /* Mobile: compact sticky bar that expands into the full summary. */
      <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          aria-expanded={mobileOpen}
          aria-controls="mobile-summary"
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span className="flex items-center gap-2">
            {o ? (
              <OutcomeBadge
                outcome={incomplete ? 'unknown' : o}
                label={incomplete ? 'Incomplete (provisional)' : undefined}
              />
            ) : (
              <span className="muted text-sm">Not evaluated</span>
            )}
            <span className="text-sm tabular">
              {neededDone}/{neededTotal} needed · {headline.text}
            </span>
          </span>
          <span className="text-sm font-medium">{mobileOpen ? 'Hide summary' : 'Summary'}</span>
        </button>
        {mobileOpen ? (
          <div id="mobile-summary" className="mt-3 max-h-[70vh] overflow-auto pb-2">
            {body}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <aside aria-label="Build summary" className="hidden lg:block">
      <div className="card sticky top-4 max-h-[calc(100vh-2rem)] overflow-auto p-4">
        <h2 className="mb-3 text-lg font-semibold">Build summary</h2>
        {body}
      </div>
    </aside>
  );
}
