import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { KIND_LABELS, TIERS, TIER_LABELS, TIER_SUMMARIES, kindsInTier } from '../../contracts';
import { useCatalog } from '../../app/queries';
import { ErrorState, Loading } from '../../components/feedback';
import { PageHeader } from '../../components/layout';
import { SyntheticBadge } from '../../components/status';
import { itemPath, itemSummary, kindPath } from '../../lib/catalog-view';

export default function CatalogIndexPage() {
  const catalog = useCatalog();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of catalog.data?.items ?? []) m.set(i.kind, (m.get(i.kind) ?? 0) + 1);
    return m;
  }, [catalog.data]);
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return (catalog.data?.items ?? []).filter((i) =>
      [i.name, i.description ?? '', i.id, KIND_LABELS[i.kind]].some((s) =>
        s.toLowerCase().includes(term),
      ),
    );
  }, [catalog.data, q]);

  return (
    <>
      <PageHeader eyebrow="Component Catalog" title="Browse components by tier">
        The catalog is organised by the contract&apos;s 29 component kinds across tiers T0–T6.
      </PageHeader>
      <div className="mx-auto max-w-7xl px-4 py-6">
        {catalog.isPending ? <Loading label="Loading catalog…" /> : null}
        {catalog.isError ? (
          <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
        ) : null}
        {catalog.data ? (
          <>
            <div className="card flex flex-wrap items-center gap-3 p-4 text-sm">
              <span>
                Snapshot <code className="font-mono">{catalog.data.id}</code> r
                {catalog.data.revision} · {catalog.data.items.length} records · captured{' '}
                <time dateTime={catalog.data.captured_at}>
                  {catalog.data.captured_at.slice(0, 10)}
                </time>
                . Capture date does not establish currentness or independent verification.
              </span>
              {catalog.data.items.some((i) => i.tags?.includes('synthetic')) ? (
                <SyntheticBadge />
              ) : null}
            </div>
            <form role="search" className="mt-4 max-w-xl" onSubmit={(e) => e.preventDefault()}>
              <label htmlFor="catalog-search" className="label">
                Search all components
              </label>
              <input
                id="catalog-search"
                type="search"
                className="input"
                value={q}
                placeholder="e.g. embedding, ROCm, MCP"
                onChange={(e) =>
                  setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })
                }
              />
            </form>
            {q ? (
              <section aria-labelledby="results-h" className="mt-4">
                <h2 id="results-h" className="text-lg font-semibold" aria-live="polite">
                  {results.length} result{results.length === 1 ? '' : 's'} for “{q}”
                </h2>
                <ul className="mt-2 grid gap-2 md:grid-cols-2">
                  {results.map((i) => (
                    <li key={i.id} className="card p-3">
                      <Link className="link" to={itemPath(i)}>
                        {i.name}
                      </Link>
                      <p className="muted text-xs">
                        {i.tier} · {KIND_LABELS[i.kind]} · {itemSummary(i)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <div className="mt-6 grid gap-6">
              {TIERS.map((tier) => (
                <section key={tier} aria-labelledby={`cat-${tier}`} className="card p-4">
                  <h2 id={`cat-${tier}`} className="text-lg font-semibold">
                    <span className="mr-2 rounded bg-brand-700 px-1.5 py-0.5 font-mono text-xs text-white dark:bg-brand-500 dark:text-slate-950">
                      {tier}
                    </span>
                    {TIER_LABELS[tier]}
                  </h2>
                  <p className="muted mt-1 text-sm">{TIER_SUMMARIES[tier]}</p>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {kindsInTier(tier).map((k) => (
                      <li key={k.kind}>
                        <Link
                          to={kindPath(k.kind)}
                          className="block h-full rounded-md border border-slate-200 p-3 hover:border-brand-500 hover:bg-brand-50 dark:border-slate-700 dark:hover:bg-brand-950"
                        >
                          <span className="font-medium">{KIND_LABELS[k.kind]}</span>
                          <span className="muted block text-xs">
                            {counts.get(k.kind) ?? 0} record{counts.get(k.kind) === 1 ? '' : 's'} ·{' '}
                            {k.cardinality === 'one' ? 'one per build' : 'one or more'}
                          </span>
                          <span className="muted mt-1 block text-xs">{k.notes}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
