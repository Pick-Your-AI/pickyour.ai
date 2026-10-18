import { useRuleset } from '../../app/queries';
import { incompleteBuild, type IncompleteBuild } from './incomplete';
import { useState } from 'react';
import { Link } from 'react-router';
import type {
  BuildSnapshot,
  CatalogItem,
  ComponentKind,
  EvaluationReport,
  Selection,
  Tier,
} from '../../contracts';
import {
  KIND_LABELS,
  TIERS,
  TIER_LABELS,
  TIER_SUMMARIES,
  kindDef,
  kindsInTier,
  labelInSentence,
  withArticle,
} from '../../contracts';
import { type DeploymentModeValue, KIND_NEED_LABEL, kindNeed } from '../../domain/activation';
import { removeSelection, setEnabled, updateSettings } from '../../domain/build';
import { useBuilder } from '../../app/builder-context';
import { IconGear, IconPlus, IconSwap, IconTrash } from '../../components/icons';
import { OutcomeBadge, SyntheticBadge } from '../../components/status';
import { itemPath, itemSummary, kindPath } from '../../lib/catalog-view';
import { selectionOutcome } from './analysis';
import { SettingsForm } from './SettingsForm';

const OPTIONAL_TIERS: Tier[] = ['T3', 'T4', 'T5'];

function NeedBadge({ kind, mode }: { kind: ComponentKind; mode: DeploymentModeValue | undefined }) {
  const need = kindNeed(kind, mode);
  const cls =
    need === 'needed'
      ? 'border-brand-300 text-brand-900 dark:border-brand-700 dark:text-brand-200'
      : need === 'depends_on_mode'
        ? 'border-amber-300 text-amber-900 dark:border-amber-700 dark:text-amber-200'
        : 'border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-300';
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {KIND_NEED_LABEL[need]}
    </span>
  );
}

function SelectionRow({
  selection,
  item,
  report,
  reportIsCurrent,
  affected,
  incomplete,
}: {
  selection: Selection;
  item: CatalogItem | undefined;
  report: EvaluationReport | undefined;
  reportIsCurrent: boolean;
  affected: boolean;
  incomplete: IncompleteBuild;
}) {
  const { apply } = useBuilder();
  const [configuring, setConfiguring] = useState(false);
  const outcome = selectionOutcome(report, selection.id, incomplete?.ruleIds);
  const label = KIND_LABELS[selection.kind];
  const name = item?.name ?? selection.catalog_item_id;
  return (
    <div
      className={`rounded-md border p-3 ${selection.enabled ? 'border-slate-200 dark:border-slate-700' : 'border-dashed border-slate-300 opacity-80 dark:border-slate-600'}`}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            {item ? (
              <Link to={itemPath(item)} className="link">
                {name}
              </Link>
            ) : (
              <span className="font-medium">{name}</span>
            )}
            {(item?.tags ?? []).includes('synthetic') ? <SyntheticBadge /> : null}
            {selection.role !== 'primary' ? (
              <span className="muted text-xs">role: {selection.role}</span>
            ) : null}
            {!selection.enabled ? (
              <span className="muted text-xs">(disabled — excluded from checks)</span>
            ) : null}
          </p>
          {item ? (
            <p className="muted mt-0.5 text-sm">{itemSummary(item)}</p>
          ) : (
            <p className="text-sm text-red-800 dark:text-red-300">
              Catalog item not found in this snapshot.
            </p>
          )}
          {item && item.version !== selection.catalog_item_version ? (
            <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
              Pinned version {selection.catalog_item_version} differs from catalog version{' '}
              {item.version}; facts are treated as unknown.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {affected ? (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900 dark:bg-sky-900 dark:text-sky-100">
              Re-checked after your last change
            </span>
          ) : null}
          {selection.enabled && outcome ? (
            reportIsCurrent ? (
              <OutcomeBadge outcome={outcome} />
            ) : (
              <span className="muted text-xs" role="status">
                Re-evaluating…
              </span>
            )
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary btn-sm"
          aria-expanded={configuring}
          onClick={() => setConfiguring((c) => !c)}
        >
          <IconGear /> Configure<span className="sr-only"> {name}</span>
        </button>
        <Link
          to={`${kindPath(selection.kind)}?replace=${encodeURIComponent(selection.id)}`}
          className="btn-secondary btn-sm"
        >
          <IconSwap /> Replace<span className="sr-only"> {name}</span>
        </Link>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() =>
            apply(
              (b) => setEnabled(b, selection.id, !selection.enabled),
              `${selection.enabled ? 'Disabled' : 'Enabled'} ${label}`,
              [selection.kind],
            )
          }
        >
          {selection.enabled ? 'Disable' : 'Enable'}
          <span className="sr-only"> {name}</span>
        </button>
        <button
          type="button"
          className="btn-danger btn-sm"
          onClick={() =>
            apply((b) => removeSelection(b, selection.id), `Removed ${label}: ${name}`, [
              selection.kind,
            ])
          }
        >
          <IconTrash /> Remove<span className="sr-only"> {name}</span>
        </button>
      </div>
      {configuring ? (
        <div className="mt-3 rounded-md bg-slate-50 p-3 dark:bg-slate-800/60">
          <SettingsForm
            kind={selection.kind}
            values={selection.settings as Record<string, unknown>}
            onCancel={() => setConfiguring(false)}
            onApply={(patch) => {
              apply((b) => updateSettings(b, selection.id, patch), `Changed ${label} settings`, [
                selection.kind,
              ]);
              setConfiguring(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function KindRow({
  kind,
  build,
  byId,
  mode,
  report,
  reportIsCurrent,
  affectedKinds,
  incomplete,
}: {
  kind: ComponentKind;
  build: BuildSnapshot;
  byId: ReadonlyMap<string, CatalogItem>;
  mode: DeploymentModeValue | undefined;
  report: EvaluationReport | undefined;
  reportIsCurrent: boolean;
  affectedKinds: ReadonlySet<ComponentKind>;
  incomplete: IncompleteBuild;
}) {
  const selections = build.selections.filter((s) => s.kind === kind);
  const def = kindDef(kind);
  const label = KIND_LABELS[kind];
  const need = kindNeed(kind, mode);
  return (
    <li
      className="grid gap-2 border-t border-slate-200 py-3 first:border-t-0 md:grid-cols-[14rem_1fr] dark:border-slate-800"
      data-kind={kind}
    >
      <div>
        <h3 className="font-semibold">{label}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <NeedBadge kind={kind} mode={mode} />
          <code className="muted font-mono text-[11px]">{kind}</code>
        </div>
        <p className="muted mt-1 text-xs">{def.notes}</p>
      </div>
      <div className="grid gap-2">
        {selections.map((s) => (
          <SelectionRow
            key={s.id}
            incomplete={incomplete}
            selection={s}
            item={byId.get(s.catalog_item_id)}
            report={report}
            reportIsCurrent={reportIsCurrent}
            affected={affectedKinds.has(kind)}
          />
        ))}
        {selections.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={kindPath(kind)}
              className={need === 'needed' ? 'btn-primary' : 'btn-secondary'}
            >
              <IconPlus /> Choose {withArticle(label)}
            </Link>
            {need === 'not_needed' ? (
              <span className="muted text-sm">Not needed in this deployment mode.</span>
            ) : null}
            {need === 'optional' ? (
              <span className="muted text-sm">
                Optional — leave empty if your workload does not need it.
              </span>
            ) : null}
          </div>
        ) : def.cardinality === 'many' ? (
          <Link to={`${kindPath(kind)}?add=1`} className="link text-sm">
            + Add another {labelInSentence(label)}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export function BuilderTable({
  build,
  byId,
  mode,
  report,
  reportIsCurrent,
  affectedKinds,
}: {
  build: BuildSnapshot;
  byId: ReadonlyMap<string, CatalogItem>;
  mode: DeploymentModeValue | undefined;
  report: EvaluationReport | undefined;
  reportIsCurrent: boolean;
  affectedKinds: ReadonlySet<ComponentKind>;
}) {
  const ruleset = useRuleset();
  const incomplete = incompleteBuild(build, reportIsCurrent ? report : undefined, ruleset.data);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="grid gap-4">
      {TIERS.map((tier) => {
        const kinds = kindsInTier(tier);
        const selected = build.selections.filter((s) =>
          kinds.some((k) => k.kind === s.kind),
        ).length;
        const optional = OPTIONAL_TIERS.includes(tier);
        const open = !optional || selected > 0 || expanded[tier];
        const headingId = `tier-${tier}`;
        return (
          <section key={tier} aria-labelledby={headingId} className="card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={headingId} className="text-lg font-semibold">
                <span className="mr-2 rounded bg-brand-700 px-1.5 py-0.5 font-mono text-xs text-white dark:bg-brand-500 dark:text-slate-950">
                  {tier}
                </span>
                {TIER_LABELS[tier]}
              </h2>
              <span className="muted text-sm">
                {selected} selected{optional ? ' · optional workstream' : ''}
              </span>
            </div>
            <p className="muted mt-1 text-sm">{TIER_SUMMARIES[tier]}</p>
            {open ? (
              <ul className="mt-2">
                {kinds.map((k) => (
                  <KindRow
                    key={k.kind}
                    incomplete={incomplete}
                    kind={k.kind}
                    build={build}
                    byId={byId}
                    mode={mode}
                    report={report}
                    reportIsCurrent={reportIsCurrent}
                    affectedKinds={affectedKinds}
                  />
                ))}
              </ul>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setExpanded((e) => ({ ...e, [tier]: true }))}
                  aria-controls={headingId}
                >
                  <IconPlus /> Add {TIER_LABELS[tier].toLowerCase()}
                </button>
                <span className="muted text-sm">
                  Not included. Builds are valid without this tier when the workload does not need
                  it.
                </span>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
