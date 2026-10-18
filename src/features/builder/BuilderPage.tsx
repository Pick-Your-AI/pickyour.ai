import { useEffect, useMemo, useRef, useState } from 'react';
import { KIND_LABELS } from '../../contracts';
import { buildContext, coverage as computeCoverage } from '../../domain/activation';
import { updateObjectives } from '../../domain/build';
import { useBuilder } from '../../app/builder-context';
import { useBuildAnalysis, useCatalog } from '../../app/queries';
import { ErrorState, Loading } from '../../components/feedback';
import { PageHeader } from '../../components/layout';
import emptyArt from '../../assets/images/builder-empty-480.webp';
import { BuilderTable } from './BuilderTable';
import { BuildToolbar } from './BuildToolbar';
import { FindingsList } from './FindingsList';
import { ObjectivesForm } from './ObjectivesForm';
import { OverallStrip, SummaryPanel } from './SummaryPanel';

/** Announces compatibility changes to screen readers after each revision is evaluated. */
function useAnnouncement(
  revision: number | undefined,
  summary: { failed: number; unknown: number } | undefined,
  current: boolean,
) {
  const [text, setText] = useState('');
  const last = useRef<string>('');
  useEffect(() => {
    if (!current || !summary || revision === undefined) return;
    const next = `Revision ${revision} evaluated: ${summary.failed} failing, ${summary.unknown} unknown.`;
    if (next !== last.current) {
      last.current = next;
      setText(next);
    }
  }, [revision, summary, current]);
  return text;
}

export default function BuilderPage() {
  const { draft, ready, lastChange, apply } = useBuilder();
  const catalog = useCatalog();
  const build = draft?.build;
  const analysis = useBuildAnalysis(build);
  const ctx = useMemo(
    () => (build ? buildContext(build, catalog.byId) : undefined),
    [build, catalog.byId],
  );
  const cov = useMemo(() => (build && ctx ? computeCoverage(build, ctx) : undefined), [build, ctx]);
  const announcement = useAnnouncement(
    analysis.report?.build_revision,
    analysis.report?.summary,
    analysis.reportIsCurrent,
  );
  const affected = useMemo(
    () =>
      new Set(
        lastChange && lastChange.revision === build?.revision
          ? [...lastChange.affectedKinds, ...lastChange.changedKinds]
          : [],
      ),
    [lastChange, build?.revision],
  );

  if (catalog.isError)
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
      </div>
    );
  if (!ready || !build || !catalog.data || !ctx || !cov)
    return (
      <div className="mx-auto max-w-7xl px-4">
        <Loading label="Loading builder…" />
      </div>
    );

  return (
    <>
      <PageHeader eyebrow="AI Stack Builder" title={build.name}>
        Pick components tier by tier. Every change creates a new revision and re-runs the published
        compatibility rules across all tiers.
      </PageHeader>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid min-w-0 gap-4">
          <SummaryPanel
            variant="mobile"
            build={build}
            byId={catalog.byId}
            snapshot={catalog.data}
            coverage={cov}
            report={analysis.report}
            reportIsCurrent={analysis.reportIsCurrent}
            cost={analysis.cost}
            costIsCurrent={analysis.costIsCurrent}
            resources={analysis.resources}
          />
          <div className="card p-4">
            <BuildToolbar key={build.id} build={build} byId={catalog.byId} />
          </div>
          <OverallStrip build={build} report={analysis.report} current={analysis.reportIsCurrent} />
          <p className="sr-only" aria-live="polite" role="status">
            {announcement}
          </p>
          {lastChange &&
          lastChange.revision === build.revision &&
          lastChange.affectedKinds.length ? (
            <div className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100">
              <strong>{lastChange.summary}.</strong> Through the dependency graph this re-checks:{' '}
              {lastChange.affectedKinds.map((k) => KIND_LABELS[k]).join(', ')}. Earlier evaluations,
              estimates and quotes for this build are now stale.
            </div>
          ) : null}
          {analysis.evaluation.isError ? (
            <ErrorState
              error={analysis.evaluation.error}
              onRetry={() => void analysis.evaluation.refetch()}
            />
          ) : null}
          {analysis.costQuery.isError ? (
            <ErrorState
              title="Cost estimate unavailable"
              error={analysis.costQuery.error}
              onRetry={() => void analysis.costQuery.refetch()}
            />
          ) : null}
          {build.selections.length === 0 ? (
            <div className="card flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
              <img src={emptyArt} alt="" width={160} height={145} className="h-auto w-40" />
              <div>
                <p className="text-lg font-semibold">Start your stack</p>
                <p className="muted mt-1 text-sm">
                  Begin with T0: what should the system do, and how will it be deployed? Optional
                  tiers (knowledge, agents, training) can be left out entirely.
                </p>
              </div>
            </div>
          ) : null}
          <details className="card p-4">
            <summary className="cursor-pointer font-semibold">Build objectives and policy</summary>
            <p className="muted mt-1 text-sm">
              Region, budget, usage and data classification are inputs to rules and cost estimates.
            </p>
            <div className="mt-3">
              <ObjectivesForm
                key={`${build.id}-${build.revision}`}
                build={build}
                onApply={(objectives, policy) =>
                  apply(
                    (b) => ({ ...updateObjectives(b, objectives), policy }),
                    'Updated build objectives',
                    ['workload', 'cost_policy', 'hosting_platform', 'deployment_target'],
                  )
                }
              />
            </div>
          </details>
          <BuilderTable
            build={build}
            byId={catalog.byId}
            mode={ctx.mode}
            report={analysis.report}
            reportIsCurrent={analysis.reportIsCurrent}
            affectedKinds={affected}
          />
          <FindingsList report={analysis.report} build={build} byId={catalog.byId} />
        </div>
        <SummaryPanel
          variant="aside"
          build={build}
          byId={catalog.byId}
          snapshot={catalog.data}
          coverage={cov}
          report={analysis.report}
          reportIsCurrent={analysis.reportIsCurrent}
          cost={analysis.cost}
          costIsCurrent={analysis.costIsCurrent}
          resources={analysis.resources}
        />
      </div>
    </>
  );
}
