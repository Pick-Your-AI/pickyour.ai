import { Link } from 'react-router';
import {
  BASELINE_GRAPH,
  BASELINE_RULESET,
  CONTRACT_PROVENANCE,
  KIND_LABELS,
  type ComponentKind,
} from '../contracts';
import { PageHeader } from '../components/layout';
import { OutcomeBadge, SeverityLabel } from '../components/status';
import { useData } from '../app/data-context';

const RESEARCH_REPO = 'https://github.com/Pick-Your-AI/pick-your-ai-research';
const issue = (n: number) => `${RESEARCH_REPO}/issues/${n}`;
const contractTree = `${RESEARCH_REPO}/tree/${CONTRACT_PROVENANCE.sourceSha}/contracts/v1`;

const kindLabel = (kind: string) => KIND_LABELS[kind as ComponentKind] ?? kind;

const ACTIVATION_LABELS: Record<string, string> = {
  always: 'Always',
  self_hosted: 'Self-hosted serving',
  non_api: 'Mode is not pure API',
  rag_enabled: 'RAG enabled',
  agents_enabled: 'Agents enabled',
  fine_tuning_enabled: 'Fine-tuning enabled',
  if_selected: 'If selected',
  production_only: 'Production target',
};

const ON_UNKNOWN_LABELS: Record<string, string> = {
  block: 'Block',
  review: 'Review',
  defer: 'Defer',
};

const SECTIONS = [
  { id: 'compatibility', label: 'Compatibility outcomes' },
  { id: 'invalidation', label: 'Change and invalidation' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'evidence', label: 'Evidence and freshness' },
  { id: 'data', label: 'Data and demo mode' },
  { id: 'rules', label: 'Published rules and dependencies' },
];

function IssueLink({ n }: { n: number }) {
  return (
    <a className="link" href={issue(n)}>
      research issue #{n}
    </a>
  );
}

function Compatibility() {
  return (
    <section aria-labelledby="compatibility">
      <h2 id="compatibility" className="scroll-mt-4">
        Compatibility outcomes
      </h2>
      <p>
        Each published rule produces one <strong>outcome</strong> for your build. Outcome and{' '}
        <strong>severity</strong> are separate: the outcome says what happened, the severity says
        how much it matters. Both are always shown with an icon and a word, never colour alone.
      </p>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
        <table className="data-table">
          <caption className="sr-only">Rule outcomes and what they mean</caption>
          <thead>
            <tr>
              <th scope="col">Outcome</th>
              <th scope="col">Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">
                <OutcomeBadge outcome="pass" />
              </th>
              <td>The rule applied and its check held for the current revision.</td>
            </tr>
            <tr>
              <th scope="row">
                <OutcomeBadge outcome="fail" />
              </th>
              <td>The rule applied and its check is proven false.</td>
            </tr>
            <tr>
              <th scope="row">
                <OutcomeBadge outcome="unknown" />
              </th>
              <td>
                The check could not be decided — a value, price or capacity estimate is missing.
                Unknown is never treated as compatible.
              </td>
            </tr>
            <tr>
              <th scope="row">
                <OutcomeBadge outcome="skipped" />
              </th>
              <td>
                The rule does not apply (its condition is proven false), for example GPU rules in an
                API-only stack. Skipped is not a statement of compatibility.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Severities: <SeverityLabel severity="error" /> blocks compatibility when it fails;{' '}
        <SeverityLabel severity="warning" /> needs review; <SeverityLabel severity="info" /> is
        advisory.
      </p>
      <h3>Three-valued logic</h3>
      <p>
        Rules combine checks with true (T), false (F) and unknown (U). A definite failure wins over
        missing information, and missing information is never promoted to a pass:
      </p>
      <ul>
        <li>
          <code>all(F, U) = F</code> and <code>all(T, U) = U</code>
        </li>
        <li>
          <code>any(T, U) = T</code> and <code>any(F, U) = U</code>
        </li>
        <li>
          <code>not(U) = U</code>
        </li>
        <li>
          If a rule&apos;s condition is unknown, the outcome is Unknown — never Skipped or Pass.
        </li>
      </ul>
      <h3>Compatibility is not deployment readiness</h3>
      <p>
        A build with no rule failures is only compatible <em>for that revision and evidence</em>.
        Deployment readiness also needs measured quality runs, a complete price quote, security
        review and human approvals. The site therefore reports readiness as <em>blocked</em> or{' '}
        <em>needs review</em> and never as <em>ready</em> from compatibility alone.
      </p>
    </section>
  );
}

function Invalidation() {
  return (
    <section aria-labelledby="invalidation">
      <h2 id="invalidation" className="scroll-mt-4">
        Change and invalidation
      </h2>
      <p>
        An AI stack is a constraint graph, not a linear wizard. The contract&apos;s dependency graph
        has <strong className="tabular">{BASELINE_GRAPH.edges.length}</strong> directed edges
        between component kinds (for example, a compute profile depends on the model). When you
        change a selection, the builder follows active edges in <strong>both directions</strong> —
        to what depends on the change and to what it depends on — and re-checks every affected rule.
      </p>
      <ul>
        <li>
          Each change creates a new, immutable revision. Earlier results, estimates and quotes are
          marked stale, not rewritten.
        </li>
        <li>
          Edges carry an <strong>activation condition</strong> (always, self-hosted, not pure API,
          RAG enabled, agents enabled, fine-tuning enabled, if selected, production only).
          Conditions are checked before and after the change, so a mode switch that turns a whole
          tier on or off is caught. If activation itself is unknown, the edge is treated as active.
        </li>
        <li>
          The builder never silently removes your selections or downgrades a model, context or
          hardware choice. It highlights what to revisit.
        </li>
      </ul>
    </section>
  );
}

function Pricing() {
  return (
    <section aria-labelledby="pricing">
      <h2 id="pricing" className="scroll-mt-4">
        Pricing
      </h2>
      <ul>
        <li>
          Amounts are decimal strings with a currency, for example{' '}
          <code>{'{ "amount": "12.50", "currency": "USD" }'}</code>. Line amounts are quantity ×
          unit price, computed without floating-point rounding.
        </li>
        <li>
          A component with <strong>unknown billing is not free</strong>. It stays unpriced and the
          estimate&apos;s coverage drops.
        </li>
        <li>
          Coverage is <strong>complete</strong> only when every billable selection has a current,
          applicable rate; otherwise it is <strong>partial</strong> or <strong>unknown</strong>. A
          budget check cannot pass on partial or stale coverage.
        </li>
        <li>No currency conversion is applied. Prices in different currencies are not summed.</li>
        <li>
          The in-browser estimator is a provisional preview; the authoritative pricing model is{' '}
          <IssueLink n={39} />. Every figure is an estimate, not a quote.
        </li>
      </ul>
    </section>
  );
}

function Evidence() {
  return (
    <section aria-labelledby="evidence">
      <h2 id="evidence" className="scroll-mt-4">
        Evidence and freshness
      </h2>
      <p>Every catalog fact carries provenance: when it was checked and a verification status.</p>
      <dl className="grid gap-2 sm:grid-cols-[auto_1fr] sm:gap-x-4">
        <dt className="font-mono text-sm">verified</dt>
        <dd>
          For new claims, supported by linked independent reproduction or corroboration. Historical
          verified labels may record source checks only; the label alone is not proof of independent
          verification.
        </dd>
        <dt className="font-mono text-sm">user_supplied</dt>
        <dd>Provided by a user or contributor and not independently checked.</dd>
        <dt className="font-mono text-sm">estimated</dt>
        <dd>Derived from a model or estimate rather than measured.</dd>
        <dt className="font-mono text-sm">unverified</dt>
        <dd>
          No independent verification recorded. This includes source-checked claims without
          independent support. All demo data is unverified.
        </dd>
      </dl>
      <p>
        Evidence dates describe when sources were checked or catalogs captured; they do not prove
        that facts are current or independently verified. Version-pinned facts do not expire with
        age. Current-state facts, such as prices and availability, retain their as-of dates. No
        time-to-live has been adopted by <IssueLink n={41} />; price-specific refresh policy remains
        open. A newer snapshot alone does not invalidate a pinned build.
      </p>
    </section>
  );
}

function DataSection() {
  const { mode } = useData();
  return (
    <section aria-labelledby="data">
      <h2 id="data" className="scroll-mt-4">
        Data and demo mode
      </h2>
      <p>
        The real catalog of AI components is still being researched. Until it is published, the site
        runs in <strong>demo mode</strong>: every component, price, benchmark and compatibility
        result is <strong>synthetic</strong> and exists only to demonstrate the builder. Demo items
        use invented names, are marked Synthetic, and must not be read as real products, quotes or
        measurements.
      </p>
      <p>
        The data source is chosen at build time with <code>VITE_DATA_MODE</code>:{' '}
        <code>fixture</code> (synthetic demo data bundled with the site) or <code>http</code> (a
        contract-conformant API).{' '}
        {mode === 'fixture' ? (
          <>
            This deployment uses <code>fixture</code>, so everything you see is demo data.
          </>
        ) : (
          <>
            This deployment uses <code>http</code>; check each item&apos;s provenance and
            verification status before relying on it.
          </>
        )}
      </p>
      <dl className="grid gap-2 sm:grid-cols-[auto_1fr] sm:gap-x-4">
        <dt className="font-semibold">Contract version</dt>
        <dd className="tabular">v{CONTRACT_PROVENANCE.contractVersion}</dd>
        <dt className="font-semibold">Contract source</dt>
        <dd className="min-w-0 break-all">
          <a className="link font-mono text-sm" href={contractTree}>
            contracts/v1 at {CONTRACT_PROVENANCE.sourceSha}
          </a>
        </dd>
      </dl>
    </section>
  );
}

function Rules() {
  const rules = BASELINE_RULESET.rules;
  const edges = BASELINE_GRAPH.edges;
  return (
    <section aria-labelledby="rules">
      <h2 id="rules" className="scroll-mt-4">
        Published rules and dependencies
      </h2>
      <p>
        These are the rules the builder applies: ruleset <code>{BASELINE_RULESET.id}</code> version{' '}
        <code>{BASELINE_RULESET.version}</code> ({rules.length} rules) and dependency graph{' '}
        <code>{BASELINE_GRAPH.id}</code> revision <code>{BASELINE_GRAPH.revision}</code>. They are
        proposals under research governance (<IssueLink n={40} />
        ). The website only interprets them; it does not add, change or remove rules.
      </p>
      <p>
        <em>On unknown</em> says what happens when a rule cannot be decided: <em>block</em> stops
        deployment until evidence exists.
      </p>
      <div
        className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        tabIndex={0}
        role="region"
        aria-label="Scrollable table"
      >
        <table className="data-table min-w-[48rem]">
          <caption className="mb-2 text-left text-sm font-semibold">
            Baseline compatibility rules ({rules.length})
          </caption>
          <thead>
            <tr>
              <th scope="col">Rule</th>
              <th scope="col">Severity</th>
              <th scope="col">On unknown</th>
              <th scope="col">Message</th>
              <th scope="col">Affected components</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <th scope="row" className="font-mono text-xs font-normal normal-case">
                  <span className="break-all">{r.id}</span>
                </th>
                <td>
                  <SeverityLabel severity={r.severity} />
                </td>
                <td>{ON_UNKNOWN_LABELS[r.on_unknown] ?? r.on_unknown}</td>
                <td>{r.message}</td>
                <td>{r.affected_kinds.map(kindLabel).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="card mt-4 p-4">
        <summary className="cursor-pointer font-semibold">
          Show all {edges.length} dependency edges
        </summary>
        <div
          className="-mx-4 mt-3 overflow-x-auto px-4"
          tabIndex={0}
          role="region"
          aria-label="Scrollable table"
        >
          <table className="data-table min-w-[48rem]">
            <caption className="mb-2 text-left text-sm font-semibold">
              Baseline dependency graph edges ({edges.length})
            </caption>
            <thead>
              <tr>
                <th scope="col">Dependent</th>
                <th scope="col">Depends on</th>
                <th scope="col">Relationship</th>
                <th scope="col">Activation</th>
                <th scope="col">Rationale</th>
              </tr>
            </thead>
            <tbody>
              {edges.map((e) => (
                <tr key={e.id}>
                  <th scope="row" className="font-normal normal-case">
                    {kindLabel(e.dependent_kind)}
                  </th>
                  <td>{kindLabel(e.depends_on_kind)}</td>
                  <td>{e.relationship}</td>
                  <td>{ACTIVATION_LABELS[e.activation] ?? e.activation}</td>
                  <td>{e.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export default function MethodologyPage() {
  return (
    <>
      <PageHeader eyebrow="Methodology" title="How PickYour.AI checks a stack">
        What the builder&apos;s results mean, where the rules come from, and what the preview can
        and cannot tell you.
      </PageHeader>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <nav aria-label="On this page" className="mb-8">
          <h2 className="text-sm font-semibold">On this page</h2>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a className="link" href={`#${s.id}`}>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="prose-doc">
          <Compatibility />
          <Invalidation />
          <Pricing />
          <Evidence />
          <DataSection />
        </div>
        <div className="prose-doc mt-4 max-w-none [&_p]:max-w-3xl">
          <Rules />
        </div>
        <p className="muted mt-10 text-sm">
          Questions or corrections? See the{' '}
          <Link className="link" to="/about">
            About page
          </Link>{' '}
          for how to contribute.
        </p>
      </div>
    </>
  );
}
