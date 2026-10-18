/*
 * Shared build (read-only preview). The build travels in the URL fragment (#b1.…), which browsers
 * never send to the server, or comes from a local export file. Previewing never touches the
 * viewer's drafts; only "Import to my builds" creates a new local build.
 */
import { useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import type { BuildSnapshot } from '../contracts';
import { KIND_LABELS, TIERS, TIER_LABELS, kindsInTier } from '../contracts';
import { buildStaleness } from '../domain/freshness';
import { useValidatorsReady } from '../app/validators';
import { decodeShareFragment, importBuild, type ImportResult } from '../domain/share';
import { useBuilder } from '../app/builder-context';
import { useData } from '../app/data-context';
import { useBuildAnalysis, useCatalog } from '../app/queries';
import { itemPath } from '../lib/catalog-view';
import { humanize } from '../lib/schema-fields';
import { EmptyState, ErrorState, Loading, Notice } from '../components/feedback';
import { IconQuestion, IconUpload } from '../components/icons';
import { PageHeader } from '../components/layout';
import { SyntheticBadge } from '../components/status';
import { FindingsList } from '../features/builder/FindingsList';
import { costHeadline } from '../features/builder/analysis';
import { OverallStrip } from '../features/builder/SummaryPanel';

const PREVIEW_NOTE = 'Shared builds are previews; there is no server-side sharing yet.';

export default function SharedBuildPage() {
  const location = useLocation();
  const { mode } = useData();
  const validatorsLoaded = useValidatorsReady();
  const [file, setFile] = useState<{ name: string; result: ImportResult } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fromLink = useMemo(
    () => (location.hash && validatorsLoaded ? decodeShareFragment(location.hash, mode) : null),
    [location.hash, mode, validatorsLoaded],
  );
  const active = file?.result ?? fromLink;
  const build = active?.ok ? active.build : null;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const result = importBuild(await f.text(), mode);
    if (result.ok) {
      setFileError(null);
      setFile({ name: f.name, result });
    } else {
      setFileError(`Could not preview ${f.name}: ${result.error}`);
    }
  };

  const filePicker = (
    <>
      <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
        <IconUpload /> Preview an exported file
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </>
  );

  if (location.hash && !validatorsLoaded && !file) {
    return (
      <div className="mx-auto max-w-7xl px-4">
        <Loading label="Opening shared build…" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Shared build · read-only preview"
        title={build ? build.name : 'Shared build'}
      >
        {PREVIEW_NOTE} Viewing a shared build never changes your own builds.
      </PageHeader>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6">
        {fileError ? (
          <p role="alert" className="text-sm text-red-800 dark:text-red-300">
            {fileError}
          </p>
        ) : null}
        {file ? (
          <div className="flex flex-wrap items-center gap-2 text-sm" role="status">
            <span>
              Previewing file <strong className="break-all">{file.name}</strong> — not saved.
            </span>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setFile(null)}>
              Close file preview
            </button>
          </div>
        ) : null}
        {build && active?.ok ? (
          <SharedPreview build={build} warnings={active.warnings} filePicker={filePicker} />
        ) : (
          <>
            {active && !active.ok ? (
              <div
                role="alert"
                className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-950 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
              >
                <p className="font-semibold">This shared build cannot be opened</p>
                <p className="mt-1 text-sm break-words">{active.error}</p>
              </div>
            ) : null}
            <EmptyState
              title={active ? 'Try another link or a file' : 'No shared build in this link'}
              action={filePicker}
            >
              <p>
                A share link carries a whole build after the <code className="font-mono">#</code> in
                the address, so it is never uploaded. Create one with &ldquo;Copy share link&rdquo;
                in the{' '}
                <Link className="link" to="/builder">
                  builder
                </Link>
                .
              </p>
              <p className="mt-2">
                You can also preview an exported <code className="font-mono">.json</code> file here
                without saving it, or import it from{' '}
                <Link className="link" to="/builds">
                  My Builds
                </Link>
                .
              </p>
            </EmptyState>
          </>
        )}
      </div>
    </>
  );
}

function SharedPreview({
  build,
  warnings,
  filePicker,
}: {
  build: BuildSnapshot;
  warnings: string[];
  filePicker: React.ReactNode;
}) {
  const catalog = useCatalog();
  const analysis = useBuildAnalysis(build);
  const { startNew } = useBuilder();
  const { mode } = useData();
  const navigate = useNavigate();

  if (catalog.isError)
    return <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />;
  if (!catalog.data) return <Loading label="Loading catalog…" />;

  const byId = catalog.byId;
  const staleness = buildStaleness(build, catalog.data);
  const unresolved = build.selections.filter((s) => !byId.has(s.catalog_item_id)).length;
  const headline = costHeadline(analysis.costIsCurrent ? analysis.cost : undefined);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            startNew(build, build.name);
            navigate('/builder');
          }}
        >
          Import to my builds
        </button>
        {filePicker}
        <p className="hint w-full">
          Importing creates a new build in this browser and opens it in the builder. The original
          link is unchanged.
        </p>
      </div>

      {warnings.length ? (
        <Notice tone="warning" title="Import warnings:">
          {warnings.join(' ')}
        </Notice>
      ) : null}
      {staleness.snapshotMismatch || staleness.driftedSelectionIds.length || unresolved ? (
        <Notice tone="warning" title="May not match this catalog.">
          {staleness.snapshotMismatch
            ? `This build is locked to catalog snapshot ${build.locks.catalog_snapshot_id}; this site has ${catalog.data.id}. `
            : ''}
          {unresolved
            ? `${unresolved} selection${unresolved === 1 ? ' is' : 's are'} not in this catalog. `
            : ''}
          {staleness.driftedSelectionIds.length
            ? `${staleness.driftedSelectionIds.length} selection(s) are pinned to a different catalog version. `
            : ''}
          Results below are evaluated against this site&apos;s catalog and may differ from what the
          author saw.
        </Notice>
      ) : null}
      {staleness.catalog.state === 'stale' ? (
        <Notice tone="warning">
          Catalog evidence is {staleness.catalog.ageDays} days old (stale).
        </Notice>
      ) : null}

      <section aria-labelledby="shared-meta-heading" className="card p-4">
        <h2 id="shared-meta-heading" className="text-lg font-semibold">
          About this build
        </h2>
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="font-medium">Revision</dt>
          <dd className="tabular">{build.revision}</dd>
          <dt className="font-medium">Last updated</dt>
          <dd>
            <time dateTime={build.updated_at}>{new Date(build.updated_at).toLocaleString()}</time>
          </dd>
          <dt className="font-medium">Lifecycle</dt>
          <dd>{humanize(build.lifecycle)}</dd>
          <dt className="font-medium">Region</dt>
          <dd>{build.objectives.region}</dd>
          <dt className="font-medium">Data classification</dt>
          <dd>{humanize(build.objectives.data_classification)}</dd>
        </dl>
      </section>

      <OverallStrip build={build} report={analysis.report} current={analysis.reportIsCurrent} />
      {analysis.evaluation.isError ? (
        <ErrorState
          error={analysis.evaluation.error}
          onRetry={() => void analysis.evaluation.refetch()}
        />
      ) : null}

      <section aria-labelledby="shared-sel-heading" className="card min-w-0 p-4">
        <h2 id="shared-sel-heading" className="text-lg font-semibold">
          Selections ({build.selections.length})
        </h2>
        {TIERS.map((tier) => {
          const rows = kindsInTier(tier).flatMap((k) =>
            build.selections.filter((s) => s.kind === k.kind),
          );
          if (!rows.length) return null;
          return (
            <div key={tier} className="mt-4">
              <h3 className="font-semibold">
                {tier} — {TIER_LABELS[tier]}
              </h3>
              <ul className="mt-1 grid gap-1 text-sm">
                {rows.map((s) => {
                  const item = byId.get(s.catalog_item_id);
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{KIND_LABELS[s.kind]}:</span>
                      {item ? (
                        <>
                          <Link className="link" to={itemPath(item)}>
                            {item.name}
                          </Link>
                          {(item.tags ?? []).includes('synthetic') ? <SyntheticBadge /> : null}
                        </>
                      ) : (
                        <>
                          <span className="font-mono text-xs break-all">{s.catalog_item_id}</span>
                          <span className="inline-flex items-center gap-1 rounded border border-amber-400 px-1.5 text-xs font-semibold text-amber-900 dark:border-amber-600 dark:text-amber-200">
                            <IconQuestion /> Not in this catalog
                          </span>
                        </>
                      )}
                      {s.role !== 'primary' ? (
                        <span className="muted text-xs">({s.role})</span>
                      ) : null}
                      {!s.enabled ? <span className="muted text-xs">(disabled)</span> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      <section
        aria-labelledby="shared-cost-heading"
        className="card p-4"
        aria-busy={!analysis.costIsCurrent}
      >
        <h2 id="shared-cost-heading" className="text-lg font-semibold">
          Estimated cost
        </h2>
        {analysis.costQuery.isError ? (
          <ErrorState
            title="Cost estimate unavailable"
            error={analysis.costQuery.error}
            onRetry={() => void analysis.costQuery.refetch()}
          />
        ) : (
          <>
            <p className="mt-1 text-base font-semibold tabular">{headline.text}</p>
            <p className="muted text-sm">{headline.detail}</p>
            {mode === 'fixture' ? (
              <p className="mt-1 text-xs font-semibold text-violet-800 dark:text-violet-300">
                Synthetic demo prices — not a quote.
              </p>
            ) : null}
          </>
        )}
      </section>

      {analysis.reportIsCurrent ? (
        <FindingsList report={analysis.report} build={build} byId={byId} />
      ) : (
        <Loading label="Evaluating the shared build…" />
      )}
    </>
  );
}
