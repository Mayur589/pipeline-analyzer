# AGENT_PLAN_3_SCENARIOS — ChainDrop, BuildTamper, MaintainerTakeover (Generic removed)

You are working in the Pipeline Analyzer repo. Read this whole file before touching code.
Work through the tasks **in order**. Each task has a **Done when** check; do not start the next
task until it passes. If a task says **STOP AND ASK**, stop and report instead of guessing.

Facts below were verified by reading the actual source (not assumed). Where this plan
contradicts `SUMMARY.md`, this plan is newer; update `SUMMARY.md` in T10.

---

## 0. Goal

1. Remove the selectable **Generic** scenario. The product has exactly three scenarios:
   `ChainDrop` (exists), `BuildTamper` (new), `MaintainerTakeover` (new).
2. All three run on **one shared sample graph** loaded by the single **Load Sample** button.
3. Demo story: *same pipeline, three ways in, each stopped by a different control.*

## 1. Guardrails (violating any of these is a failure)

- **Run everything through Nix**, from the relevant subdirectory: `nix develop -c ...`.
  **Never** run `just dev` / `just prod` (they block). Do not launch a browser or dev server.
- **ChainDrop output must not change.** Its trace from `deps` is frozen by a golden fixture (T0).
  The golden test must pass after **every** task. Do not modify `phase_for`, the `republishes`
  handling, the harvest block, or `evaluate_chaindrop` logic (only its fallback call is renamed).
- **Never reorder the 23 existing sample edges. Append only.** The `deps -> build` edge must stay
  before `deps -> dev` (it makes the reverse token harvest appear in the ChainDrop trace).
- **New node properties default to the permissive value**, and the evaluator must use
  `unwrap_or(<permissive>)` when a property is missing (old saved nodes omit them).
- Keep JSON conventions: PascalCase fields, optional fields use
  `#[serde(default, skip_serializing_if = "Option::is_none")]`.
- Do not duplicate schema rules in the frontend. Options/defaults come from `/node-types`;
  scenario metadata comes from the new `/scenarios` endpoint.
- Do not add dependencies. Do not edit `Cargo.lock`, `flake.lock`, or any frontend lockfile.
- Clippy is configured `pedantic` + `unwrap_used`/`panic` = warn, `std_instead_of_core` = warn.
  **No new clippy warnings** vs the T0 baseline. No `unwrap()`/`panic!` in non-test code.
- Out of scope (do not "fix"): free-form node property validation, persistence-error handling,
  the lint warning in `Prj1GraphCanvas.tsx`, shared-array ownership filtering.
- If the repo is under git, commit after each task with message `T<n>: <summary>`.

## 2. Verified repo facts (use these; do not re-derive)

| Fact | Where |
| --- | --- |
| `ScenarioKind { Generic, ChainDrop }`, parsed in `ScenarioKind::from_scenario`; anything unknown/empty → Generic | `backend/src/attack/mod.rs` |
| `evaluate_generic(rel, target)` is also the **fallback** for ChainDrop (`executes`, signature check on `publishes`, `triggers`, `deploys`, `monitored_by`, unmodeled hops). It must survive as a private base rule set. | same |
| `simulate_attack(graph, attack_id, start, scenario: &str) -> AttackSimulationResult` is infallible. `record_step` has a `chain: bool` param that gates `Phase`/`Reverse` (always true once Generic is gone). | same |
| `INVALID_START_NODE` check is inline in the handler and only for ChainDrop | `backend/src/lib.rs` ~L610 |
| `ApiError` derives `strum::Display` SCREAMING_SNAKE_CASE; `status_code()` maps variants to HTTP | `backend/src/types.rs` |
| Routes: `/node-types`, `/relationships`, `/relationships/validate` in `base_routes`; attack is `POST /projects/{id}/attack` | `backend/src/main.rs` |
| Schema pair `build_environment → artifact_storage` is **`produces`**; `cicd_pipeline → artifact_storage` is `publishes`. `identity_people → source_control` allows `contributes_to` and `maintains`. No schema change needed for relationships. | `backend/src/schema.rs` |
| **`build` has outgoing edges `produces→registry` and `logs_to→siem`.** So BuildTamper can start at `build` with no reverse traversal. | `Header.tsx` edge list |
| **`maintainer` has NO edge to `repo`.** Its only outgoing edges are `maintains→deps` and `operates→ci`. One edge must be added (T6/T9). | same |
| Sample edge list is duplicated: `frontend/src/components/Header.tsx` (`edgeSpecs`) **and** `backend/tests/api_tests.rs` (`edge_specs` in `test_chaindrop_example_graph_validates_and_simulates`). Both need the new edge. | both |
| The **UI dropdown has 5 options** (4 legacy generic ids: `compromised_maintainer_credentials`, `supply_chain_poisoning`, `ci_pipeline_takeover`, `registry_credential_leak`, plus `ChainDrop`). It lives in the per-node Attack Simulation panel in `DetailsPanel.tsx` (~L207–225). | frontend |
| **Generic scenario strings are hardcoded as defaults** in: `graphStore.ts` (`selectedScenario` initial value ~L104 and fallback ~L541), `client.ts` (`simulateAttack` default param ~L458), and `api/testBackendLive.ts` (~L146). All will 400 after removal. | frontend |
| `client.ts` `simulateAttack` **drops** `Phase`, `Reverse`, `WormGenerations`, `ExposedSecretIds`; `AttackStep`/`AttackSimulationResult` types in `types/graph.ts` lack them. | frontend |
| Store has `selectNode(nodeId)`, `initialize()` (fetches `getNodeTypes` + `getRelationships` in parallel), `setSelectedScenario`. | `graphStore.ts` |
| Backend has 12 API tests today. `test_simulate_attack`, `test_chaindrop_unmitigated_and_generic_compatibility`, and the error-path checks inside `test_simulate_attack` use Generic/legacy scenario strings and **must be converted** (T2). | `api_tests.rs` |

## 3. Target behavior

### 3.1 Scenario table

| | ChainDrop | BuildTamper | MaintainerTakeover |
| --- | --- | --- | --- |
| Canonical id | `ChainDrop` | `BuildTamper` | `MaintainerTakeover` |
| Real incident | npm worms (Shai-Hulud style) | SolarWinds / 3CX | xz-utils |
| Valid start categories | `dependencies`, `identity_people` | `build_environment` | `identity_people` |
| Default start category (UI) | `dependencies` | `build_environment` | `identity_people` |
| Edge scoping | none (unchanged) | allowlist (below) | allowlist (below) |
| Stopped by | cooldown + lockfile pin, or lifecycle scripts off | `reproducibleBuilds = true` | `releaseSource = Built from tag` |
| Only slowed by | either of cooldown/pin | — | `requiredReviewers = 2+ reviewers` |
| Detection | existing | only `alertThreshold = All Anomalies (Zero-Tolerance)` | never |
| ChainDrop-only fields (`WormGenerations`, `ExposedSecretIds`) | emitted | omitted | omitted |

Parsing: lowercase and strip `_`, `-`, spaces, then compare to `chaindrop` / `buildtamper` /
`maintainertakeover`. This is a superset of the old aliases (`ChainDrop`, `chaindrop`, `chain_drop`).
Unknown or empty scenario → `ApiError::InvalidScenario` → HTTP 400, code `INVALID_SCENARIO`.
The result still **echoes the submitted scenario string** (existing behavior).

### 3.2 Why edge allowlists are mandatory (verified by simulation)

The sample graph has parallel paths. With no scoping, MaintainerTakeover from `maintainer`
walks `maintains→deps` (into ChainDrop territory), `operates→ci` (skips the repo-review control),
and `ci deploys→prod` / `build produces→registry` (bypass the publish control). I modeled it:
**unscoped, with `Built from tag` on, all 12 nodes are still compromised (severity 10.0).**
So BuildTamper and MaintainerTakeover only follow edges whose `(relationship, target category)`
is in their allowlist. ChainDrop follows everything, exactly as today.

```
BuildTamper allowlist (rel, target_category):
  produces→artifact_storage, publishes→artifact_storage,
  provides→distribution, provides→runtime_environment,
  delivers→runtime_environment, deploys→runtime_environment,
  monitored_by→monitoring_response

MaintainerTakeover allowlist:
  contributes_to→source_control, maintains→source_control,   // NOT maintains→dependencies
  triggers→cicd_pipeline, publishes→artifact_storage,
  provides→distribution, provides→runtime_environment,
  delivers→runtime_environment, monitored_by→monitoring_response
  // deliberately excluded: operates, provides_source, executes, produces, deploys,
  // references, consumed_by, republishes, logs_to, alerts, authenticates, accesses
```

A skipped edge records no step and does not mark anything compromised/blocked.

### 3.3 New properties (schema.rs). All default to the permissive value.

| Category | Key | Type | Options | Default |
| --- | --- | --- | --- | --- |
| `build_environment` | `reproducibleBuilds` | boolean | — | `false` |
| `source_control` | `requiredReviewers` | select | `None`, `1 reviewer`, `2+ reviewers` | `None` |
| `cicd_pipeline` | `releaseSource` | select | `Uploaded tarball`, `Built from tag` | `Uploaded tarball` |

### 3.4 BuildTamper rules (`evaluate_build_tamper(rel, source, target)`)

| Hop | Outcome |
| --- | --- |
| `produces`/`publishes` → artifact_storage | If `source` is `build_environment` and `reproducibleBuilds = true` → **Blocked**, controls `["reproducibleBuilds"]`, reason: independent rebuild produces a different hash. Otherwise **Compromised**; the build is legitimately signed. If target `signatureVerification` is true, put a descriptive entry in `controls_triggered` and say in the reason that signature verification passes because the signature is valid (mirror ChainDrop's style, e.g. `"signatureVerification does not block a validly signed build"`). |
| `provides`/`delivers` → distribution/runtime | **Compromised** (integrity hash matches the poisoned release). |
| `deploys` → runtime | fall back to base rule. |
| `monitored_by` → monitoring | `alertThreshold == "All Anomalies (Zero-Tolerance)"` → **Detected**; anything else → **Compromised** (implant mimics normal traffic). Note: `Strict Policy Violations` does **not** detect here (it does in the base rule used by ChainDrop). |

### 3.5 MaintainerTakeover rules (`evaluate_takeover(rel, source, target)`)

Narrative encoded in reason strings: the attacker is a trusted maintainer; the hidden payload
lives only in the release process/tarball, not in reviewed history.

| Hop | Outcome |
| --- | --- |
| `contributes_to`/`maintains` → source_control | `requiredReviewers == "2+ reviewers"` → **Slowed**, controls `["requiredReviewers"]`. `None`, `1 reviewer`, or missing → **Compromised** (a single approver is the attacker's accomplice in this model). `branchProtection` does **not** block a trusted maintainer; if it is true, note that it was bypassed in `controls_triggered`/reason. **This hop never Blocks.** (Do not use the base branch-protection rule, which would Block on the sample repo.) |
| `triggers` → cicd_pipeline | base rule (`approvalRequired` → Slowed, else Compromised). |
| `publishes` → artifact_storage | `releaseSource == "Built from tag"` → **Blocked**, controls `["releaseSource"]` (release built from the reviewed commit; the hidden payload cannot ship). Otherwise **Compromised** (tarball differs from repo; signature verification passes because the release is legitimately signed). |
| `provides`/`delivers` | **Compromised** (hash matches). |
| `monitored_by` | **Compromised** always (legitimate access raises no anomaly). Never Detected. |

### 3.6 `Phase` for new scenarios

Do **not** touch `phase_for` (ChainDrop's output is frozen). Add a separate function for the new
scenarios: `execution` for `contributes_to`/`maintains`/`triggers`/`produces`; `propagation` for
`publishes`/`provides`/`delivers`/`deploys`; `None` for `monitored_by`. `Reverse` is never set for
new scenarios.

### 3.7 Expected traces on the sample graph (acceptance targets)

Sample = existing 23 edges + new edge #24 `maintainer -contributes_to-> repo`.
Sample properties: repo `branchProtection=true`; ci `trustedPublishing=true`,
`approvalRequired=false`; build `isolationLevel=Shared Node`; registry
`signatureVerification=true`; dist `integrityCheck=true`; siem `Strict Policy Violations`.
Severity = compromised/12 × 10, ×0.7 if detected. Labels: ≥7.5 Critical, ≥5 High, ≥2.5 Medium, else Low.

| # | Scenario / start | Change | Steps (in order) | Compromised | Blocked | Detected | Severity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | BuildTamper / `build` | none | build→registry C; registry→dist C; registry→prod C; dist→prod C; prod→siem C | build, registry, dist, prod, siem | — | no | 4.17 Medium |
| B | BuildTamper / `build` | build `reproducibleBuilds=true` | build→registry **Blocked** (1 step) | build | registry | no | 0.83 Low |
| C | BuildTamper / `build` | siem `All Anomalies (Zero-Tolerance)` | same as A but last step **Detected** (index 4) | same as A | — | yes | 2.92 Medium |
| D | MaintainerTakeover / `maintainer` | none | maintainer→repo C; repo→ci C; ci→registry C; registry→dist C; registry→prod C; dist→prod C; prod→siem C | maintainer, repo, ci, registry, dist, prod, siem | — | no | 5.83 High |
| E | MaintainerTakeover / `maintainer` | repo `requiredReviewers=2+ reviewers` | as D but first step **Slowed** | same as D | — | no | 5.83 High |
| F | MaintainerTakeover / `maintainer` | ci `releaseSource=Built from tag` | maintainer→repo C; repo→ci C; ci→registry **Blocked** (3 steps) | maintainer, repo, ci | registry | no | 2.50 Medium |

(C = Compromised.) Case E is intentionally "visible but not outcome-changing": reviewers slow,
they don't stop. Do not "fix" this. Also: no new-scenario trace may contain a `consumed_by`,
`republishes`, `authenticates`, `accesses`, `operates`, `logs_to`, or `alerts` step.

---

## 4. Tasks

### T0 — Baseline and golden fixture (no production code changes)

1. From `backend/`: `nix develop -c cargo test`, `nix develop -c cargo clippy --all-targets`.
   Record: test count (expect **12**) and the clippy warning count/list.
2. From `frontend/`: `nix develop -c pnpm run build`, `nix develop -c pnpm run lint`.
   Expect build OK and exactly one lint warning (`Prj1GraphCanvas.tsx`, immutability).
3. Add a golden regression test in `backend/tests/api_tests.rs`:
   - Build the existing 23-edge example graph through handlers (reuse the setup in
     `test_chaindrop_example_graph_validates_and_simulates`; extract a shared helper
     `build_example_graph(state) -> (project_id, ids)` if cleaner, but do not change what that test asserts).
   - Run ChainDrop from `deps`. Serialize `steps` (use node **keys** like `deps`, not generated ids:
     source key, relationship, target key, outcome, phase, reverse), plus sorted
     `compromised_node_ids`, `blocked_node_ids` (as keys), `detected_at_step`, `worm_generations`,
     `exposed_secret_ids`, severity score/label, into `backend/tests/fixtures/chaindrop_golden.json`.
   - Generate the fixture once from **current, unmodified** code, then commit it. The test compares
     against the file and must not rewrite it.
4. **Done when:** 13 tests pass; clippy baseline recorded in your report; fixture exists.
   **STOP AND ASK** if test count ≠ 12, the build fails, or clippy/lint output differs materially from the above.

### T1 — Schema: three new properties

- Edit `backend/src/schema.rs` only: add the three fields from §3.3 to their categories (append to
  the end of each `field_defs` list; keep existing field order).
- Add a test asserting each new key exists with the right options and permissive default.
- **Done when:** all tests incl. golden pass; `test_node_categories_and_relationships` still reports 10 categories / 22 relationships.

### T2 — Engine refactor: remove Generic, keep it as the private base (ChainDrop unchanged)

In `backend/src/attack/mod.rs`, `backend/src/types.rs`, `backend/src/lib.rs`, `backend/tests/api_tests.rs`:

1. `ScenarioKind` becomes `{ ChainDrop, BuildTamper, MaintainerTakeover }`. Replace `from_scenario`
   with `pub fn parse(s: &str) -> Option<Self>` (normalization in §3.1). Add `pub fn id(self) -> &'static str`,
   `pub fn valid_start_categories(self) -> &'static [&'static str]`, and a private
   `fn follows(self, rel: &str, target_category: &str) -> bool` (ChainDrop: always `true`; the other two:
   allowlists from §3.2 — implement the allowlists now, evaluators come in T3/T4).
2. Rename `evaluate_generic` → `evaluate_base` (private; behavior identical; update doc comment to say it is
   the shared base rule set, not a scenario). Update `evaluate_chaindrop`'s fallback call.
3. Add `ApiError::InvalidScenario` (400). Display must render `INVALID_SCENARIO`.
4. Change to `pub fn simulate_attack(graph, attack_id, start_node_id, scenario: &str) -> Result<AttackSimulationResult, ApiError>`:
   - `parse` → `InvalidScenario` on `None`.
   - Start node missing from graph → `NodeNotFound`.
   - Start node category not in `valid_start_categories()` → `InvalidStartNode`.
   - Remove the Generic `else` branch in the loop; `record_step` always attaches Phase/Reverse now —
     you may drop the `chain` parameter (behavior-neutral). Keep `scenario: scenario.into()` echo.
   - Inside the edge loop, before `traversed.insert`, skip edges where `!kind.follows(&edge.relationship, &target.category_id)`.
   - For now, BuildTamper and MaintainerTakeover may call `evaluate_base` (placeholder) so the crate compiles.
   - `worm_generations` / `exposed_secret_ids` stay `(kind == ChainDrop).then_some(..)`.
5. Handler (`simulate_attack_handler`): keep order `ProjectNotFound → EmptyGraph → NodeNotFound`, then call
   `simulate_attack(...)?`. Delete the inline ChainDrop start-node check (now centralized). Update the doc comment's `# Errors`.
6. Fix tests so the suite compiles and the old behavior is converted, not deleted:
   - All `simulate_attack(...)` unit-test calls need `.expect("...")`.
   - `test_chaindrop_unmitigated_and_generic_compatibility`: remove the `"nonsense"`/`""` Generic half.
     Replace with assertions that `"nonsense"` and `""` return `Err(ApiError::InvalidScenario)`. Rename the test
     `test_chaindrop_unmitigated`. (The "no ChainDrop-only keys / no Phase" JSON assertions move to T3/T4.)
   - `test_simulate_attack` (handler-level, identity→repo→pipeline): switch scenario to `"MaintainerTakeover"`.
     Its first assertions (repo step Compromised with no controls; pipeline step Slowed with
     `["approvalRequired"]`) only hold **after T4**; until then mark the test `#[ignore = "re-enabled in T4"]`.
     In its error-path checks (`ProjectNotFound`, `NodeNotFound`, `EmptyGraph`), change the scenario string to `"ChainDrop"`.
   - Add tests: every alias parses (`ChainDrop`, `chain_drop`, `CHAINDROP`, `BuildTamper`, `build_tamper`,
     `MaintainerTakeover`, `maintainer-takeover`); invalid start categories per scenario return `InvalidStartNode`
     (BuildTamper from `cicd_pipeline`/`dependencies`; Takeover from `dependencies`/`build_environment`; ChainDrop from `source_control`).
7. **Done when:** golden passes byte-for-byte; all non-ignored tests pass; clippy has no new warnings.
   **STOP AND ASK** if the golden fixture changes for any reason.

### T3 — BuildTamper evaluator

- Implement `evaluate_build_tamper` per §3.4 and the new-scenario phase function per §3.6; wire into the dispatch.
- Tests (unit, using `Graph` literals like `chain_graph()`; the full example-graph run is in T6):
  cases A, B, C from §3.7 in miniature; missing `reproducibleBuilds` ⇒ permissive (not blocked);
  BuildTamper JSON has no `WormGenerations`/`ExposedSecretIds`; steps carry `Phase`, never `Reverse`.
- **Done when:** golden + all tests pass.

### T4 — MaintainerTakeover evaluator

- Implement `evaluate_takeover` per §3.5; wire into dispatch.
- Re-enable `test_simulate_attack` (remove `#[ignore]`). Its last section currently flips `branchProtection`
  and expects the repo hop **Blocked**; rewrite it to: set `requiredReviewers = "2+ reviewers"` → repo step is
  **Slowed** and the pipeline is **still reached** (3 compromised, none blocked); and separately assert that
  `branchProtection = true` alone does **not** block.
- Tests: `1 reviewer` and missing property ⇒ Compromised; isolation test — when the graph also contains
  `maintainer→deps` and `maintainer→ci` edges, no `consumed_by`/`republishes`/`operates` steps appear;
  detection never fires even with `alertThreshold = All Anomalies (Zero-Tolerance)`.
- **Done when:** golden + all tests pass.

### T5 — `GET /scenarios`

- `types.rs`: `ScenarioInfo { id, name, description, valid_start_categories: Vec<String>, default_start_category: String, key_controls: Vec<KeyControl> }`,
  `KeyControl { category_id, property_key }`, both `Serialize` with `#[serde(rename_all = "PascalCase")]`.
- `ScenarioKind::all() -> [ScenarioKind; 3]` in order ChainDrop, BuildTamper, MaintainerTakeover, and a
  `fn info(self) -> ScenarioInfo` (single source of truth for names/descriptions/start categories/key controls).
- Suggested content:
  - ChainDrop — "ChainDrop npm Worm" — "A poisoned npm release runs on install, steals CI credentials, and republishes itself downstream." Key controls: `dependencies.releaseCooldown`, `dependencies.lockfilePinned`, `dependencies.lifecycleScripts`.
  - BuildTamper — "Build Tamper (SolarWinds-style)" — "A backdoor is injected during compilation; the poisoned build is signed and published, so every downstream check passes." Key controls: `build_environment.reproducibleBuilds`.
  - MaintainerTakeover — "Maintainer Takeover (xz-style)" — "A trusted maintainer slips a payload into the release process that reviewers never saw in the repository." Key controls: `cicd_pipeline.releaseSource`, `source_control.requiredReviewers`.
- `lib.rs`: `pub async fn get_scenarios(State(_state): State<AppState>) -> ApiResult<Vec<ScenarioInfo>>` (mirror `get_relationships`).
  `main.rs`: add `.route("/scenarios", get(get_scenarios))` to `base_routes` and the `use`.
- Test: returns 3 entries in order; ids are the canonical ids; every `ValidStartCategories` entry and every `KeyControl` (category + key) exists in `all_node_categories()`.
- **Done when:** golden + all tests pass.

### T6 — Backend example-graph test for all three scenarios

In `test_chaindrop_example_graph_validates_and_simulates` (or a sibling test sharing the helper from T0):
1. Append `("maintainer", "contributes_to", "repo")` as the **24th** entry of `edge_specs` (after `siem alerts dev`). Existing assertions must not change.
2. Rename the project string to `"Pipeline Attack Demo (example)"` if the test asserts it.
3. Add handler-level runs reproducing §3.7 cases A–F using `edit_node` to flip properties between runs
   (`reproducibleBuilds` on `build`; `alertThreshold` on `siem`; `requiredReviewers` on `repo`; `releaseSource` on `ci`; restore after each).
   Assert step count, blocked/compromised sets, detection, and severity (compare floats with a small epsilon).
4. Assert the golden ChainDrop-from-`deps` result is **still identical** with the 24th edge present (maintainer is unreachable from `deps`).
5. Also run ChainDrop from `maintainer` once and assert only that it now contains a `maintainer contributes_to repo` step whose outcome is Blocked (branch protection) — this documents the one intended side effect of edge #24. No golden for it.
- **Done when:** `nix develop -c cargo test` and `nix develop -c cargo build` pass; clippy clean vs baseline. **Backend is now feature-complete.**

### T7 — Frontend plumbing (`types/graph.ts`, `api/client.ts`, `api/testBackendLive.ts`, `store/graphStore.ts`)

1. `types/graph.ts`: add optional `phase?: string`, `reverse?: boolean` to `AttackStep`; optional
   `wormGenerations?: number`, `exposedSecretIds?: string[]` to `AttackSimulationResult`; new `ScenarioInfo`
   and `KeyControl` types (camelCase).
2. `client.ts`: add `getScenarios()` (`GET /scenarios`, map PascalCase → camelCase) and export it on `api`.
   In `simulateAttack`: **remove the default** for `scenario` (make it required) and map `Phase`, `Reverse`,
   `WormGenerations`, `ExposedSecretIds` (extend the `Backend*` DTO types too).
3. `testBackendLive.ts`: change `'compromised_maintainer_credentials'` to `'MaintainerTakeover'` (node1 is `identity_people`, a valid start). Add a `GET /scenarios` check.
4. `graphStore.ts`: add `scenarios: ScenarioInfo[]`; fetch `getScenarios()` inside `initialize()` alongside the existing
   `Promise.all`. Set initial `selectedScenario` to `'ChainDrop'`; change the fallback in `runAttackSimulation` to `'ChainDrop'`.
   If `/scenarios` fails, set the store `error` like the other metadata calls do.
- **Done when:** `nix develop -c pnpm run build` passes; lint shows only the one pre-existing warning.
  `grep -rn "compromised_maintainer_credentials\|supply_chain_poisoning\|ci_pipeline_takeover\|registry_credential_leak" frontend/src backend` returns nothing.

### T8 — DetailsPanel: scenario selector and start-node guidance

In `DetailsPanel.tsx` (Attack Simulation block, ~L190–260):
1. Replace the hardcoded `<option>` list with `scenarios.map(...)` (value = `id`, label = `name`).
2. Under the select, show the selected scenario's `description` in a small muted paragraph.
3. Disable **Simulate Attack** when `node.categoryId` is not in the selected scenario's `validStartCategories`, with a one-line hint:
   "Start from: <categories, formatted>". (Keep the existing `isSimulatingAttack` disabling.)
4. Add a small "Use recommended start" button: picks the first node in the store whose category equals
   `defaultStartCategory` and calls `selectNode(id)`. (On the sample this yields `deps`, `build`, `maintainer` respectively.)
5. Where the result header does `formatRelationshipLabel(attackResult.scenario)` (~L855), show the scenario `name` looked up from `scenarios` by id, falling back to the raw string.
- **Done when:** build passes; lint unchanged. No browser run is required or allowed.

### T9 — Header: one sample, three scenarios

In `Header.tsx` `handleLoadSamplePipeline` (~L155–255):
1. Project name → `'Pipeline Attack Demo (example)'`. Keep `setSelectedScenario('ChainDrop')`.
2. Node `values` additions: `build` → `reproducibleBuilds: false`; `repo` → `requiredReviewers: 'None'`; `ci` → `releaseSource: 'Uploaded tarball'`.
   (Defaults would give the same values via `createDefaultProperties`; set them explicitly so the demo toggles are visible in the sample.)
3. **Append** `['maintainer', 'contributes_to', 'repo']` as the last `edgeSpecs` entry. Do not touch the order or comment of the existing 23.
4. Update the button `title` ("Load pipeline attack demo") and the `console.error` text.
- **Done when:** build passes; the edge list in `Header.tsx` and `edge_specs` in the backend test are identical (compare them and state that you did).

### T10 — Docs

1. `SUMMARY.md`: replace the Generic/ChainDrop sections with the three-scenario description; update repo map, endpoint list
   (`GET /scenarios`, `INVALID_SCENARIO`), property table, example graph (12 nodes, **24** relationships, new edge appended last),
   the "known status" counts, and add the allowlist rationale from §3.2. Note: unknown/empty scenarios now return 400.
2. `README.md` (currently one line): add a **Demo script**:
   1. Load Sample → run **ChainDrop** from `npm: cache-utils`; worm fans out. Set `releaseCooldown = 7 days` and `lockfilePinned = true` → blocked.
   2. Switch to **BuildTamper**, start at `Shared CI Runner`. Registry still falls even though signature verification is on. Set `reproducibleBuilds = true` → stops at the registry. (Optional beat: set SIEM to Zero-Tolerance → detected.)
   3. Switch to **MaintainerTakeover**, start at `Package Maintainer`. `requiredReviewers = 2+ reviewers` only slows. `releaseSource = Built from tag` → blocked at the registry.
   4. Close: no single control stops all three.
3. Add this coverage table to the README:

   | Control | ChainDrop | BuildTamper | MaintainerTakeover |
   | --- | --- | --- | --- |
   | Cooldown + lockfile pin | Blocks | — | — |
   | `signatureVerification` on registry | No effect with trusted publishing (sample config) | No effect | No effect |
   | `integrityCheck` on distribution | No effect | No effect | No effect |
   | `reproducibleBuilds` | — | Blocks | — |
   | `releaseSource = Built from tag` | — | — | Blocks |
   | `requiredReviewers = 2+` | — | — | Slows |
   | SIEM `Zero-Tolerance` | Detects | Detects | No effect |
- **Done when:** the docs match the code you actually shipped (re-read the evaluators before writing the table; correct the table if reality differs).

### T11 — Polish (only after T0–T10 are green; do in this order)

1. **Trace readability** (`DetailsPanel.tsx` trace list): show a small phase tag (`execution` / `harvest` / `propagation`) per step when `phase` is present, and a "reverse" marker when `reverse` is true.
2. **Scenario summary line** above the trace: ChainDrop shows `wormGenerations` and the count of `exposedSecretIds`; others show compromised/blocked counts and severity. Render only the fields that exist.
3. **Quick-toggle controls**: for the selected scenario's `keyControls`, find the first node with that `categoryId` and render its property as an inline toggle/select (type and options from `nodeCategories`, i.e. `/node-types`), writing through the existing node-edit store action, with a "Re-run" button that calls `runAttackSimulation` with the current origin. Never hardcode option lists.
4. **Optional, ask first:** a browser smoke test for Load Sample. This requires a new dependency (e.g. Playwright), so **STOP AND ASK** before adding it.

### T12 — Final verification and report

Run, in order, and paste the tails of the output in your report:
```
cd backend  && nix develop -c cargo test && nix develop -c cargo build && nix develop -c cargo clippy --all-targets
cd ../frontend && nix develop -c pnpm run build && nix develop -c pnpm run lint
```
Report must include:
- Test count (12 original, with 2 converted/renamed, plus new tests) and confirmation the **golden ChainDrop fixture was never modified**.
- Clippy: new warnings vs T0 baseline (target: zero).
- Lint: the one pre-existing warning only.
- A table of §3.7 cases A–F: expected vs actual (from the tests).
- Any deviation from this plan, with the reason.
- Explicit statement that no browser/dev server was run, so the UI changes (T8, T9, T11) are verified by type-check/build only.

---

## 5. STOP-AND-ASK triggers (summary)

- T0 baseline differs from the expectations above (test count, build failure, clippy/lint surprises).
- The ChainDrop golden fixture changes at any point.
- Any case in §3.7 cannot be achieved without changing ChainDrop logic, or needs a new category/relationship ID/edge beyond the single appended edge.
- The frontend code does not match the descriptions in §2 (e.g. `initialize()` or the dropdown has moved).
- Any step needs a new dependency or a lockfile change.
- You are tempted to reorder sample edges, widen an allowlist, or relax a guardrail to make a test pass.
