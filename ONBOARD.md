# Pipeline Analyzer: Developer Onboarding

Read [INTRO.md](INTRO.md) first for the project's purpose, model, procedures, scenarios, and interpretation of results. This guide covers the repository and development workflow; it assumes those concepts are already familiar.

## Stack

- **Frontend:** React 19, TypeScript 6, Vite 8, Zustand 5, Tailwind CSS, and Oxlint. The graph is rendered on an HTML canvas, with D3 force simulation running in a Web Worker.
- **Backend:** Rust 2024, Axum, Tokio, Serde, and Tower HTTP CORS.
- **Persistence:** JSON file storage in the root `db.json`.
- **Development environment:** Nix flake provides Rust/Cargo, rust-analyzer, Clippy, rustfmt, Node.js 24, and pnpm. `justfile` defines the `dev` and `prod` recipes.

## Start the project

### With Nix

From the repository root, enter the development environment:

```sh
nix develop
```

Then start the backend and frontend in separate terminals as described below. If Just is installed and available, `just dev` runs both services, opens the frontend, and stops them when interrupted.

### Start services separately

In one terminal, from the repository root:

```sh
cargo run --manifest-path backend/Cargo.toml
```

In another terminal:

```sh
cd frontend
pnpm install
pnpm run dev
```

The frontend API client defaults to `http://127.0.0.1:3000`; it can be overridden with the frontend's `VITE_API_BASE_URL` environment variable.

## Build and check

Run backend commands from the repository root:

```sh
cargo build --manifest-path backend/Cargo.toml
cargo test --manifest-path backend/Cargo.toml
cargo clippy --manifest-path backend/Cargo.toml --all-targets
```

Run frontend commands from `frontend/`:

```sh
pnpm run build
pnpm run lint
```

`pnpm run test:api` is a live-backend API smoke script, not an isolated unit test; it needs a reachable backend and may create or modify records in `db.json`. Review the script before running it against data you care about.

## Repository map

```text
backend/
  src/
    attack/       Scenario parsing, route scopes, hop evaluation, traversal, result scoring
    database.rs   JSON database loading, access, and persistence
    schema.rs     Node categories, property definitions, and relationship schema
    lib.rs        API handlers and application state
    main.rs       HTTP routes and server startup
  tests/
    api_tests.rs  Backend API and example-graph integration coverage
    fixtures/     Golden response fixtures
frontend/
  src/
    api/          HTTP client, response mapping, live API smoke script
    components/   React interface, graph canvas, inspectors, trace controls
    engine/       Canvas graph rendering, interaction, layout worker, search, renderers
    store/        Zustand application and graph state
    types/        Shared frontend graph and API-facing types
    assets/       Frontend assets
db.json           Local JSON persistence for projects, nodes, and edges
flake.nix         Nix development shell
justfile          Development and production launch recipes
```

## Sources of truth and change boundaries

- Add or change node categories, property options/defaults, and valid relationship pairs in `backend/src/schema.rs`. The backend serves this schema; avoid maintaining a divergent frontend copy.
- Add or change scenario metadata and backend behavior in `backend/src/attack/mod.rs`. Keep backend scenario IDs and serialized response fields consistent with the DTO mapping in `frontend/src/api/client.ts` and frontend types in `frontend/src/types/graph.ts`.
- API route registration lives in `backend/src/main.rs`; handler behavior and validation live in `backend/src/lib.rs`.
- The frontend store in `frontend/src/store/graphStore.ts` loads backend metadata and holds project, selection, mode, and simulation state.
- `frontend/src/components/Header.tsx` defines the sample project graph. Update sample coverage and its expected fixture/test data together when changing that graph.
- `frontend/src/components/DetailsPanel.tsx` owns node/edge inspectors and attack trace presentation. `frontend/src/components/Prj1GraphCanvas.tsx` owns the canvas component and its UI overlays. Canvas drawing and pointer interaction belong in `frontend/src/engine/GraphEngine.ts`.
- `backend/tests/fixtures/chaindrop_golden.json` is a regression fixture for the ChainDrop trace from the sample dependency start. Review intentional output changes rather than regenerating it blindly.

## API map

The backend binds to `127.0.0.1:3000`.

| Route | Purpose |
| --- | --- |
| `GET /node-types` | Node category schemas, fields, options, and defaults |
| `GET /relationships` | Relationship IDs |
| `GET /relationships/validate` | Validates a source/target category pair |
| `GET /scenarios` | Scenario IDs and UI metadata: names, descriptions, allowed/default starting categories, and key controls |
| `GET /projects` | List projects |
| `POST /projects` | Create a project |
| `/projects/{project_id}` | Rename or delete a project |
| `GET /projects/{project_id}/graph` | Read a project's graph |
| `POST /projects/{project_id}/nodes` | Create a project node |
| `PATCH` or `DELETE /projects/{project_id}/nodes/{node_id}` | Update or delete a project node |
| `POST /projects/{project_id}/edges` | Create a project edge |
| `PATCH` or `DELETE /projects/{project_id}/edges/{edge_id}` | Update or delete a project edge |
| `POST /projects/{project_id}/attack` | Run a scenario against a project graph |

The frontend client adapts the backend's PascalCase JSON fields to the frontend's camelCase types. When adding response data, update both sides of this mapping.

## Scenario implementation reference

These are implementation identifiers and routing rules. The scenario intent and user-facing interpretation are documented in [INTRO.md](INTRO.md).

| ID | Accepted starting categories | Default starting category |
| --- | --- | --- |
| `ChainDrop` | `dependencies`, `identity_people` | `dependencies` |
| `BuildTamper` | `build_environment` | `build_environment` |
| `MaintainerTakeover` | `identity_people` | `identity_people` |

Scenario names are normalized by lowercasing and removing underscores, hyphens, and spaces. Unknown or empty values return HTTP 400 with `INVALID_SCENARIO`; the response echoes the submitted scenario string. Unknown starting nodes return `NODE_NOT_FOUND`; an unsupported starting category returns HTTP 400. ChainDrop-only response fields (`wormGenerations`, `exposedSecretIds`) are omitted for other scenarios.

ChainDrop traverses all outgoing relationships. BuildTamper and MaintainerTakeover use explicit `(relationship, target category)` allowlists:

**BuildTamper**

- `produces` or `publishes` → `artifact_storage`
- `provides` → `distribution` or `runtime_environment`
- `delivers` or `deploys` → `runtime_environment`
- `monitored_by` → `monitoring_response`

**MaintainerTakeover**

- `contributes_to` or `maintains` → `source_control`
- `triggers` → `cicd_pipeline`
- `publishes` → `artifact_storage`
- `provides` → `distribution` or `runtime_environment`
- `delivers` → `runtime_environment`
- `monitored_by` → `monitoring_response`

An excluded edge adds no trace step and does not affect a node outcome. These exclusions are intentional: other routes in the shared sample can bypass the route each scenario is meant to model.

The following schema additions are relevant to scenario behavior. Their canonical definitions remain in `backend/src/schema.rs`:

| Category | Property | Default |
| --- | --- | --- |
| `build_environment` | `reproducibleBuilds` | `false` |
| `source_control` | `requiredReviewers` | `None` |
| `cicd_pipeline` | `releaseSource` | `Uploaded tarball` |

Missing values use the same permissive defaults shown above.

## Sample graph and regression coverage

The **Load Sample** action creates the project `Pipeline Attack Demo (example)` with 12 nodes and 24 relationships. The first 23 relationships retain their original order; the last is `maintainer -contributes_to→ repo`. The final edge makes the maintainer-to-repository path available to both ChainDrop and MaintainerTakeover while preserving the intended scenario route scopes.

Backend integration coverage for the sample and API is in `backend/tests/api_tests.rs`. The ChainDrop trace fixture is `backend/tests/fixtures/chaindrop_golden.json`. If an implementation change intentionally affects a golden response, update the assertion and fixture with a clear explanation of the behavior change.

## Data and local state

The backend loads `db.json` relative to its current working directory. The root `just dev` recipe and the root `cargo run` command satisfy that expectation. Starting the binary from another directory can create or look for a different `db.json`.

The database file contains local project graph data. Check `git status` before and after running the app or live API script, and do not overwrite useful local data when resetting sample content.
