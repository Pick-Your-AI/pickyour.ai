/*
 * Provider interfaces. The presentation layer depends only on these; implementations are selected
 * by configuration (VITE_DATA_MODE=fixture|http). Every payload crossing these interfaces is a
 * contract type and is validated against its JSON Schema by the implementation.
 */
import type {
  BuildSnapshot,
  CatalogItem,
  CatalogSnapshot,
  ComponentKind,
  CostEstimate,
  DependencyGraph,
  EvaluationReport,
  Pricebook,
  Provenance,
  ResourceEstimate,
  Ruleset,
} from '../contracts';
import type { EvidenceDate } from '../domain/freshness';

export interface CatalogRepository {
  /** The current (or a specific) immutable catalog snapshot. */
  getSnapshot(snapshotId?: string): Promise<CatalogSnapshot>;
  listItems(kind?: ComponentKind): Promise<CatalogItem[]>;
  getItem(id: string): Promise<CatalogItem>;
  getDependencyGraph(): Promise<DependencyGraph>;
  getRuleset(): Promise<Ruleset>;
}

export interface SavedBuildSummary {
  id: string;
  name: string;
  revision: number;
  updatedAt: string;
  selectionCount: number;
}

export interface BuildRepository {
  list(): Promise<SavedBuildSummary[]>;
  /** Returns the head revision and the retained revision history (oldest first). */
  get(buildId: string): Promise<StoredBuild>;
  /**
   * Saves a new head. `expectedRevision` is the revision the caller started from (compare-and-swap);
   * a mismatch rejects with DataError('conflict') and never overwrites the other change.
   */
  save(build: StoredBuild, expectedRevision: number | null): Promise<StoredBuild>;
  remove(buildId: string): Promise<void>;
}

export interface StoredBuild {
  build: BuildSnapshot;
  revisions: BuildSnapshot[];
  changes: { revision: number; at: string; summary: string; changedKinds: ComponentKind[] }[];
}

export type CompatibilityVerdict = 'compatible' | 'incompatible' | 'unknown';

export interface CompatibleOption {
  catalog_item_id: string;
  catalog_item_version: string;
  verdict: CompatibilityVerdict;
  rule_ids: string[];
}

export interface EvaluationEvidence {
  resourceEstimate?: ResourceEstimate | null;
  costEstimate?: CostEstimate | null;
}

export interface CompatibilityEvaluator {
  evaluate(build: BuildSnapshot, evidence?: EvaluationEvidence): Promise<EvaluationReport>;
  /** Explainable status of each catalog alternative for a kind/role; never mutates the build. */
  compatibleOptions(
    build: BuildSnapshot,
    kind: ComponentKind,
    role?: string,
    evidence?: EvaluationEvidence,
  ): Promise<CompatibleOption[]>;
}

export interface PricingProvider {
  getPricebook(pricebookId?: string): Promise<Pricebook>;
  estimate(build: BuildSnapshot, periodDays?: number): Promise<CostEstimate>;
}

export type ResourceEstimateResult =
  { status: 'available'; estimate: ResourceEstimate } | { status: 'unavailable'; reason: string };

export interface ResourceEstimateProvider {
  estimate(build: BuildSnapshot): Promise<ResourceEstimateResult>;
}

export interface ItemEvidence {
  itemId: string;
  itemVersion: string;
  provenance: Provenance[];
  /** Strongest verification status recorded for the item. */
  verification: Provenance['verification_status'];
  freshness: EvidenceDate;
  synthetic: boolean;
}

export interface EvidenceProvider {
  forItem(item: CatalogItem): Promise<ItemEvidence>;
}

export interface DataProviders {
  mode: 'fixture' | 'http';
  catalog: CatalogRepository;
  builds: BuildRepository;
  compatibility: CompatibilityEvaluator;
  pricing: PricingProvider;
  evidence: EvidenceProvider;
  resources: ResourceEstimateProvider;
}
