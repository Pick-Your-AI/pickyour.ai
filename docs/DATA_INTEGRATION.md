# Data integration: from research artifacts to production data

This explains how real research output replaces the synthetic fixtures without rewriting the UI.

## 1. The pipeline

```text
research PR merged on pick-your-ai-research main
   │  (catalog proposals, pricebooks, rules, estimator evidence — reviewed under #40/#41/#39)
   ▼
published, versioned artifacts
   CatalogSnapshot (catalog.<x>.<rev>)  Pricebook  Ruleset@version  DependencyGraph@rev  ResourceEstimate
   ▼
served by the contract API  (contracts/v1/api/openapi.yaml, base /v1)    ← or a static JSON host with the same paths
   ▼
website HTTP providers  (src/data/http/providers.ts)
   every response → JSON Schema validation (generated Ajv validators) → typed contract object
   malformed / failed → DataError(kind) → explicit UI error state, never silently used
   ▼
presentation layer (unchanged)
```

The website never edits research data. It reads published, immutable revisions and pins every build to them through `BuildSnapshot.locks` (`catalog_snapshot_id`, `ruleset_id@ruleset_version`, `dependency_graph_id@revision`, `pricebook_id`).

## 2. Provider interfaces (the seam)

`src/data/types.ts` defines everything the UI may use:

| Interface                  | Fixture implementation                                                                    | HTTP implementation (openapi)                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `CatalogRepository`        | `FixtureCatalogRepository`: demo catalog plus baseline graph and ruleset                  | `GET /catalog/snapshots/{id}`, `GET /dependencies/{id}`, `GET /rulesets/{id}?version=`                                            |
| `BuildRepository`          | `LocalBuildRepository`: `localStorage` with compare-and-swap                              | `POST /builds`, `GET /builds/{id}`, `PUT /builds/{id}` with `If-Match` and `Idempotency-Key` (opt-in via `VITE_BUILD_STORE=http`) |
| `CompatibilityEvaluator`   | `LocalCompatibilityEvaluator`: port of `reference/evaluate.py` over the published ruleset | `POST /builds/{id}/evaluate`, `GET /builds/{id}/compatible-options`                                                               |
| `PricingProvider`          | `FixturePricingProvider`: preview estimator over the synthetic pricebook                  | `GET /pricebooks/{id}`, `POST /builds/{id}/estimate-cost`                                                                         |
| `EvidenceProvider`         | Derived from item `provenance`                                                            | Same, since v1 has no evidence endpoint                                                                                           |
| `ResourceEstimateProvider` | Unavailable, so VRAM rules report **Unknown**                                             | Unavailable, since v1 has no read endpoint (see gaps)                                                                             |

The HTTP providers also check revision scoping: an evaluation or quote for a different `build_revision` is rejected as malformed.

## 3. Configuration and feature flags

Set these at build time (Vite `VITE_*` variables, baked into the static bundle):

| Variable                | Values              | Default    | Notes                                                                                                    |
| ----------------------- | ------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `VITE_DATA_MODE`        | `fixture` \| `http` | `fixture`  | Any other value fails the build (`scripts/version-plugin.ts`) and shows a configuration error at runtime |
| `VITE_API_BASE_URL`     | URL ending in `/v1` | —          | Required in `http` mode                                                                                  |
| `VITE_CATALOG_SNAPSHOT` | snapshot id         | —          | Required in `http` mode, because v1 has no "current snapshot" endpoint                                   |
| `VITE_PRICEBOOK_ID`     | pricebook id        | build lock | Optional                                                                                                 |
| `VITE_BUILD_STORE`      | `local` \| `http`   | `local`    | Store builds on the API instead of in the browser                                                        |

`dist/version.json` records `dataMode`, and the footer shows it. In `http` mode the demo banner disappears, but synthetic tags on any item still render.

**Hosting change required for `http` mode.** The production CSP is `connect-src 'self'`. Pointing at an API on another origin needs that origin added to `public/.htaccess`, which operations owns. Alternatively, serve the API under the same origin, for example `https://pickyour.ai/v1`.

## 4. Real-data integration checklist

1. ☐ Research artifacts are merged on `main` in the research repo. Unmerged PRs stay provisional.
2. ☐ If the contract changed (via #40): `npm run contracts:update -- --ref <sha>`, then `npm run contracts:types`, fix any type errors, and confirm `npm test` passes, including evaluator parity against the new `reference/evaluate.py`.
3. ☐ Publish the artifacts behind the API, or a static mirror with the openapi paths.
4. ☐ Validate offline: fetch each artifact and check it with `validateContract` (as `tests/unit/contracts.test.ts` does). Reject anything with fabricated fields.
5. ☐ In the `build` job of `.github/workflows/ci.yml`, change `VITE_DATA_MODE: fixture` to `http` and add `VITE_API_BASE_URL` and `VITE_CATALOG_SNAPSHOT`. Use repository variables for these, not secrets: they end up in the public bundle.
6. ☐ Request the CSP `connect-src` change if the API is on another origin.
7. ☐ Run the Playwright suite against `http` mode with a recorded API, as in `tests/unit/providers.test.ts › fakeApi`.
8. ☐ Remove or flag the synthetic `tags` path. Real items must carry `verification_status` and `source_uri` provenance.
9. ☐ Update `docs/RESEARCH_MAPPING.md` and `CHANGELOG.md`.

## 5. Fixture strategy

- `src/data/fixture/catalog.ts` holds 64 fictional items covering all 29 kinds. Each has `tags: ['synthetic']`, provenance `verification_status: "unverified"` with a "SYNTHETIC DEMO FIXTURE" note, and the `demo.*` id prefix.
- `src/data/fixture/pricebook.ts` holds the synthetic rates (`price_type: estimate`, unverified). One is deliberately expired.
- `src/data/fixture/starters.ts` holds four demo starter stacks, labelled "(demo)".
- Fixtures go through the same validators as live responses (`assertContract`), and tests validate them against the schemas.
- The upstream `contracts/v1/examples/*` are used only in tests, as golden references.

## 6. Contract-change workflow

1. Propose the change in the research repo through issue #40, with versioning and owner review.
2. After it merges upstream, run `npm run contracts:update -- --ref <new sha>`. This writes `contracts/PROVENANCE.json` with per-file SHA-256 hashes.
3. CI's `contracts:verify --upstream` re-downloads the pinned SHA and fails on any byte difference. It also checks the frozen baseline against `UPSTREAM_SHA256SUMS`.
4. Regenerate the types and validators (`npm run contracts:types`). CI fails if the generated files drift.
5. Adjust the presentation only where new fields or kinds need display.

## 7. Required backend endpoints and known v1 gaps

The endpoints the UI needs all exist in openapi v1, except these gaps. Each needs a decision under #40:

- No `GET` for the **current** catalog snapshot id, so it is set by configuration today.
- No `GET` for **resource estimates**, so capacity evidence cannot be read and VRAM-fit rules stay Unknown.
- No **list builds** or **delete build** endpoint, so remote builds keep a local index.
- No **evidence** endpoint beyond item provenance.
- No published **display labels** for kinds, so the site keeps its own display-only labels.
- Billing meters for egress and training (see PRs #70 and #77) are missing, so those costs appear as uncovered warnings.

## 8. Unresolved research decisions that affect the UI

- Price-specific refresh and invalidation remain open (#41/#39). The accepted [#41 interface](https://github.com/Pick-Your-AI/pick-your-ai-research/issues/41#issuecomment-6242626857) and [#127 decision record](https://github.com/Pick-Your-AI/pick-your-ai-research/pull/127) adopt no TTL: version-pinned facts do not expire with age, current-state facts retain access dates, and a newer snapshot alone does not invalidate a build. The UI shows recorded dates without implying currentness or independent verification; selected-version mismatches and missing items remain visible. Historical `verified` values are preserved, but the label alone does not prove independent reproduction or corroboration.
- The usage model for quotes, plus default currency and region (#39). The site's preview estimator is provisional.
- Sharing and privacy semantics for saved builds (#42, blocked by #40). The site's share links are a local-only preview.
- PR #72 reports that `rule.memory.framework.compatibility` blocks real frameworks.
- Whether the deployment mode is set per build or per component, and how hybrid mode is represented (#3).
