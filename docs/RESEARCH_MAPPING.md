# Research → website mapping and traceability

Discovery performed 2026-10-16 against `Pick-Your-AI/pick-your-ai-research` `main` @ `d4bdca4`, Projects #1 (AI Builder Research, 37 items) and #2 (Market Research, 20 items), all research PRs (open and closed) and the market-research branch `research/market-intelligence` @ `6511dea`.

## Source-of-truth status

| Source                                                                            | Status                    | How the website uses it                                                                                                                           |
| --------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contracts/v1/**` (AI Builder contract 1.0.0, PR #44)                             | **Merged, authoritative** | Vendored verbatim at `contracts/v1`, pinned by SHA (`contracts/PROVENANCE.json`); types, validators, ruleset, graph and registry all come from it |
| Governance and vision docs (PRs #43, #45)                                         | Merged                    | Positioning, optional T3–T5, triage conventions                                                                                                   |
| Research decision records for T0–T6 (PRs #68–#77)                                 | **Open — provisional**    | Not consumed. Listed below as pending inputs                                                                                                      |
| Market research (PR #67, branch only; PR #79 merged into that branch, not `main`) | **Open — provisional**    | Informs positioning, terminology, trust design only                                                                                               |
| PCPartPicker UX analysis (`docs/research/pcpartpicker-ux-notes.md`, this repo)    | Design reference          | Interaction patterns (ADOPT/ADAPT/AVOID)                                                                                                          |

No research decision record has been merged to `main`; all 55 research issues are open. Every catalog record, price and capacity figure on the site is therefore **synthetic** and labelled as such.

## Architecture map (requirement → website capability)

| Research area                              | Issues                   | Website capability                                                                                                                                               | Code                                                                     |
| ------------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Workload & deployment mode → onboarding    | #1, #2, #3               | T0 rows; mode drives registry activation (needed / not needed / depends on mode); objectives form                                                                | `src/domain/activation.ts`, `src/features/builder/*`                     |
| Models / providers → selection             | #4–#7                    | T1 rows, selection page with facets (modalities, context, access modes, formats), detail pages                                                                   | `src/features/catalog/*`                                                 |
| GPU, hosting, inference → requirements     | #8–#11                   | T2 rows; VRAM/backend/precision/tensor-parallel rules; capacity evidence via `ResourceEstimateProvider` (none connected → **Unknown**)                           | `src/data/types.ts`, `src/domain/evaluator.ts`                           |
| Knowledge & retrieval (optional)           | #12–#16                  | Optional T3 section, collapsible; keyword RAG needs no vector DB                                                                                                 | `BuilderTable.tsx`                                                       |
| Agents & MCP (optional)                    | #24–#28                  | Optional T4 section; mutating-tool guardrail rule                                                                                                                | —                                                                        |
| Training (optional)                        | #29–#33                  | Optional T5 section; lineage rules                                                                                                                               | —                                                                        |
| Operations → summary & deployment planning | #34–#38                  | T6 rows; readiness shown as `needs_review`/`blocked`, never “ready” from compatibility alone                                                                     | `SummaryPanel.tsx`, `BuildSummaryPage.tsx`                               |
| Schema & rules                             | **#40**                  | Generated types/validators; TypeScript port of `reference/evaluate.py` with parity tests; outcomes `pass/fail/unknown/skipped` × severities `info/warning/error` | `src/contracts/*`, `src/domain/evaluator.ts`                             |
| Catalog sources & freshness                | **#41**                  | `CatalogRepository`, provenance/evidence panel, 30-day preview staleness window (provisional), version-drift detection                                           | `src/domain/freshness.ts`, `src/data/shared.ts`                          |
| Saved / shared / compared builds           | **#42** (blocked by #40) | Revisioned `BuildSnapshot` drafts in `localStorage`, CAS saves, export/import, share-by-fragment, compare builds/revisions                                       | `src/domain/build.ts`, `src/domain/share.ts`, `src/data/local-builds.ts` |
| Cost estimate                              | **#39**                  | `PricingProvider`; decimal-string arithmetic; coverage complete/partial/unknown; unknown billing ≠ 0; no FX conversion; preview estimator (provisional)          | `src/domain/cost.ts`                                                     |
| Market: positioning, personas, trust       | #47–#66                  | Copy and design hypotheses below                                                                                                                                 | `src/pages/HomePage.tsx`, `MethodologyPage.tsx`                          |

## Market research → design decisions (all provisional)

- **Positioning.** The market already offers model lists and hardware-fit tools (MR-01/02/03). The draft synthesis (#47) recommends “a bounded decision workflow with evidence, uncertainty and a shareable configuration record”. The site therefore leads with **traceable compatibility, explicit unknowns and a shareable record**, not catalogue size. In line with #57, we do not market completeness we have not measured.
- **Personas** (#52, desk hypotheses only). The UI serves AI application developers and infrastructure engineers first: dense tables, settings, rule ids. Beginners get need badges, a next-action hint and starter stacks.
- **Terminology.** We use “stack”/“build”, “evidence”, “provenance” and “Unknown”, never “compatible” for missing data. “Hard incompatibility” (Fail) is kept separate from “missing evidence” (Unknown), as #51 hypothesis 3 suggests.
- **Trust.** Every synthetic item and price is labelled. Totals show “≥ $X + unpriced” when coverage is incomplete. Sources and freshness appear on detail pages. There are no affiliate links, ratings or vote counts.
- **Pivot watch.** If MR validation (#63, #66) narrows the product to a local-versus-API decision tool, the same contract, data layer and builder can host a reduced T0–T2 flow. Nothing here assumes the full T0–T6 surface ships at once.

## Traceability matrix

| Research issue   | Requirement (summary)                                   | Website feature                                                          | Tests                                                                                                  |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| #40              | Canonical kinds, outcome × severity, three-valued rules | Registry-driven rows, `OutcomeBadge`/`SeverityLabel`, evaluator          | `contracts.test.ts`, `evaluator-parity.test.ts` (vs `evaluate.py`), e2e builder flow                   |
| #40              | Bidirectional invalidation over the graph               | `affectedByChange`, invalidation notice, re-checked chips                | `scenarios.test.ts` › cross-tier invalidation                                                          |
| #40              | Unknown ≠ pass; applies_when unknown → unknown          | Separate Unknown bucket, strip never green with unknowns                 | `scenarios.test.ts` › unknown compatibility; e2e selection buckets                                     |
| #41              | Provenance, freshness, version pinning                  | Recorded evidence dates, provenance caveats, version drift detection     | `evidence-dates.test.ts`; `scenarios.test.ts` › catalog evidence dates and version matching            |
| #42              | Build record, revisions, sharing, comparison            | Draft history, CAS save, export/import, `/shared`, `/compare?revisions=` | `scenarios.test.ts` › revisions, import/export; `providers.test.ts` › local repo; e2e share round trip |
| #39              | Cost lines, coverage, unknown ≠ 0, currency             | Cost headline/breakdown, synthetic labels                                | `scenarios.test.ts` › missing prices                                                                   |
| #2, #3           | Workload and mode drive activation                      | Need badges, coverage                                                    | `scenarios.test.ts` › optional workstreams                                                             |
| #10, #11         | GPU/engine compatibility, capacity evidence             | VRAM rules Unknown without calibrated evidence                           | `scenarios.test.ts` › unknown compatibility                                                            |
| #12, #24, #29    | T3–T5 optional and cleanly omittable                    | Collapsed optional tiers; API chat valid without them                    | `scenarios.test.ts` › optional workstreams                                                             |
| #14, #15         | Embedding ↔ index dimension                             | Default settings, RAG mismatch fails                                     | `scenarios.test.ts` › contradictory selections                                                         |
| #35              | Mutating tools need guardrails                          | Rule shown in findings                                                   | parity scenarios                                                                                       |
| — (API contract) | Malformed / failed responses                            | `DataError` states in UI                                                 | `providers.test.ts`                                                                                    |
| — (WCAG 2.2 AA)  | Accessibility                                           | Every route                                                              | e2e axe on desktop + mobile                                                                            |

## Pending research inputs (unmerged, provisional)

- **PR #75 (T2)** adds 16 catalog items, a pricebook and estimator v0.2.0. When it merges it becomes a candidate real catalog, pricebook and capacity estimator (see `DATA_INTEGRATION.md`).
- **PRs #69–#73 (T4).** PR #72 reports that baseline `rule.memory.framework.compatibility` blocks every real framework because `supports_memory` is undefined. The fix belongs to the contract (#40), not the site.
- **PRs #68, #76, #77 (T5)** propose new `methods` values, evidence references in place of booleans, and new training meters. These are contract changes through #40, so the site needs a regenerate step only.
- **PR #70** proposes a four-class tool-risk model (contract change).
- **Kind display names.** No research document defines display labels. The site uses the master prompt's labels in `src/contracts/labels.ts`, which are display-only. Proposing official labels in the registry via #40 would remove this gap.
