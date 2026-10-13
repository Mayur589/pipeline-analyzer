# Pipeline Analyzer — Project Handoff

## Current state

Pipeline Analyzer is a small graph editor and attack-path simulator. The Rust
backend owns graph categories, property metadata, relationship validation, and
attack evaluation. The React frontend reads metadata from the backend, creates
and edits graph data through API/store actions, and displays attack traces.

The repository currently supports two simulator rule sets:

- **Generic**: selected for unknown scenario names and the empty string.
- **ChainDrop**: selected case-insensitively by `ChainDrop`, `chaindrop`, or
  `chain_drop`.

The single **Load Sample** button creates a new project named
`ChainDrop npm Worm (example)`, builds the ChainDrop graph, and selects the
ChainDrop scenario. The previous generic sample graph loader was removed; the
older project/graph is preserved when this button is used.

## Repository map

| Path | Responsibility |
| --- | --- |
| `backend/src/types.rs` | Serde models for projects, nodes, edges, attack steps/results, and API errors. JSON structs use PascalCase field names. |
| `backend/src/schema.rs` | The 10 node categories, property metadata/defaults, 22 relationship IDs, and allowed category pairs. This is the source of truth for graph metadata and edge validation. |
| `backend/src/attack/mod.rs` | Scenario parsing, generic and ChainDrop evaluation, traversal, result enrichment, and severity calculation. |
| `backend/src/lib.rs` | Axum handlers, project ownership checks, graph CRUD, relationship validation, and `POST /projects/{id}/attack`. |
| `backend/src/database.rs` | JSON-backed persistence for projects, nodes, edges, and ownership maps. Arbitrary node properties are stored in a free-form map. |
| `backend/tests/api_tests.rs` | API integration tests, including the ChainDrop example graph and its scenario/toggle assertions. |
| `frontend/src/api/client.ts` | HTTP API calls and backend/frontend DTO mapping. Unknown response fields are ignored. |
| `frontend/src/store/graphStore.ts` | Active project/graph state, API-backed node and edge actions, cached node positions, selected attack scenario, and simulation playback. |
| `frontend/src/components/Header.tsx` | Project controls and the single **Load Sample** button that creates the ChainDrop example. |
| `frontend/src/components/DetailsPanel.tsx` | Scenario selector, attack launch, and trace details. |
| `frontend/src/types/graph.ts` | Frontend graph types and `createDefaultProperties`, which fills fields from backend metadata. |

`flake.nix` defines the development tools. Run project commands through
`nix develop -c ...` (from the relevant subdirectory, Nix finds the root flake).
Do not use `just dev` or `just prod` for automated checks; they launch/block on
the application.

## Backend API and schema

The principal metadata endpoints are:

- `GET /node-types`: node category property definitions and defaults.
- `GET /relationships`: supported relationship IDs.
- `GET /relationships/validate?SourceCategory=...&TargetCategory=...`:
  allowed relationship IDs for a category pair.
- `POST /projects/{id}/nodes` and `POST /projects/{id}/edges`: create graph
  elements. Edge creation verifies the category pair and relationship.
- `POST /projects/{id}/attack`: simulate from `StartNodeId` for `Scenario`.

There are 10 categories and 22 relationship IDs. ChainDrop added the
`republishes` relationship and these allowed pairs:

| Source category | Relationship | Target category |
| --- | --- | --- |
| `dependencies` | `consumed_by` | `identity_people` |
| `identity_people` | `maintains` | `dependencies` |
| `cicd_pipeline` | `republishes` | `dependencies` |

The corresponding properties are declared only in `schema.rs`; frontend forms
obtain their options/defaults through `/node-types`.

| Category | Property | Type and options/default |
| --- | --- | --- |
| `dependencies` | `lifecycleScripts` | Select: `Enabled` (default), `Disabled` |
| `dependencies` | `releaseCooldown` | Select: `None` (default), `1 day`, `7 days` |
| `dependencies` | `lockfilePinned` | Boolean, default `false` |
| `cicd_pipeline` | `trustedPublishing` | Boolean, default `false` |
| `secrets_credentials` | `tokenScope` | Select: `Publish + 2FA Bypass` (default), `Granular`, `Read-only` |

Older node records can omit these properties. The ChainDrop evaluator treats
missing values as no mitigation / the permissive default described below.
Other fields remain unvalidated free-form node properties.

## Attack simulation behavior

`simulate_attack_handler` checks the project, non-empty graph, and start-node
membership. A ChainDrop start node must be in `dependencies` or
`identity_people`; otherwise it returns `INVALID_START_NODE` with HTTP 400.
Generic scenarios continue to accept any existing start node. The result
echoes the submitted scenario string.

### Generic rules

The generic scenario uses the original relationship/target rules: branch
protection can block source-control contribution, pipeline approvals slow
triggered CI, runner isolation affects execution, short-lived/auto-revoked
credentials block the generic credential hop, signature verification can
block artifact publication, integrity checks can block delivery, zero-trust
slows deployment, and strict monitoring can detect `monitored_by` hops.
Unmodeled hops default to compromised. Generic output omits all ChainDrop-only
fields.

### ChainDrop rules

| Hop | Behavior |
| --- | --- |
| `consumed_by` to `build_environment` or `identity_people` | Source `lifecycleScripts = Disabled` blocks. Cooldown plus lockfile pin blocks. Either control alone slows. Neither means compromised; the reason notes that vulnerability scanning cannot identify a brand-new release with no CVE. |
| `executes` to build | Uses the generic rule. |
| `publishes` to artifact storage | Source CI with `trustedPublishing = true` compromises the registry despite signature verification (the modeled release has valid OIDC provenance). Otherwise the generic signature-verification rule applies. |
| `provides`/`delivers` to distribution or runtime | Always compromises in ChainDrop; integrity verification passes because the hash matches the poisoned release. |
| Harvest from a compromised build or CI node | Scans real incoming `authenticates` edges from secrets and records movement in reverse along the stored edge. Long-lived credentials compromise; short-lived, auto-revoked, and read-only credentials slow. Harvest never blocks. |
| `republishes` to dependencies | Trusted publishing or a compromised `Publish + 2FA Bypass` token compromises; `Granular` slows; read-only/no compromised publish token blocks. Successful/slowed results propagate through that package's `consumed_by` edges. |
| Other hops | Use generic evaluation. |

Each node is queued at most once, and each real edge is traversed at most once.
The compromised and blocked node ID arrays are sorted. Severity uses the shared
formula: compromised-node fraction times 10, multiplied by 0.7 if a detection
occurred.

ChainDrop responses add optional fields, omitted when absent:

- `AttackStep.Phase`: `execution`, `harvest`, or `propagation` for modeled
  ChainDrop steps.
- `AttackStep.Reverse`: `true` on reverse harvest steps only.
- `AttackSimulationResult.WormGenerations`: count of compromised/slowed
  `republishes` steps.
- `AttackSimulationResult.ExposedSecretIds`: sorted secrets reached through
  harvest.

The API model names this type `AttackSimulationResult` (some older planning
notes called it `AttackResult`).

## ChainDrop example graph

The Header's **Load Sample** handler creates a distinct example project through
`createNewProject`, then creates nodes with `addNode` and edges with `addEdge`.
Node IDs and edge IDs come from the backend; node positions are passed through
store actions and cached in frontend memory. Default properties are generated
with `createDefaultProperties(category)` using `/node-types`, then overridden
for the example. Every edge pair is checked with the backend relationship
validation endpoint before creation. This avoids duplicating schema rules in
the UI.

The graph has 12 nodes:

| Key | Category | Name |
| --- | --- | --- |
| `maintainer` | `identity_people` | Package Maintainer |
| `dev` | `identity_people` | Developer Workstation |
| `deps` | `dependencies` | npm: cache-utils |
| `deps2` | `dependencies` | npm: downstream-app |
| `repo` | `source_control` | app-repo |
| `build` | `build_environment` | Shared CI Runner |
| `ci` | `cicd_pipeline` | Release Workflow |
| `token` | `secrets_credentials` | npm Publish Token |
| `registry` | `artifact_storage` | Internal Registry |
| `dist` | `distribution` | CDN |
| `prod` | `runtime_environment` | Production Cluster |
| `siem` | `monitoring_response` | SIEM |

Notable properties: dependency lifecycle scripts are enabled with no cooldown
and no pin; CI trusted publishing is enabled; the token is long-lived
`HashiCorp Vault`, has `Publish + 2FA Bypass`, and has auto-revocation off;
registry signature verification and artifact integrity checks are on; SIEM
threshold is `Strict Policy Violations`.

The graph contains the requested 23 relationships. The `deps -> build`
`consumed_by` edge is created before `deps -> dev`. This order is deliberate:
the BFS then harvests the token from the build before the developer's
`accesses` edge compromises it, so the trace includes the requested reverse
harvest step. Reordering those two edges can make the already-compromised
secret ineligible for a harvest step under the simulator's rules.

The example test creates every node/edge through API handlers and checks the
expected attack walk, detection, worm generation, exposed token, and mitigation
toggles. The test database helper uses unique temporary paths to avoid
concurrent-test file collisions.

## Extending the project

1. Add categories, property fields, relationship IDs, and allowed category
   pairs to `backend/src/schema.rs` only when the graph model needs them.
2. Add attack logic to `backend/src/attack/mod.rs`; keep generic behavior
   compatible unless the change explicitly targets it. Use actual graph edges
   for movement, preserve traversal cycle safety, and add response fields
   optionally with Serde omission for backward compatibility.
3. Keep graph creation in the frontend on store/API actions. Use
   `createDefaultProperties` for backend-defined defaults and validate edge
   pairs via the API instead of maintaining a second schema in components.
4. Add or update API integration tests in `backend/tests/api_tests.rs` for
   schema validation and attack results.
5. Run checks through Nix:

   ```sh
   cd backend
   nix develop -c cargo test
   nix develop -c cargo build

   cd ../frontend
   nix develop -c pnpm run build
   nix develop -c pnpm run lint
   ```

## Verification and known status

At the last implementation check, backend tests passed (12 API tests) and the
frontend TypeScript/production build passed. `pnpm run lint` completed with one
existing warning in `frontend/src/components/Prj1GraphCanvas.tsx` at the
immutability rule; that file was not part of the ChainDrop example changes.
The backend test suite originally had a shared temp filename; the test helper
now gives each test state a unique path.

No browser was launched for the example button. The test exercised the same
backend create/validate/simulate path with the same graph, including all 23
edges and the requested toggle cases.

## Known project limitations

- Node properties are free-form and are not validated against category
  definitions by CRUD endpoints.
- The database update path retains an in-memory mutation if persistence fails;
  several handlers intentionally ignore persistence errors.
- Graph queries and simulation rely on project ownership filtering, while
  database-wide edges/nodes are stored in shared arrays.
- Node positions are frontend memory cache state, not persisted by the backend.
- There is no browser automation test for the Header button; backend graph/API
  integration tests cover the resulting example data and walk.
