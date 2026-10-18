/*
 * Full, printable summary of the current draft: locks, selections by tier, objectives, findings,
 * the cost breakdown (#cost), capacity and freshness evidence, and revision history. Results are
 * shown only for the exact head revision; stale results are labelled while re-evaluating.
 */
import { Link } from 'react-router';
import type { BuildSnapshot, CatalogItem, CostEstimate, Money } from '../contracts';
import { KIND_LABELS, TIERS, TIER_LABELS, kindsInTier } from '../contracts';
import { buildStaleness } from '../domain/freshness';
import { useValidatorsReady } from '../app/validators';
import { canExport, exportBuild, exportFileName } from '../domain/share';
import { useBuilder } from '../app/builder-context';
import { useData } from '../app/data-context';
import { useBuildAnalysis, useCatalog } from '../app/queries';
import { itemPath } from '../lib/catalog-view';
import { formatValue, humanize } from '../lib/schema-fields';
import { EmptyState, ErrorState, Loading, Notice } from '../components/feedback';
import { IconDownload } from '../components/icons';
import { PageHeader } from '../components/layout';
import { SyntheticBadge } from '../components/status';
import { buildMarkdown, download } from '../features/builder/BuildToolbar';
import { FindingsList, selectionLabel } from '../features/builder/FindingsList';
import { costHeadline, formatMoney } from '../features/builder/analysis';
import { OverallStrip } from '../features/builder/SummaryPanel';

const formatDate = (iso: string) => new Date(iso).toLocaleString();

export default function BuildSummaryPage() {
  useValidatorsReady(); // re-render once export validation is possible
  const { draft, ready } = useBuilder();
  const { mode } = useData();
  const catalog = useCatalog();
  const build = draft?.build;
  const analysis = useBuildAnalysis(build);

  if (catalog.isError) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
      </div>
    );
  }
  if (!ready || !draft || !build || !catalog.data) {
    return (
      <div className="mx-auto max-w-7xl px-4">
        <Loading label="Loading build summary…" />
      </div>
    );
  }

  const byId = catalog.byId;
  const exportProblem = canExport(build);
  const staleness = buildStaleness(build, catalog.data);
  const stalePicks = [...staleness.driftedSelectionIds, ...staleness.missingSelectionIds];
  const resources = analysis.resources;

  return (
    <>
      <PageHeader eyebrow="Build summary" title={build.name}>
        Everything about revision {build.revision} of this stack on one page. Use Print for a paper
        or PDF copy.
      </PageHeader>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6">
        <div className="no-print flex flex-wrap gap-2">
          <Link className="btn-secondary" to="/builder">
            Back to builder
          </Link>
          <button type="button" className="btn-secondary" onClick={() => window.print()}>
            Print
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={Boolean(exportProblem)}
            aria-describedby={exportProblem ? 'export-problem' : undefined}
            onClick={() =>
              download(
                exportFileName(build),
                JSON.stringify(exportBuild(build, mode), null, 2) + '\n',
              )
            }
          >
            <IconDownload /> Export JSON
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={!build.selections.length}
            onClick={() =>
              download(
                exportFileName(build).replace(/\.json$/, '.md'),
                buildMarkdown(build, byId),
                'text/markdown',
              )
            }
          >
            <IconDownload /> Export Markdown
          </button>
        </div>
        {exportProblem ? (
          <p id="export-problem" className="hint no-print -mt-4">
            JSON export unavailable: {exportProblem}
          </p>
        ) : null}

        {mode === 'fixture' ? (
          <Notice title="Demo data.">
            Components, prices and compatibility results here are synthetic demonstration data — not
            real products, quotes or measurements.
          </Notice>
        ) : null}

        <section aria-labelledby="meta-heading" className="card p-4">
          <h2 id="meta-heading" className="text-lg font-semibold">
            Build details
          </h2>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="font-medium">Revision</dt>
            <dd className="tabular">{build.revision}</dd>
            <dt className="font-medium">Created</dt>
            <dd>
              <time dateTime={build.created_at}>{formatDate(build.created_at)}</time>
            </dd>
            <dt className="font-medium">Updated</dt>
            <dd>
              <time dateTime={build.updated_at}>{formatDate(build.updated_at)}</time>
            </dd>
            <dt className="font-medium">Lifecycle</dt>
            <dd>{humanize(build.lifecycle)}</dd>
            <dt className="font-medium">Owner</dt>
            <dd className="font-mono text-xs break-all">{build.owner_ref}</dd>
            <dt className="font-medium">Catalog snapshot</dt>
            <dd className="font-mono text-xs break-all">{build.locks.catalog_snapshot_id}</dd>
            <dt className="font-medium">Ruleset</dt>
            <dd className="font-mono text-xs break-all">
              {build.locks.ruleset_id}@{build.locks.ruleset_version}
            </dd>
            <dt className="font-medium">Dependency graph</dt>
            <dd className="font-mono text-xs break-all">
              {build.locks.dependency_graph_id} r{build.locks.dependency_graph_revision}
            </dd>
            <dt className="font-medium">Pricebook</dt>
            <dd className="font-mono text-xs break-all">
              {build.locks.pricebook_id ?? 'Not specified'}
            </dd>
          </dl>
        </section>

        <OverallStrip build={build} report={analysis.report} current={analysis.reportIsCurrent} />
        {analysis.evaluation.isError ? (
          <ErrorState
            error={analysis.evaluation.error}
            onRetry={() => void analysis.evaluation.refetch()}
          />
        ) : null}

        <SelectionsSection build={build} byId={byId} />

        <section aria-labelledby="objectives-heading" className="card p-4">
          <h2 id="objectives-heading" className="text-lg font-semibold">
            Objectives and policy
          </h2>
          <div className="mt-3 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">Objectives</h3>
              <KeyValues
                entries={Object.entries(build.objectives).map(([k, v]) => [
                  humanize(k),
                  k === 'monthly_budget_amount' && typeof v === 'string'
                    ? formatMoney(v, build.objectives.currency)
                    : formatValue(v),
                ])}
              />
            </div>
            <div>
              <h3 className="font-semibold">Policy</h3>
              {build.policy && Object.keys(build.policy).length ? (
                <KeyValues
                  entries={Object.entries(build.policy).map(([k, v]) => [
                    humanize(k),
                    formatValue(v),
                  ])}
                />
              ) : (
                <p className="muted mt-1 text-sm">No policy set.</p>
              )}
            </div>
          </div>
        </section>

        {analysis.reportIsCurrent ? (
          <FindingsList report={analysis.report} build={build} byId={byId} />
        ) : build.selections.length ? (
          <Loading label={`Evaluating revision ${build.revision}…`} />
        ) : null}

        <section id="cost" aria-labelledby="cost-heading" className="card min-w-0 scroll-mt-4 p-4">
          <h2 id="cost-heading" className="text-lg font-semibold">
            Cost breakdown
          </h2>
          {analysis.costQuery.isError ? (
            <div className="mt-3">
              <ErrorState
                title="Cost estimate unavailable"
                error={analysis.costQuery.error}
                onRetry={() => void analysis.costQuery.refetch()}
              />
            </div>
          ) : analysis.costIsCurrent && analysis.cost ? (
            <CostBreakdown cost={analysis.cost} build={build} byId={byId} />
          ) : (
            <Loading label={`Estimating cost for revision ${build.revision}…`} />
          )}
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <section aria-labelledby="capacity-heading" className="card p-4">
            <h2 id="capacity-heading" className="text-lg font-semibold">
              Capacity evidence
            </h2>
            {!resources ? (
              <Loading label="Checking capacity evidence…" />
            ) : resources.status === 'available' ? (
              <>
                <p className="mt-1 text-sm">
                  Estimator evidence for revision {resources.estimate.build_revision}:
                </p>
                <ul className="mt-2 grid gap-1 text-sm">
                  {resources.estimate.estimates.map((e, i) => (
                    <li key={i}>
                      <span className="font-medium">
                        {humanize(e.metric.split('.').at(-1) ?? e.metric)}:
                      </span>{' '}
                      {e.value} {e.unit}{' '}
                      <span className="muted text-xs">
                        ({humanize(e.confidence)}, {e.estimator_id}@{e.estimator_version})
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-1 text-sm">{resources.reason}</p>
            )}
            <p className="muted mt-2 text-xs">
              Without calibrated capacity evidence, memory and throughput checks stay unknown rather
              than passing.
            </p>
          </section>

          <section aria-labelledby="freshness-heading" className="card p-4">
            <h2 id="freshness-heading" className="text-lg font-semibold">
              Evidence dates
            </h2>
            <p className="mt-1 text-sm">
              Catalog {catalog.data.id} captured{' '}
              <time dateTime={staleness.catalog.checkedAt}>
                {staleness.catalog.checkedAt.slice(0, 10)}
              </time>
              . Capture date does not establish currentness or independent verification.
            </p>
            {staleness.snapshotMismatch ? (
              <p className="mt-1 text-sm">
                This build is locked to snapshot {build.locks.catalog_snapshot_id}; this site has{' '}
                {catalog.data.id}. A different snapshot alone does not invalidate this build.
              </p>
            ) : null}
            {stalePicks.length ? (
              <>
                <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
                  These selections no longer match the catalog:
                </p>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {staleness.missingSelectionIds.map((id) => (
                    <li key={id}>{selectionLabel(build, byId, id)} — not in this catalog</li>
                  ))}
                  {staleness.driftedSelectionIds.map((id) => (
                    <li key={id}>{selectionLabel(build, byId, id)} — catalog version changed</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted mt-1 text-sm">
                Every selection matches its pinned catalog version.
              </p>
            )}
          </section>
        </div>

        <section aria-labelledby="history-heading" className="card p-4">
          <h2 id="history-heading" className="text-lg font-semibold">
            Revision history
          </h2>
          <ol className="mt-2 grid gap-1 text-sm">
            {[...draft.changes].reverse().map((c) => (
              <li key={c.revision} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-xs tabular">r{c.revision}</span>
                <span>{c.summary}</span>
                <time className="muted text-xs" dateTime={c.at}>
                  {formatDate(c.at)}
                </time>
              </li>
            ))}
          </ol>
          {draft.revisions.length >= 2 ? (
            <p className="no-print mt-3 text-sm">
              <Link className="link" to="/compare">
                Compare two revisions
              </Link>
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}

function KeyValues({ entries }: { entries: [string, string][] }) {
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-medium">{k}</dt>
          <dd className="break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function settingsSummary(settings: object): string {
  const entries = Object.entries(settings as Record<string, unknown>).filter(
    ([, v]) => v !== undefined,
  );
  if (!entries.length) return 'Defaults';
  return entries.map(([k, v]) => `${humanize(k)}: ${formatValue(v, { key: k })}`).join(' · ');
}

function SelectionsSection({
  build,
  byId,
}: {
  build: BuildSnapshot;
  byId: ReadonlyMap<string, CatalogItem>;
}) {
  return (
    <section aria-labelledby="selections-heading" className="card min-w-0 p-4">
      <h2 id="selections-heading" className="text-lg font-semibold">
        Selections
      </h2>
      {build.selections.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="No components selected yet"
            action={
              <Link className="btn-primary" to="/builder">
                Open the builder
              </Link>
            }
          >
            Start with T0: what should the system do, and how will it be deployed?
          </EmptyState>
        </div>
      ) : (
        <div
          className="mt-3 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Scrollable table"
        >
          <table className="data-table">
            <caption className="sr-only">Selected components grouped by tier</caption>
            <thead>
              <tr>
                <th scope="col">Component</th>
                <th scope="col">Selection</th>
                <th scope="col">Role</th>
                <th scope="col">Enabled</th>
                <th scope="col">Key settings</th>
              </tr>
            </thead>
            {TIERS.map((tier) => {
              const rows = kindsInTier(tier).flatMap((k) =>
                build.selections.filter((s) => s.kind === k.kind),
              );
              if (!rows.length) return null;
              return (
                <tbody key={tier}>
                  <tr>
                    <th scope="rowgroup" colSpan={5} className="bg-slate-50 dark:bg-slate-800/60">
                      {tier} — {TIER_LABELS[tier]}
                    </th>
                  </tr>
                  {rows.map((s) => {
                    const item = byId.get(s.catalog_item_id);
                    return (
                      <tr key={s.id}>
                        <th
                          scope="row"
                          className="text-left text-sm font-medium tracking-normal text-slate-800 normal-case dark:text-slate-200"
                        >
                          {KIND_LABELS[s.kind]}
                        </th>
                        <td className="break-words">
                          {item ? (
                            <span className="flex flex-wrap items-center gap-1">
                              <Link className="link" to={itemPath(item)}>
                                {item.name}
                              </Link>
                              {(item.tags ?? []).includes('synthetic') ? <SyntheticBadge /> : null}
                            </span>
                          ) : (
                            <span>
                              <span className="font-mono text-xs break-all">
                                {s.catalog_item_id}
                              </span>{' '}
                              <strong className="text-amber-900 dark:text-amber-200">
                                Not in this catalog
                              </strong>
                            </span>
                          )}
                          <span className="muted block text-xs">v{s.catalog_item_version}</span>
                        </td>
                        <td>{s.role}</td>
                        <td>{s.enabled ? 'Yes' : 'No (disabled)'}</td>
                        <td className="muted text-xs break-words">{settingsSummary(s.settings)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </section>
  );
}

function CostBreakdown({
  cost,
  build,
  byId,
}: {
  cost: CostEstimate;
  build: BuildSnapshot;
  byId: ReadonlyMap<string, CatalogItem>;
}) {
  const headline = costHeadline(cost);
  const money = (m: Money) => formatMoney(m.amount, m.currency);
  const totals: [string, Money][] = [
    ['Subtotal', cost.subtotal],
    ['Tax', cost.tax],
    [cost.coverage === 'complete' ? 'Total' : 'Total of priced items (lower bound)', cost.total],
  ];
  return (
    <>
      <p className="mt-2 text-base font-semibold tabular">{headline.text}</p>
      <p className="muted text-sm">
        {headline.detail} Coverage: <strong>{humanize(cost.coverage)}</strong>. Pricebook{' '}
        {cost.pricebook_id}, {cost.period_days}-day period, estimated{' '}
        <time dateTime={cost.estimated_at}>{formatDate(cost.estimated_at)}</time>.
      </p>
      {cost.line_items.length ? (
        <div
          className="mt-3 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Scrollable table"
        >
          <table className="data-table tabular">
            <caption className="mb-2 text-left text-sm font-semibold text-violet-800 dark:text-violet-300">
              Synthetic demo prices — not a quote
            </caption>
            <thead>
              <tr>
                <th scope="col">Selection</th>
                <th scope="col">Meter</th>
                <th scope="col" className="text-right">
                  Quantity
                </th>
                <th scope="col" className="text-right">
                  Unit price
                </th>
                <th scope="col" className="text-right">
                  Amount
                </th>
                <th scope="col">Method</th>
                <th scope="col">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {cost.line_items.map((li) => (
                <tr key={li.id}>
                  <th
                    scope="row"
                    className="text-left text-sm font-medium tracking-normal text-slate-800 normal-case dark:text-slate-200"
                  >
                    {selectionLabel(build, byId, li.selection_id)}
                    {li.assumptions.length ? (
                      <ul className="muted mt-1 list-disc pl-4 text-xs font-normal">
                        {li.assumptions.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    ) : null}
                  </th>
                  <td>{humanize(li.meter)}</td>
                  <td className="text-right">{li.quantity}</td>
                  <td className="text-right">{money(li.unit_price)}</td>
                  <td className="text-right">{money(li.amount)}</td>
                  <td>{humanize(li.method)}</td>
                  <td>{humanize(li.confidence)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {totals.map(([label, m]) => (
                <tr key={label}>
                  <th scope="row" colSpan={4} className="text-right">
                    {label}
                  </th>
                  <td className="text-right font-semibold">{money(m)}</td>
                  <td colSpan={2} />
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm">No line items could be priced.</p>
      )}
      {cost.coverage !== 'complete' ? (
        <p className="mt-3 text-sm text-amber-900 dark:text-amber-200">
          Estimate: <strong>{headline.text}</strong>. Coverage is {cost.coverage}, so the true total
          can be higher than the priced items — unpriced components are not zero cost.
        </p>
      ) : null}
      {cost.unpriced_selection_ids.length ? (
        <>
          <h3 className="mt-4 font-semibold">
            Unpriced selections ({cost.unpriced_selection_ids.length})
          </h3>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {cost.unpriced_selection_ids.map((id) => (
              <li key={id}>{selectionLabel(build, byId, id)}</li>
            ))}
          </ul>
        </>
      ) : null}
      {cost.warnings.length ? (
        <>
          <h3 className="mt-4 font-semibold">Warnings ({cost.warnings.length})</h3>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {cost.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
