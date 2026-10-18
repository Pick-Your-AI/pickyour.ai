import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { DataContext } from '../../src/app/data-context';
import { BASELINE_RULESET } from '../../src/contracts';
import { createFixtureProviders } from '../../src/data/fixture/providers';
import { evaluateBuild } from '../../src/domain/evaluator';
import { OverallStrip } from '../../src/features/builder/SummaryPanel';
import { FindingsList } from '../../src/features/builder/FindingsList';
import { buildWith, BY_ID, CATALOG, contradictory } from './scenarios';

function show(build = buildWith([]), current = true) {
  const report = evaluateBuild({ build, catalog: CATALOG, ruleset: BASELINE_RULESET });
  const client = new QueryClient();
  client.setQueryData(['catalog', 'ruleset'], BASELINE_RULESET);
  render(
    <QueryClientProvider client={client}>
      <DataContext.Provider value={createFixtureProviders()}>
        <OverallStrip build={build} report={report} current={current} />
        <FindingsList build={build} report={report} byId={BY_ID} />
      </DataContext.Provider>
    </QueryClientProvider>,
  );
}

describe('incomplete build wording', () => {
  it('shows provisional completion guidance while retaining the raw failure', () => {
    show();
    expect(screen.getByTestId('overall-status')).toHaveTextContent('Incomplete');
    expect(screen.getByTestId('overall-status')).toHaveTextContent('0 of 4 required choices made');
    expect(screen.getByTestId('overall-status')).toHaveTextContent('Provisional inference');
    expect(screen.getByTestId('overall-status')).toHaveTextContent('Choose workload');
    expect(screen.getByText('Fail')).toBeInTheDocument();
  });
  it('retains Incompatible for real conflicts', () => {
    show(contradictory());
    expect(screen.getByTestId('overall-status')).toHaveTextContent('Incompatible');
    expect(screen.getByTestId('overall-status')).not.toHaveTextContent('Incomplete');
  });
  it('does not infer incomplete from a stale report', () => {
    show(buildWith([]), false);
    expect(screen.getByTestId('overall-status')).not.toHaveTextContent('Incomplete');
    expect(screen.getByTestId('overall-status')).toHaveTextContent('Showing revision');
  });
});
