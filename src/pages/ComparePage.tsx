/*
 * Compare. Two modes share one route: side-by-side catalog components (`?ids=a,b`, ids written
 * with "~" for ".") and whole-configuration diffs (`?builds=a,b` for saved builds, or
 * `?revisions=3,7` for two revisions of the current draft). Missing values are always written out
 * ("Not specified"), and differences are marked with text, never colour alone.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type {
  BuildSnapshot,
  CatalogItem,
  ComponentKind,
  CostEstimate,
  EvaluationReport,
  Selection,
} from '../contracts';
import { KIND_LABELS, TIERS, TIER_LABELS, kindsInTier } from '../contracts';
import { primarySelection } from '../domain/activation';
import { addOrReplace } from '../domain/build';
import { evidenceDateLabel, itemFreshness } from '../domain/freshness';
import { useBuilder } from '../app/builder-context';
import { useData } from '../app/data-context';
import { useCatalog } from '../app/queries';
import { BILLING_LABELS, idToSlug, itemPath, slugToId, specValue } from '../lib/catalog-view';
import { type FieldDef, formatValue, humanize, specFields } from '../lib/schema-fields';
import { EmptyState, ErrorState, Loading, Notice } from '../components/feedback';
import { PageHeader } from '../components/layout';
import { OutcomeBadge, SyntheticBadge, type Outcome } from '../components/status';
import { costHeadline, formatMoney } from '../features/builder/analysis';

const MAX_ITEMS = 4;

const list = (value: string | null) =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const compareIdsPath = (ids: string[]) => `/compare?ids=${ids.map(idToSlug).join(',')}`;

export default function ComparePage() {
  const [params] = useSearchParams();
  const ids = list(params.get('ids')).map(slugToId);
  const builds = list(params.get('builds'));
  const revisions = list(params.get('revisions'))
    .map((r) => Number(r))
    .filter((n) => Number.isInteger(n) && n > 0);

  let body;
  if (ids.length) body = <ComponentCompare ids={ids} />;
  else if (builds.length) body = <SavedBuildsCompare ids={builds} />;
  else if (revisions.length) body = <RevisionCompare revisions={revisions} />;
  else body = <CompareStart />;

  return (
    <>
      <PageHeader
        eyebrow="Compare"
        title={
          ids.length
            ? 'Compare components'
            : builds.length || revisions.length
              ? 'Compare builds'
              : 'Compare'
        }
      >
        Line up catalog components field by field, or diff two whole stacks: selections per tier,
        objectives, compatibility outcomes and estimated cost.
      </PageHeader>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6">{body}</div>
    </>
  );
}

// ---- component compare -------------------------------------------------------------------

const VERIFICATION_ORDER = ['verified', 'user_supplied', 'estimated', 'unverified'] as const;

function strongestVerification(item: CatalogItem): string {
  const statuses = new Set(item.provenance.map((p) => p.verification_status));
  return VERIFICATION_ORDER.find((v) => statuses.has(v)) ?? 'unverified';
}

interface CompareRow {
  key: string;
  label: string;
  values: string[];
  differs: boolean;
}

function makeRow(key: string, label: string, values: string[]): CompareRow {
  return { key, label, values, differs: new Set(values).size > 1 };
}

function ComponentCompare({ ids }: { ids: string[] }) {
  const catalog = useCatalog();
  const navigate = useNavigate();
  const { draft, apply } = useBuilder();
  const [highlight, setHighlight] = useState(true);
  const [hideIdentical, setHideIdentical] = useState(false);
  const [status, setStatus] = useState('');

  if (catalog.isError)
    return <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />;
  if (!catalog.data) return <Loading label="Loading catalog…" />;

  const unique = [...new Set(ids)];
  const shownIds = unique.slice(0, MAX_ITEMS);
  const missing = shownIds.filter((id) => !catalog.byId.has(id));
  const items = shownIds
    .map((id) => catalog.byId.get(id))
    .filter((i): i is CatalogItem => Boolean(i));
  const kinds = [...new Set(items.map((i) => i.kind))];

  const removeFromCompare = (id: string) => {
    const rest = shownIds.filter((x) => x !== id);
    navigate(rest.length ? compareIdsPath(rest) : '/compare', { replace: true });
  };

  const addToStack = (item: CatalogItem) => {
    const replacing = draft ? Boolean(primarySelection(draft.build, item.kind)) : false;
    apply(
      (b) => addOrReplace(b, item, catalog.byId),
      `${replacing ? 'Replaced' : 'Added'} ${KIND_LABELS[item.kind]}: ${item.name}`,
      [item.kind],
    );
    setStatus(
      `${replacing ? 'Replaced' : 'Added'} ${item.name} in your stack as ${KIND_LABELS[item.kind]}.`,
    );
  };

  // Field union across kinds, aligned by key (first label wins).
  const fields = new Map<string, FieldDef>();
  for (const kind of kinds)
    for (const f of specFields(kind)) if (!fields.has(f.key)) fields.set(f.key, f);
  const kindFieldKeys = new Map<ComponentKind, Set<string>>(
    kinds.map((k) => [k, new Set(specFields(k).map((f) => f.key))]),
  );

  const overview: CompareRow[] = [
    makeRow(
      'kind',
      'Component kind',
      items.map((i) => KIND_LABELS[i.kind]),
    ),
    makeRow(
      'status',
      'Catalog status',
      items.map((i) => humanize(i.status)),
    ),
    makeRow(
      'billing',
      'Billing class',
      items.map((i) => BILLING_LABELS[i.billing_class]),
    ),
    makeRow(
      'version',
      'Version',
      items.map((i) => i.version),
    ),
    makeRow(
      'verification',
      'Recorded provenance status',
      items.map((i) => humanize(strongestVerification(i))),
    ),
    makeRow(
      'checked',
      'Recorded evidence date',
      items.map((i) => {
        const f = itemFreshness(i);
        return evidenceDateLabel(f);
      }),
    ),
  ];
  const specRows: CompareRow[] = [...fields.values()].map((f) =>
    makeRow(
      f.key,
      f.label,
      items.map((i) =>
        kindFieldKeys.get(i.kind)?.has(f.key)
          ? formatValue(specValue(i, f.key), f)
          : 'Not applicable to this kind',
      ),
    ),
  );
  const visible = (rows: CompareRow[]) => (hideIdentical ? rows.filter((r) => r.differs) : rows);
  const differing = [...overview, ...specRows].filter((r) => r.differs).length;

  return (
    <>
      {unique.length > MAX_ITEMS ? (
        <Notice tone="warning">
          Up to {MAX_ITEMS} components can be compared at once; showing the first {MAX_ITEMS}.
        </Notice>
      ) : null}
      {missing.length ? (
        <Notice tone="warning" title="Not in this catalog:">
          {missing.join(', ')}. These ids do not exist in catalog snapshot {catalog.data.id}.
        </Notice>
      ) : null}
      {kinds.length > 1 ? (
        <Notice title="Different kinds.">
          These components are of different kinds ({kinds.map((k) => KIND_LABELS[k]).join(', ')}).
          Rows are aligned by field; fields that a kind does not have are marked &ldquo;Not
          applicable to this kind&rdquo;.
        </Notice>
      ) : null}
      {items.length < 2 ? (
        <EmptyState
          title="Choose at least two components to compare"
          action={
            <Link className="btn-primary" to="/catalog">
              Browse the catalog
            </Link>
          }
        >
          {items.length === 1 ? `Only ${items[0]!.name} could be found. ` : null}Use the compare
          checkboxes on a catalog selection page to pick 2–{MAX_ITEMS} components.
        </EmptyState>
      ) : null}
      {items.length ? (
        <section aria-labelledby="compare-table-heading" className="card min-w-0 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="compare-table-heading" className="text-lg font-semibold">
              Side by side
            </h2>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={highlight}
                  onChange={(e) => setHighlight(e.target.checked)}
                />
                Highlight differences
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={hideIdentical}
                  onChange={(e) => setHideIdentical(e.target.checked)}
                />
                Hide identical rows
              </label>
            </div>
          </div>
          <p className="muted mt-1 text-sm" role="status" aria-live="polite">
            {differing} of {overview.length + specRows.length} rows differ.
            {hideIdentical ? ' Identical rows are hidden.' : ''}
          </p>
          {status ? (
            <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-200" role="status">
              {status}{' '}
              <Link className="link" to="/builder">
                Open the builder
              </Link>
            </p>
          ) : null}
          <div
            className="mt-3 overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Scrollable table"
          >
            <table className="data-table min-w-[36rem] table-fixed">
              <caption className="sr-only">
                Comparison of {items.map((i) => i.name).join(', ')}. Rows marked
                &ldquo;Differs&rdquo; have different values.
              </caption>
              <colgroup>
                <col className="w-40" />
                {items.map((i) => (
                  <col key={i.id} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <td className="align-bottom">
                    <span className="sr-only">Field</span>
                  </td>
                  {items.map((item) => {
                    const sel = draft ? primarySelection(draft.build, item.kind) : undefined;
                    const inStack = draft?.build.selections.some(
                      (s) => s.catalog_item_id === item.id,
                    );
                    return (
                      <th key={item.id} scope="col" className="align-top normal-case">
                        <span className="grid gap-2 text-sm tracking-normal text-slate-900 dark:text-slate-100">
                          <Link className="link break-words" to={itemPath(item)}>
                            {item.name}
                          </Link>
                          {(item.tags ?? []).includes('synthetic') ? (
                            <SyntheticBadge className="w-fit" />
                          ) : null}
                          <span className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              disabled={!draft || inStack}
                              onClick={() => addToStack(item)}
                            >
                              {inStack
                                ? 'In your stack'
                                : sel
                                  ? 'Replace in stack'
                                  : 'Add to stack'}
                              {!inStack ? <span className="sr-only">: {item.name}</span> : null}
                            </button>
                            <button
                              type="button"
                              className="btn-ghost btn-sm"
                              onClick={() => removeFromCompare(item.id)}
                            >
                              Remove<span className="sr-only"> {item.name} from comparison</span>
                            </button>
                          </span>
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <RowGroup
                title="Overview"
                rows={visible(overview)}
                columns={items.length}
                highlight={highlight}
              />
              <RowGroup
                title="Specification"
                rows={visible(specRows)}
                columns={items.length}
                highlight={highlight}
              />
            </table>
          </div>
          <p className="muted mt-3 text-xs">
            Specification values come from the catalog snapshot {catalog.data.id}. Demo values are
            synthetic and are not measurements of real products. Recorded provenance statuses do not
            establish independent verification: historical verified labels may record source checks
            only. Dates do not establish currentness. See the{' '}
            <Link className="link" to="/methodology#evidence">
              evidence policy
            </Link>
            .
          </p>
        </section>
      ) : null}
    </>
  );
}

function RowGroup({
  title,
  rows,
  columns,
  highlight,
}: {
  title: string;
  rows: CompareRow[];
  columns: number;
  highlight: boolean;
}) {
  return (
    <tbody>
      <tr>
        <th scope="rowgroup" colSpan={columns + 1} className="bg-slate-50 dark:bg-slate-800/60">
          {title}
        </th>
      </tr>
      {rows.length === 0 ? (
        <tr>
          <td colSpan={columns + 1} className="muted">
            No differing rows in this group.
          </td>
        </tr>
      ) : null}
      {rows.map((r) => {
        const marked = highlight && r.differs;
        return (
          <tr key={r.key} className={marked ? 'bg-amber-50 dark:bg-amber-950/40' : undefined}>
            <th
              scope="row"
              className={`align-top text-left normal-case tracking-normal ${marked ? 'border-l-4 border-l-amber-500' : ''}`}
            >
              <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                {r.label}
              </span>
              {r.differs ? (
                <span
                  className={
                    marked
                      ? 'mt-1 inline-block rounded border border-amber-400 px-1 text-[11px] font-semibold text-amber-900 dark:border-amber-600 dark:text-amber-200'
                      : 'sr-only'
                  }
                >
                  ≠ Differs
                </span>
              ) : null}
            </th>
            {r.values.map((v, i) => (
              <td key={i} className={`break-words ${v.startsWith('Not ') ? 'muted italic' : ''}`}>
                {v}
              </td>
            ))}
          </tr>
        );
      })}
    </tbody>
  );
}

// ---- build compare -----------------------------------------------------------------------

interface Side {
  label: string;
  build: BuildSnapshot;
}

function SavedBuildsCompare({ ids }: { ids: string[] }) {
  const { builds } = useData();
  const [idA, idB] = ids;
  const a = useQuery({
    queryKey: ['builds', 'get', idA],
    queryFn: () => builds.get(idA!),
    enabled: Boolean(idA),
  });
  const b = useQuery({
    queryKey: ['builds', 'get', idB],
    queryFn: () => builds.get(idB!),
    enabled: Boolean(idB),
  });
  if (ids.length !== 2 || !idA || !idB) {
    return <BadParams>Build comparison needs exactly two saved build ids.</BadParams>;
  }
  if (a.isError || b.isError) {
    const failed = a.isError ? a : b;
    return (
      <ErrorState
        title="Could not load a saved build"
        error={failed.error}
        onRetry={() => void failed.refetch()}
      />
    );
  }
  if (!a.data || !b.data) return <Loading label="Loading saved builds…" />;
  return (
    <BuildDiff
      a={{ label: `${a.data.build.name} (r${a.data.build.revision})`, build: a.data.build }}
      b={{ label: `${b.data.build.name} (r${b.data.build.revision})`, build: b.data.build }}
    />
  );
}

function RevisionCompare({ revisions }: { revisions: number[] }) {
  const { draft, ready } = useBuilder();
  if (!ready || !draft) return <Loading label="Loading your current build…" />;
  if (revisions.length !== 2)
    return <BadParams>Revision comparison needs exactly two revision numbers.</BadParams>;
  const [ra, rb] = revisions as [number, number];
  const a = draft.revisions.find((r) => r.revision === ra);
  const b = draft.revisions.find((r) => r.revision === rb);
  if (!a || !b) {
    return (
      <BadParams>
        Revision {!a ? ra : rb} is not kept for &ldquo;{draft.build.name}&rdquo;. Kept revisions:{' '}
        {draft.revisions.map((r) => r.revision).join(', ')}.
      </BadParams>
    );
  }
  return (
    <BuildDiff
      a={{ label: `Revision ${ra}`, build: a }}
      b={{ label: `Revision ${rb}`, build: b }}
    />
  );
}

function BadParams({ children }: { children: React.ReactNode }) {
  return (
    <EmptyState
      title="This comparison link is incomplete"
      action={
        <Link className="btn-secondary" to="/compare">
          Choose what to compare
        </Link>
      }
    >
      {children}
    </EmptyState>
  );
}

/** Evaluation and cost for one exact build revision (no evidence passed: like-for-like on both sides). */
function useSideAnalysis(build: BuildSnapshot) {
  const { compatibility, pricing } = useData();
  const evaluation = useQuery({
    queryKey: ['compare', 'evaluation', build.id, build.revision],
    queryFn: () => compatibility.evaluate(build),
  });
  const cost = useQuery({
    queryKey: ['compare', 'cost', build.id, build.revision],
    queryFn: () => pricing.estimate(build),
  });
  return { evaluation, cost };
}

type ChangeKind = 'added' | 'removed' | 'changed' | 'settings' | 'unchanged';

const CHANGE_LABELS: Record<ChangeKind, string> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
  settings: 'Settings changed',
  unchanged: 'Unchanged',
};

const CHANGE_CLASS: Record<ChangeKind, string> = {
  added: 'border-emerald-400 text-emerald-900 dark:border-emerald-700 dark:text-emerald-200',
  removed: 'border-red-400 text-red-900 dark:border-red-700 dark:text-red-200',
  changed: 'border-sky-400 text-sky-900 dark:border-sky-700 dark:text-sky-200',
  settings: 'border-sky-400 text-sky-900 dark:border-sky-700 dark:text-sky-200',
  unchanged: 'border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300',
};

const CHANGE_MARK: Record<ChangeKind, string> = {
  added: '+',
  removed: '−',
  changed: '~',
  settings: '~',
  unchanged: '=',
};

function ChangeLabel({ change }: { change: ChangeKind }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 text-xs font-semibold whitespace-nowrap ${CHANGE_CLASS[change]}`}
    >
      <span aria-hidden="true">{CHANGE_MARK[change]}</span>
      {CHANGE_LABELS[change]}
    </span>
  );
}

interface SelectionDiff {
  key: string;
  kind: ComponentKind;
  role: string;
  a?: Selection;
  b?: Selection;
  change: ChangeKind;
}

function diffSelections(a: BuildSnapshot, b: BuildSnapshot): SelectionDiff[] {
  const key = (s: Selection) => `${s.kind}|${s.role}`;
  const mapA = new Map(a.selections.map((s) => [key(s), s]));
  const mapB = new Map(b.selections.map((s) => [key(s), s]));
  const out: SelectionDiff[] = [];
  for (const k of new Set([...mapA.keys(), ...mapB.keys()])) {
    const sa = mapA.get(k);
    const sb = mapB.get(k);
    const ref = (sa ?? sb)!;
    let change: ChangeKind = 'unchanged';
    if (!sa) change = 'added';
    else if (!sb) change = 'removed';
    else if (
      sa.catalog_item_id !== sb.catalog_item_id ||
      sa.catalog_item_version !== sb.catalog_item_version
    )
      change = 'changed';
    else if (
      sa.enabled !== sb.enabled ||
      JSON.stringify(sa.settings) !== JSON.stringify(sb.settings)
    )
      change = 'settings';
    out.push({ key: k, kind: ref.kind, role: ref.role, a: sa, b: sb, change });
  }
  return out;
}

function formatEntry(value: unknown): string {
  return formatValue(value);
}

function BuildDiff({ a, b }: { a: Side; b: Side }) {
  const catalog = useCatalog();
  const left = useSideAnalysis(a.build);
  const right = useSideAnalysis(b.build);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const byId = catalog.byId;
  const itemName = (s: Selection | undefined) => {
    if (!s) return '—';
    const item = byId.get(s.catalog_item_id);
    return `${item?.name ?? `${s.catalog_item_id} (not in this catalog)`}${s.enabled ? '' : ' (disabled)'}`;
  };

  const diffs = diffSelections(a.build, b.build);
  const counts = diffs.reduce<Record<ChangeKind, number>>(
    (acc, d) => ({ ...acc, [d.change]: acc[d.change] + 1 }),
    { added: 0, removed: 0, changed: 0, settings: 0, unchanged: 0 },
  );

  const objectiveRows = [
    ...new Set([...Object.keys(a.build.objectives), ...Object.keys(b.build.objectives)]),
  ].map((k) => ({
    key: `objectives.${k}`,
    label: humanize(k),
    va: formatEntry((a.build.objectives as Record<string, unknown>)[k]),
    vb: formatEntry((b.build.objectives as Record<string, unknown>)[k]),
  }));
  const policyRows = [
    ...new Set([...Object.keys(a.build.policy ?? {}), ...Object.keys(b.build.policy ?? {})]),
  ].map((k) => ({
    key: `policy.${k}`,
    label: `Policy: ${humanize(k).toLowerCase()}`,
    va: formatEntry((a.build.policy as Record<string, unknown> | undefined)?.[k]),
    vb: formatEntry((b.build.policy as Record<string, unknown> | undefined)?.[k]),
  }));
  const settingRows = [
    { key: 'name', label: 'Build name', va: a.build.name, vb: b.build.name },
    ...objectiveRows,
    ...policyRows,
    {
      key: 'catalog',
      label: 'Catalog snapshot',
      va: a.build.locks.catalog_snapshot_id,
      vb: b.build.locks.catalog_snapshot_id,
    },
    {
      key: 'ruleset',
      label: 'Ruleset',
      va: `${a.build.locks.ruleset_id}@${a.build.locks.ruleset_version}`,
      vb: `${b.build.locks.ruleset_id}@${b.build.locks.ruleset_version}`,
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">A:</span> {a.label}
        <span aria-hidden="true">→</span>
        <span className="font-semibold">B:</span> {b.label}
        <Link className="link ml-auto" to="/compare">
          Compare something else
        </Link>
      </div>
      <p className="muted text-sm">
        Changes are described going from A to B: &ldquo;Added&rdquo; means only B has the selection.
      </p>

      <section aria-labelledby="sel-diff-heading" className="card min-w-0 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="sel-diff-heading" className="text-lg font-semibold">
            Selections by tier
          </h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showUnchanged}
              onChange={(e) => setShowUnchanged(e.target.checked)}
            />
            Show unchanged selections
          </label>
        </div>
        <p className="muted mt-1 text-sm tabular">
          {counts.added} added, {counts.removed} removed, {counts.changed} changed,{' '}
          {counts.settings} with changed settings, {counts.unchanged} unchanged.
        </p>
        {TIERS.map((tier) => {
          const kinds = kindsInTier(tier).map((k) => k.kind);
          const rows = diffs
            .filter((d) => kinds.includes(d.kind))
            .sort((x, y) => kinds.indexOf(x.kind) - kinds.indexOf(y.kind))
            .filter((d) => showUnchanged || d.change !== 'unchanged');
          if (!rows.length) return null;
          return (
            <div
              key={tier}
              className="mt-4 overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Scrollable table"
            >
              <table className="data-table">
                <caption className="text-left font-semibold">
                  {tier} — {TIER_LABELS[tier]}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Component</th>
                    <th scope="col">A</th>
                    <th scope="col">B</th>
                    <th scope="col">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.key}>
                      <th
                        scope="row"
                        className="text-left text-sm font-medium tracking-normal text-slate-800 normal-case dark:text-slate-200"
                      >
                        {KIND_LABELS[d.kind]}
                        {d.role !== 'primary' ? (
                          <span className="muted block text-xs">{d.role}</span>
                        ) : null}
                      </th>
                      <td className="break-words">{itemName(d.a)}</td>
                      <td className="break-words">{itemName(d.b)}</td>
                      <td>
                        <ChangeLabel change={d.change} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        {diffs.length === 0 ? (
          <p className="mt-3 text-sm">Neither build has any selections.</p>
        ) : null}
        {diffs.length > 0 && !showUnchanged && counts.unchanged === diffs.length ? (
          <p className="mt-3 text-sm">The selections are identical.</p>
        ) : null}
      </section>

      <section aria-labelledby="obj-diff-heading" className="card min-w-0 p-4">
        <h2 id="obj-diff-heading" className="text-lg font-semibold">
          Objectives, policy and locks
        </h2>
        <div
          className="mt-3 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Scrollable table"
        >
          <table className="data-table">
            <caption className="sr-only">Objectives, policy and locks of A and B</caption>
            <thead>
              <tr>
                <th scope="col">Setting</th>
                <th scope="col">A</th>
                <th scope="col">B</th>
                <th scope="col">Change</th>
              </tr>
            </thead>
            <tbody>
              {settingRows.map((r) => (
                <tr key={r.key}>
                  <th
                    scope="row"
                    className="text-left text-sm font-medium tracking-normal text-slate-800 normal-case dark:text-slate-200"
                  >
                    {r.label}
                  </th>
                  <td className="break-words">{r.va}</td>
                  <td className="break-words">{r.vb}</td>
                  <td>
                    {r.va === r.vb ? (
                      <span className="muted text-xs">Same</span>
                    ) : (
                      <ChangeLabel change="changed" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <OutcomeDiff a={a} b={b} left={left.evaluation} right={right.evaluation} />
      <CostDiff a={a} b={b} left={left.cost} right={right.cost} />
    </>
  );
}

interface QueryLike<T> {
  data: T | undefined;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

function OutcomeDiff({
  a,
  b,
  left,
  right,
}: {
  a: Side;
  b: Side;
  left: QueryLike<EvaluationReport>;
  right: QueryLike<EvaluationReport>;
}) {
  const ra = left.data;
  const rb = right.data;
  let body;
  if (left.isError || right.isError) {
    const failed = left.isError ? left : right;
    body = (
      <ErrorState
        title="Compatibility evaluation failed"
        error={failed.error}
        onRetry={() => void failed.refetch()}
      />
    );
  } else if (!ra || !rb) {
    body = <Loading label="Evaluating both builds…" />;
  } else {
    const oa = new Map(ra.findings.map((f) => [f.rule_id, f.outcome]));
    const ob = new Map(rb.findings.map((f) => [f.rule_id, f.outcome]));
    const changed = [...new Set([...oa.keys(), ...ob.keys()])].filter(
      (id) => oa.get(id) !== ob.get(id),
    );
    const summaryRows: {
      label: string;
      outcome: Outcome;
      key: keyof EvaluationReport['summary'];
    }[] = [
      { label: 'Failing', outcome: 'fail', key: 'failed' },
      { label: 'Unknown', outcome: 'unknown', key: 'unknown' },
      { label: 'Passing', outcome: 'pass', key: 'passed' },
      { label: 'Skipped', outcome: 'skipped', key: 'skipped' },
    ];
    body = (
      <>
        <div
          className="mt-3 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Scrollable table"
        >
          <table className="data-table tabular">
            <caption className="sr-only">Number of checks per outcome for A and B</caption>
            <thead>
              <tr>
                <th scope="col">Outcome</th>
                <th scope="col">A</th>
                <th scope="col">B</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((r) => (
                <tr key={r.key}>
                  <th scope="row" className="text-left">
                    <OutcomeBadge outcome={r.outcome} label={r.label} />
                  </th>
                  <td>{ra.summary[r.key]}</td>
                  <td>{rb.summary[r.key]}</td>
                </tr>
              ))}
              <tr>
                <th
                  scope="row"
                  className="text-left text-sm font-medium tracking-normal normal-case"
                >
                  Deployment readiness
                </th>
                <td>{humanize(ra.deployment_readiness)}</td>
                <td>{humanize(rb.deployment_readiness)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <h3 className="mt-4 font-semibold">Rules whose outcome changed ({changed.length})</h3>
        {changed.length === 0 ? (
          <p className="mt-1 text-sm">Every rule has the same outcome for A and B.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {changed.map((id) => {
              const before = oa.get(id);
              const after = ob.get(id);
              return (
                <li key={id} className="flex flex-wrap items-center gap-2 text-sm">
                  <code className="font-mono text-xs break-all">{id}</code>
                  {before ? (
                    <OutcomeBadge outcome={before} />
                  ) : (
                    <span className="muted text-xs">Not reported</span>
                  )}
                  <span aria-hidden="true">→</span>
                  <span className="sr-only">changed to</span>
                  {after ? (
                    <OutcomeBadge outcome={after} />
                  ) : (
                    <span className="muted text-xs">Not reported</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="muted mt-3 text-xs">
          A: ruleset {ra.ruleset_id}@{ra.ruleset_version}, revision {ra.build_revision}. B: ruleset{' '}
          {rb.ruleset_id}@{rb.ruleset_version}, revision {rb.build_revision}. Both are evaluated
          without capacity or cost evidence so they are compared like for like; the builder may show
          more results for the current revision. Unknown is never counted as compatible.
        </p>
      </>
    );
  }
  return (
    <section
      aria-labelledby="outcome-diff-heading"
      className="card min-w-0 p-4"
      aria-busy={!ra || !rb}
    >
      <h2 id="outcome-diff-heading" className="text-lg font-semibold">
        Compatibility outcomes
      </h2>
      <p className="muted mt-1 text-sm">
        {a.label} vs {b.label}
      </p>
      {body}
    </section>
  );
}

function CostDiff({
  a,
  b,
  left,
  right,
}: {
  a: Side;
  b: Side;
  left: QueryLike<CostEstimate>;
  right: QueryLike<CostEstimate>;
}) {
  const ca = left.data;
  const cb = right.data;
  let body;
  if (left.isError || right.isError) {
    const failed = left.isError ? left : right;
    body = (
      <ErrorState
        title="Cost estimate unavailable"
        error={failed.error}
        onRetry={() => void failed.refetch()}
      />
    );
  } else if (!ca || !cb) {
    body = <Loading label="Estimating cost for both builds…" />;
  } else {
    const ha = costHeadline(ca);
    const hb = costHeadline(cb);
    const comparable =
      ca.coverage === 'complete' &&
      cb.coverage === 'complete' &&
      ca.currency === cb.currency &&
      ca.period_days === cb.period_days;
    const delta = comparable ? Number(cb.total.amount) - Number(ca.total.amount) : null;
    body = (
      <>
        <div
          className="mt-3 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Scrollable table"
        >
          <table className="data-table tabular">
            <caption className="sr-only">Estimated cost of A and B</caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">A</th>
                <th scope="col">B</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Estimate', va: ha.text, vb: hb.text },
                { label: 'Coverage', va: humanize(ca.coverage), vb: humanize(cb.coverage) },
                {
                  label: 'Unpriced components',
                  va: String(ca.unpriced_selection_ids.length),
                  vb: String(cb.unpriced_selection_ids.length),
                },
                { label: 'Period', va: `${ca.period_days} days`, vb: `${cb.period_days} days` },
                { label: 'Pricebook', va: ca.pricebook_id, vb: cb.pricebook_id },
              ].map((r) => (
                <tr key={r.label}>
                  <th
                    scope="row"
                    className="text-left text-sm font-medium tracking-normal normal-case"
                  >
                    {r.label}
                  </th>
                  <td className="break-words">{r.va}</td>
                  <td className="break-words">{r.vb}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm">
          {delta !== null ? (
            <>
              <strong>Difference (B − A):</strong>{' '}
              {delta === 0
                ? 'no change'
                : `${delta > 0 ? '+' : '−'}${formatMoney(String(Math.abs(delta)), ca.currency)} per ${ca.period_days} days`}
              .
            </>
          ) : (
            <>
              <strong>Difference not computed:</strong> at least one estimate is incomplete or uses
              a different currency or period, so subtracting the totals would be misleading.
            </>
          )}
        </p>
        <p className="muted mt-1 text-xs">
          {ha.detail} {hb.detail !== ha.detail ? hb.detail : ''} Synthetic demo prices — not a
          quote.
        </p>
      </>
    );
  }
  return (
    <section
      aria-labelledby="cost-diff-heading"
      className="card min-w-0 p-4"
      aria-busy={!ca || !cb}
    >
      <h2 id="cost-diff-heading" className="text-lg font-semibold">
        Estimated cost
      </h2>
      <p className="muted mt-1 text-sm">
        {a.label} vs {b.label}
      </p>
      {body}
    </section>
  );
}

// ---- empty state -------------------------------------------------------------------------

interface PickOption {
  value: string;
  label: string;
  detail?: string;
}

function PickTwo({
  id,
  legend,
  options,
  onCompare,
}: {
  id: string;
  legend: string;
  options: PickOption[];
  onCompare: (values: [string, string]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (value: string, on: boolean) =>
    setPicked((p) =>
      on ? [...p.filter((v) => v !== value), value].slice(-2) : p.filter((v) => v !== value),
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (picked.length === 2) onCompare([picked[0]!, picked[1]!]);
      }}
    >
      <fieldset>
        <legend className="font-semibold">{legend}</legend>
        <p className="hint" id={`${id}-hint`}>
          Choose exactly two. Choosing a third replaces the earliest choice.
        </p>
        <ul className="mt-2 grid max-h-72 gap-1 overflow-auto">
          {options.map((o) => (
            <li key={o.value}>
              <label className="flex items-start gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={picked.includes(o.value)}
                  onChange={(e) => toggle(o.value, e.target.checked)}
                  aria-describedby={`${id}-hint`}
                />
                <span>
                  {o.label}
                  {o.detail ? <span className="muted block text-xs">{o.detail}</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <button type="submit" className="btn-primary mt-3" disabled={picked.length !== 2}>
        Compare {picked.length === 2 ? 'these two' : `(${picked.length} of 2 chosen)`}
      </button>
    </form>
  );
}

function CompareStart() {
  const navigate = useNavigate();
  const { draft } = useBuilder();
  const { builds } = useData();
  const saved = useQuery({ queryKey: ['builds', 'list'], queryFn: () => builds.list() });
  const readable = (saved.data ?? []).filter((s) => s.revision > 0);
  const changes = new Map(draft?.changes.map((c) => [c.revision, c]) ?? []);
  const revisionOptions: PickOption[] = [...(draft?.revisions ?? [])].reverse().map((r) => ({
    value: String(r.revision),
    label: `Revision ${r.revision}${r.revision === draft?.build.revision ? ' (current)' : ''}`,
    detail: changes.get(r.revision)?.summary,
  }));

  return (
    <>
      <section aria-labelledby="modes-heading" className="card p-4">
        <h2 id="modes-heading" className="text-lg font-semibold">
          Two ways to compare
        </h2>
        <ul className="mt-2 grid gap-3 text-sm md:grid-cols-2">
          <li>
            <h3 className="font-semibold">Components</h3>
            <p className="muted mt-1">
              Pick 2–{MAX_ITEMS} catalog components with the compare checkboxes on a selection page.
              They line up field by field with differences highlighted, and each column can be added
              to your stack.
            </p>
            <Link className="btn-secondary mt-2" to="/catalog">
              Browse the catalog
            </Link>
          </li>
          <li>
            <h3 className="font-semibold">Builds</h3>
            <p className="muted mt-1">
              Diff two revisions of your current build, or two saved builds: selections per tier,
              objectives, compatibility outcomes and estimated cost.
            </p>
          </li>
        </ul>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="rev-heading" className="card p-4">
          <h2 id="rev-heading" className="text-lg font-semibold">
            Revisions of your current build
          </h2>
          {!draft ? (
            <Loading label="Loading your current build…" />
          ) : draft.revisions.length < 2 ? (
            <p className="muted mt-2 text-sm">
              &ldquo;{draft.build.name}&rdquo; has only one kept revision. Every change in the{' '}
              <Link className="link" to="/builder">
                builder
              </Link>{' '}
              creates a new one.
            </p>
          ) : (
            <div className="mt-2">
              <PickTwo
                id="pick-revisions"
                legend={`Revisions of “${draft.build.name}”`}
                options={revisionOptions}
                onCompare={([x, y]) => {
                  const [lo, hi] = [Number(x), Number(y)].sort((m, n) => m - n);
                  navigate(`/compare?revisions=${lo},${hi}`);
                }}
              />
            </div>
          )}
        </section>

        <section aria-labelledby="saved-heading" className="card p-4">
          <h2 id="saved-heading" className="text-lg font-semibold">
            Saved builds
          </h2>
          {saved.isError ? (
            <ErrorState error={saved.error} onRetry={() => void saved.refetch()} />
          ) : !saved.data ? (
            <Loading label="Loading saved builds…" />
          ) : readable.length < 2 ? (
            <p className="muted mt-2 text-sm">
              You need at least two saved builds in this browser. See{' '}
              <Link className="link" to="/builds">
                My Builds
              </Link>
              .
            </p>
          ) : (
            <div className="mt-2">
              <PickTwo
                id="pick-builds"
                legend="Saved builds in this browser"
                options={readable.map((s) => ({
                  value: s.id,
                  label: s.name,
                  detail: `Revision ${s.revision} · ${s.selectionCount} selection${s.selectionCount === 1 ? '' : 's'}`,
                }))}
                onCompare={([x, y]) =>
                  navigate(`/compare?builds=${encodeURIComponent(x)},${encodeURIComponent(y)}`)
                }
              />
            </div>
          )}
        </section>
      </div>
    </>
  );
}
