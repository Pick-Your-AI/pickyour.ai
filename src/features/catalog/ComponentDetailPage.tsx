import { evidenceDateLabel } from '../../domain/freshness';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import {
  KIND_LABELS,
  TIER_LABELS,
  isComponentKind,
  kindDef,
  kindFromSlug,
  labelInSentence,
} from '../../contracts';
import { addOrReplace } from '../../domain/build';
import { neighbours } from '../../domain/invalidation';
import { useBuilder } from '../../app/builder-context';
import { useData } from '../../app/data-context';
import { useCatalog, useGraph, usePricebook, useRuleset } from '../../app/queries';
import { ErrorState, Loading, Notice } from '../../components/feedback';
import { PageHeader } from '../../components/layout';
import { SyntheticBadge } from '../../components/status';
import { BILLING_LABELS, idToSlug, itemPath, kindPath, slugToId } from '../../lib/catalog-view';
import { formatValue, humanize, specFields } from '../../lib/schema-fields';
import { formatMoney } from '../builder/analysis';
import NotFoundPage from '../../pages/NotFoundPage';

export default function ComponentDetailPage() {
  const { kindSlug = '', itemSlug = '' } = useParams();
  const kindRaw = kindFromSlug(kindSlug);
  const id = slugToId(itemSlug);
  const catalog = useCatalog();
  const graph = useGraph();
  const ruleset = useRuleset();
  const pricebook = usePricebook();
  const { evidence } = useData();
  const { draft, apply } = useBuilder();
  const navigate = useNavigate();
  const item = catalog.byId.get(id);
  const ev = useQuery({
    queryKey: ['evidence', id, item?.version],
    queryFn: () => evidence.forItem(item!),
    enabled: Boolean(item),
  });

  if (catalog.isPending)
    return (
      <div className="mx-auto max-w-7xl px-4">
        <Loading />
      </div>
    );
  if (catalog.isError)
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
      </div>
    );
  if (!item || !isComponentKind(kindRaw) || item.kind !== kindRaw) return <NotFoundPage />;

  const def = kindDef(item.kind);
  const label = KIND_LABELS[item.kind];
  const fields = specFields(item.kind);
  const spec = item.spec as Record<string, unknown>;
  const current = draft?.build.selections.find((s) => s.kind === item.kind && s.role === 'primary');
  const isSelected = draft?.build.selections.some((s) => s.catalog_item_id === item.id);
  const rels = graph.data ? neighbours(graph.data, item.kind) : null;
  const rules = (ruleset.data?.rules ?? []).filter((r) =>
    (r.affected_kinds as string[]).includes(item.kind),
  );
  const rates = (pricebook.data?.rates ?? []).filter((r) => r.catalog_item_id === item.id);
  const now = new Date().toISOString();
  const siblings = (catalog.data?.items ?? []).filter(
    (i) => i.kind === item.kind && i.id !== item.id,
  );

  const add = () => {
    if (!draft) return;
    apply(
      (b) => addOrReplace(b, item, catalog.byId),
      `${current ? 'Replaced' : 'Added'} ${label}: ${item.name}`,
      [item.kind],
    );
    navigate('/builder');
  };

  return (
    <>
      <PageHeader eyebrow={`${def.tier} · ${TIER_LABELS[def.tier]} · ${label}`} title={item.name}>
        {item.description}
      </PageHeader>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_20rem]">
        <div className="grid min-w-0 gap-6">
          {item.tags?.includes('synthetic') ? (
            <Notice tone="warning" title="Synthetic demo record.">
              This component is fictional test data for the preview. Its specifications are invented
              and are not a real product.
            </Notice>
          ) : null}
          <section aria-labelledby="spec-h" className="card p-4">
            <h2 id="spec-h" className="text-lg font-semibold">
              Specifications
            </h2>
            <table className="data-table mt-2">
              <caption className="sr-only">Specification of {item.name}</caption>
              <tbody>
                {fields.map((f) => {
                  const v = spec[f.key];
                  const ref = f.isRef && typeof v === 'string' ? catalog.byId.get(v) : undefined;
                  const refs =
                    f.isRef && Array.isArray(v)
                      ? v.map((x) => catalog.byId.get(String(x)))
                      : undefined;
                  return (
                    <tr key={f.key}>
                      <th scope="row" className="w-1/3 font-medium normal-case tracking-normal">
                        {f.label}
                        {f.required ? <span className="muted text-xs"> (required)</span> : null}
                      </th>
                      <td className={v === undefined ? 'muted italic' : 'tabular'}>
                        {ref ? (
                          <Link className="link" to={itemPath(ref)}>
                            {ref.name}
                          </Link>
                        ) : refs ? (
                          refs.map((r, i) =>
                            r ? (
                              <Link key={r.id} className="link mr-2" to={itemPath(r)}>
                                {r.name}
                              </Link>
                            ) : (
                              <span key={i}>{String((v as unknown[])[i])} (not in catalog) </span>
                            ),
                          )
                        ) : (
                          formatValue(v, f)
                        )}
                      </td>
                    </tr>
                  );
                })}
                {item.license ? (
                  <tr>
                    <th scope="row" className="font-medium normal-case tracking-normal">
                      Licence (catalog metadata)
                    </th>
                    <td>
                      {Object.entries(item.license)
                        .map(([k, v]) => `${humanize(k)}: ${formatValue(v)}`)
                        .join(' · ')}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
          <section aria-labelledby="deps-h" className="card p-4">
            <h2 id="deps-h" className="text-lg font-semibold">
              Dependencies
            </h2>
            <p className="muted mt-1 text-sm">
              From the contract dependency graph. Edges drive re-evaluation in both directions; they
              are not compatibility verdicts.
            </p>
            {rels ? (
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="font-semibold">{label} depends on</h3>
                  <ul className="mt-1 space-y-1 text-sm">
                    {rels.dependsOn.length ? (
                      rels.dependsOn.map((e) => (
                        <li key={e.id}>
                          <Link className="link" to={kindPath(e.depends_on_kind)}>
                            {KIND_LABELS[e.depends_on_kind]}
                          </Link>{' '}
                          <span className="muted">
                            ({e.relationship}, when {e.activation.replace(/_/g, ' ')})
                          </span>
                        </li>
                      ))
                    ) : (
                      <li className="muted">Nothing.</li>
                    )}
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold">Depends on {labelInSentence(label)}</h3>
                  <ul className="mt-1 space-y-1 text-sm">
                    {rels.dependents.length ? (
                      rels.dependents.map((e) => (
                        <li key={e.id}>
                          <Link className="link" to={kindPath(e.dependent_kind)}>
                            {KIND_LABELS[e.dependent_kind]}
                          </Link>{' '}
                          <span className="muted">
                            ({e.relationship}, when {e.activation.replace(/_/g, ' ')})
                          </span>
                        </li>
                      ))
                    ) : (
                      <li className="muted">Nothing.</li>
                    )}
                  </ul>
                </div>
              </div>
            ) : (
              <Loading />
            )}
          </section>
          <section aria-labelledby="rules-h" className="card p-4">
            <h2 id="rules-h" className="text-lg font-semibold">
              Compatibility rules involving {labelInSentence(label)} ({rules.length})
            </h2>
            <ul className="mt-2 space-y-2 text-sm">
              {rules.map((r) => (
                <li key={r.id}>
                  <p>{r.message}</p>
                  <p className="muted text-xs">
                    <code className="font-mono">{r.id}</code> · {r.severity} · unknown →{' '}
                    {r.on_unknown}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <aside aria-label="Selection and evidence" className="grid content-start gap-4">
          <div className="card grid gap-2 p-4">
            {item.tags?.includes('synthetic') ? <SyntheticBadge /> : null}
            <p className="text-sm">
              Status: <strong>{item.status}</strong> · version{' '}
              <code className="font-mono">{item.version}</code>
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={add}
              disabled={!draft || (isSelected && def.cardinality === 'one')}
            >
              {isSelected
                ? 'In your stack'
                : current
                  ? `Replace current ${labelInSentence(label)}`
                  : `Add to stack (${def.tier} · ${label})`}
            </button>
            <Link
              className="link text-sm"
              to={`/compare?ids=${[item, ...siblings.slice(0, 1)].map((i) => idToSlug(i.id)).join(',')}`}
            >
              Compare with another {labelInSentence(label)}
            </Link>
            <Link className="link text-sm" to={kindPath(item.kind)}>
              All {labelInSentence(label)} records
            </Link>
          </div>
          <div className="card p-4 text-sm">
            <h2 className="font-semibold">Cost context</h2>
            <p className="mt-1">Billing: {BILLING_LABELS[item.billing_class]}</p>
            {rates.length ? (
              <ul className="mt-2 space-y-1">
                {rates.map((r) => {
                  const expired = Boolean(r.valid_until && r.valid_until < now);
                  return (
                    <li key={r.id} className="tabular">
                      {formatMoney(r.unit_price.amount, r.unit_price.currency)} per{' '}
                      {r.meter.replace(/_/g, ' ')}
                      {r.region ? ` (${r.region})` : ''} — {r.price_type},{' '}
                      {r.provenance.verification_status}
                      {expired ? (
                        <strong className="ml-1 text-amber-900 dark:text-amber-200">expired</strong>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted mt-1">
                {item.billing_class === 'metered'
                  ? 'No rate in the pricebook — cost is unknown.'
                  : 'No metered rates.'}
              </p>
            )}
            {rates.some((r) => r.provenance.notes?.includes('SYNTHETIC')) ? (
              <p className="mt-2 text-xs font-semibold text-violet-800 dark:text-violet-300">
                Synthetic demo prices — not real quotes.
              </p>
            ) : null}
          </div>
          <div className="card p-4 text-sm">
            <h2 className="font-semibold">Evidence &amp; provenance</h2>
            {ev.data ? (
              <>
                <p className="mt-1">
                  Recorded provenance status: <strong>{ev.data.verification}</strong>
                </p>
                <p>
                  {evidenceDateLabel(ev.data.freshness)}. This date does not establish currentness
                  or independent verification.
                </p>
                <p className="mt-1 text-xs">
                  Historical verified labels may record source checks only. Independent verification
                  requires linked reproduction or corroboration; the recorded status alone is not
                  proof.
                </p>
                <ul className="mt-2 space-y-1 text-xs">
                  {ev.data.provenance.map((p, i) => (
                    <li key={i}>
                      {p.source_uri ? (
                        <a className="link" href={p.source_uri} rel="noopener noreferrer">
                          Source
                        </a>
                      ) : (
                        <span>No source URL recorded</span>
                      )}{' '}
                      · {p.verification_status}
                      {p.notes ? <span className="muted block">{p.notes}</span> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Loading />
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
