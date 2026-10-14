# Pipeline Analyzer summary

Pipeline Analyzer represents a software delivery pipeline as a graph and evaluates three attack scenarios over one shared sample. Scenario metadata is served by the backend and drives the frontend selector and start-node guidance.

## Scenarios

| Scenario ID | Name | Valid start categories | Default start category | Main control |
| --- | --- | --- | --- | --- |
| `ChainDrop` | ChainDrop npm Worm | `dependencies`, `identity_people` | `dependencies` | Release cooldown plus lockfile pin, or disabled lifecycle scripts |
| `BuildTamper` | Build Tamper (SolarWinds-style) | `build_environment` | `build_environment` | `reproducibleBuilds = true` |
| `MaintainerTakeover` | Maintainer Takeover (xz-style) | `identity_people` | `identity_people` | `releaseSource = Built from tag` |

Scenario strings are normalized by lowercasing and removing underscores, hyphens, and spaces. Unknown or empty strings return HTTP 400 with `INVALID_SCENARIO`. The response echoes the submitted scenario string. `ChainDrop` retains its existing trace semantics, including reverse credential harvest, republishes handling, worm generations, and exposed-secret IDs. Those ChainDrop-only result fields are omitted for the other scenarios.

### Edge scope

ChainDrop follows all edges. BuildTamper and MaintainerTakeover follow explicit `(relationship, target category)` allowlists. The sample graph has parallel routes: without scoping, MaintainerTakeover could take `maintains → dependencies` or `operates → cicd_pipeline`, then use deploy or build edges to bypass the review and release controls. An excluded edge records no step and changes no node outcome.

BuildTamper follows:

- `produces` or `publishes → artifact_storage`
- `provides → distribution` or `runtime_environment`
- `delivers` or `deploys → runtime_environment`
- `monitored_by → monitoring_response`

MaintainerTakeover follows:

- `contributes_to` or `maintains → source_control`
- `triggers → cicd_pipeline`
- `publishes → artifact_storage`
- `provides → distribution` or `runtime_environment`
- `delivers → runtime_environment`
- `monitored_by → monitoring_response`

The allowlists deliberately exclude other routes, including `operates`, `executes`, `produces` for MaintainerTakeover, `deploys` for MaintainerTakeover, `republishes`, `logs_to`, and `alerts`.

## Node properties

Schema options and defaults are provided by `GET /node-types`; clients do not maintain a duplicate schema.

| Category | Property | Type | Options | Default |
| --- | --- | --- | --- | --- |
| `build_environment` | `reproducibleBuilds` | boolean | — | `false` |
| `source_control` | `requiredReviewers` | select | `None`, `1 reviewer`, `2+ reviewers` | `None` |
| `cicd_pipeline` | `releaseSource` | select | `Uploaded tarball`, `Built from tag` | `Uploaded tarball` |

Missing values for these new properties use their permissive defaults: reproducible builds are off, no additional reviewer requirement is applied, and releases come from uploaded tarballs.

## Example graph

The **Load Sample** action creates the `Pipeline Attack Demo (example)` project with 12 nodes and 24 relationships. Its first 23 relationships retain their original order. The final relationship is `maintainer -contributes_to→ repo`.

That edge lets ChainDrop from the maintainer demonstrate the existing branch-protection control. For MaintainerTakeover, the path is scoped through reviewed source, CI, publication, distribution, runtime, and monitoring, so reviewer and release-source controls govern the modeled route.

## API endpoints

- `GET /node-types` returns node categories, properties, defaults, and options.
- `GET /relationships` returns relationship IDs.
- `GET /relationships/validate` checks a category pair and returns allowed relationships.
- `GET /scenarios` returns scenario IDs, names, descriptions, valid and default start categories, and key controls.
- `POST /projects/{id}/attack` runs a scenario against a project graph.
- Project, graph, node, and edge CRUD routes are defined under `/projects`.

Invalid scenario and invalid start category errors return HTTP 400. Unknown start nodes return `NODE_NOT_FOUND`; unknown scenarios return `INVALID_SCENARIO`.

## Repository map

- `backend/src/attack/mod.rs` contains scenario parsing, edge scoping, evaluators, traversal, and severity calculation.
- `backend/src/schema.rs` is the source of truth for node categories, property definitions, and valid relationships.
- `backend/src/lib.rs` implements API handlers; `backend/src/main.rs` registers routes.
- `backend/tests/api_tests.rs` covers schema, API behavior, and the shared example graph.
- `backend/tests/fixtures/chaindrop_golden.json` freezes the ChainDrop trace from `deps`.
- `frontend/src/api/client.ts` maps backend DTOs; `frontend/src/store/graphStore.ts` loads metadata and runs simulations.
- `frontend/src/components/Header.tsx` builds the sample; `frontend/src/components/DetailsPanel.tsx` provides scenario selection and trace UI.

## Verified status

- Backend API integration suite: 19 tests pass, with no ignored tests.
- Backend build succeeds. Clippy retains the T0 baseline warning set; no new warnings are introduced.
- Frontend production build succeeds. Lint reports the single existing immutability warning in `Prj1GraphCanvas.tsx`.
- The ChainDrop golden fixture remains unchanged after adding the 24th edge and the new scenarios.
