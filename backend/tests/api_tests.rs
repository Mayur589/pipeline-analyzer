use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::AtomicU64;
use std::sync::atomic::Ordering;

use axum::Json;
use axum::extract::Path;
use axum::extract::Query;
use axum::extract::State;
use backend::AppState;
use backend::CreateEdge;
use backend::CreateNode;
use backend::CreateProject;
use backend::EditEdge;
use backend::EditNode;
use backend::EditProject;
use backend::SimulateAttack;
use backend::ValidateRelationshipQuery;
use backend::attack::simulate_attack;
use backend::create_edge;
use backend::create_node;
use backend::create_project;
use backend::database::DatabaseStore;
use backend::delete_edge;
use backend::delete_node;
use backend::delete_project;
use backend::edit_edge;
use backend::edit_node;
use backend::edit_project;
use backend::get_graph;
use backend::get_node_categories;
use backend::get_projects;
use backend::get_relationships;
use backend::get_scenarios;
use backend::simulate_attack_handler;
use backend::types::ApiError;
use backend::types::AttackSimulationResult;
use backend::types::Edge;
use backend::types::Graph;
use backend::types::Node;
use backend::types::PropertyField;
use backend::types::StepOutcome;
use backend::validate_relationship;

async fn setup_test_state() -> AppState {
    static TEST_DB_COUNTER: AtomicU64 = AtomicU64::new(0);
    let temp_dir = std::env::temp_dir();
    let db_path = temp_dir.join(format!(
        "test_db_{}_{}.json",
        std::process::id(),
        TEST_DB_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let _ = tokio::fs::remove_file(&db_path).await;

    AppState {
        db: Arc::new(
            DatabaseStore::load(&db_path)
                .await
                .expect("test db should load"),
        ),
    }
}

#[tokio::test]
async fn test_node_categories_and_relationships() {
    let state = setup_test_state().await;

    let Json(categories) = get_node_categories(State(state.clone()))
        .await
        .expect("node categories should return");
    assert_eq!(categories.len(), 10);

    let Json(relationships) = get_relationships(State(state))
        .await
        .expect("relationships should return");
    assert_eq!(relationships.len(), 22);
    assert!(relationships.contains(&String::from("triggers")));
    assert!(relationships.contains(&String::from("deploys")));
    assert!(relationships.contains(&String::from("republishes")));
}

#[tokio::test]
async fn test_three_scenario_property_definitions() {
    let state = setup_test_state().await;
    let Json(categories) = get_node_categories(State(state))
        .await
        .expect("node categories should return");
    let field = |category_id: &str, property_key: &str| {
        categories
            .iter()
            .find(|category| category.id == category_id)
            .and_then(|category| {
                category
                    .field_defs
                    .iter()
                    .find(|field| field.key == property_key)
            })
            .expect("scenario property should exist")
    };

    let reproducible = field("build_environment", "reproducibleBuilds");
    assert_eq!(reproducible.ty, PropertyField::String("boolean".into()));
    assert_eq!(
        reproducible.default_value,
        Some(PropertyField::Boolean(false))
    );
    assert_eq!(reproducible.options, None);

    let reviewers = field("source_control", "requiredReviewers");
    assert_eq!(reviewers.ty, PropertyField::String("select".into()));
    assert_eq!(
        reviewers.options,
        Some(vec![
            "None".into(),
            "1 reviewer".into(),
            "2+ reviewers".into()
        ])
    );
    assert_eq!(
        reviewers.default_value,
        Some(PropertyField::String("None".into()))
    );

    let release = field("cicd_pipeline", "releaseSource");
    assert_eq!(release.ty, PropertyField::String("select".into()));
    assert_eq!(
        release.options,
        Some(vec!["Uploaded tarball".into(), "Built from tag".into()])
    );
    assert_eq!(
        release.default_value,
        Some(PropertyField::String("Uploaded tarball".into()))
    );
}

#[tokio::test]
async fn test_scenarios_endpoint_metadata() {
    let state = setup_test_state().await;
    let Json(scenarios) = get_scenarios(State(state.clone()))
        .await
        .expect("scenarios should return");
    assert_eq!(scenarios.len(), 3);
    assert_eq!(
        scenarios
            .iter()
            .map(|scenario| scenario.id.as_str())
            .collect::<Vec<_>>(),
        vec!["ChainDrop", "BuildTamper", "MaintainerTakeover"]
    );
    let Json(categories) = get_node_categories(State(state))
        .await
        .expect("node categories should return");
    for scenario in scenarios {
        for category_id in scenario
            .valid_start_categories
            .iter()
            .chain(core::iter::once(&scenario.default_start_category))
        {
            assert!(
                categories
                    .iter()
                    .any(|category| category.id == *category_id)
            );
        }
        for control in scenario.key_controls {
            assert!(categories.iter().any(|category| {
                category.id == control.category_id
                    && category
                        .field_defs
                        .iter()
                        .any(|field| field.key == control.property_key)
            }));
        }
    }
}

#[tokio::test]
async fn test_validate_relationship() {
    let state = setup_test_state().await;

    let valid_query = ValidateRelationshipQuery {
        source_category: String::from("source_control"),
        target_category: String::from("cicd_pipeline"),
    };
    let Json(rels) = validate_relationship(State(state.clone()), Query(valid_query))
        .await
        .expect("valid relationship query should succeed");
    assert_eq!(rels, vec![String::from("triggers")]);

    let invalid_query = ValidateRelationshipQuery {
        source_category: String::from("source_control"),
        target_category: String::from("runtime_environment"),
    };
    let err = validate_relationship(State(state), Query(invalid_query))
        .await
        .expect_err("invalid relationship connection should fail");
    assert!(matches!(err, ApiError::InvalidCategoryConnection));
}

#[tokio::test]
async fn test_chaindrop_relationship_pairs() {
    let state = setup_test_state().await;
    let Json(project) = create_project(
        State(state.clone()),
        Json(CreateProject {
            name: "new relationship edges".into(),
        }),
    )
    .await
    .expect("project should be created");
    for (source_category, target_category, expected) in [
        ("dependencies", "identity_people", "consumed_by"),
        ("identity_people", "dependencies", "maintains"),
        ("cicd_pipeline", "dependencies", "republishes"),
    ] {
        let Json(rels) = validate_relationship(
            State(state.clone()),
            Query(ValidateRelationshipQuery {
                source_category: source_category.into(),
                target_category: target_category.into(),
            }),
        )
        .await
        .expect("new category pair should validate");
        assert!(rels.iter().any(|rel| rel == expected));

        let Json(source) = create_node(
            State(state.clone()),
            Path(project.id.clone()),
            Json(CreateNode {
                category_id: source_category.into(),
                properties: HashMap::new(),
            }),
        )
        .await
        .expect("source node should be created");
        let Json(target) = create_node(
            State(state.clone()),
            Path(project.id.clone()),
            Json(CreateNode {
                category_id: target_category.into(),
                properties: HashMap::new(),
            }),
        )
        .await
        .expect("target node should be created");
        let Json(edge) = create_edge(
            State(state.clone()),
            Path(project.id.clone()),
            Json(CreateEdge {
                source_node_id: source.id,
                target_node_id: target.id,
                relationship: expected.into(),
            }),
        )
        .await
        .expect("new relationship edge should be created through the handler");
        assert_eq!(edge.relationship, expected);
    }
    let err = validate_relationship(
        State(state),
        Query(ValidateRelationshipQuery {
            source_category: "source_control".into(),
            target_category: "secrets_credentials".into(),
        }),
    )
    .await
    .expect_err("unrelated pair should remain invalid");
    assert!(matches!(err, ApiError::InvalidCategoryConnection));
}

#[tokio::test]
async fn test_chaindrop_start_node_validation() {
    let state = setup_test_state().await;
    let Json(project) = create_project(
        State(state.clone()),
        Json(CreateProject {
            name: "start validation".into(),
        }),
    )
    .await
    .expect("project should be created");
    let Json(source) = create_node(
        State(state.clone()),
        Path(project.id.clone()),
        Json(CreateNode {
            category_id: "source_control".into(),
            properties: HashMap::new(),
        }),
    )
    .await
    .expect("source control node should be created");
    let error = simulate_attack_handler(
        State(state),
        Path(project.id),
        Json(SimulateAttack {
            start_node_id: source.id,
            scenario: "ChainDrop".into(),
        }),
    )
    .await
    .expect_err("ChainDrop rejects a source control start");
    assert!(matches!(error, ApiError::InvalidStartNode));
}

async fn run_chaindrop_example_graph_regression() {
    let state = setup_test_state().await;
    let Json(project) = create_project(
        State(state.clone()),
        Json(CreateProject {
            name: "Pipeline Attack Demo (example)".into(),
        }),
    )
    .await
    .expect("project should be created");

    let nodes = [
        (
            "maintainer",
            "identity_people",
            vec![("name", "Package Maintainer")],
            vec![("mfaEnabled", false)],
        ),
        (
            "dev",
            "identity_people",
            vec![("name", "Developer Workstation")],
            vec![("mfaEnabled", true)],
        ),
        (
            "deps",
            "dependencies",
            vec![
                ("name", "npm: cache-utils"),
                ("lifecycleScripts", "Enabled"),
                ("releaseCooldown", "None"),
                ("packageManager", "npm / yarn / pnpm"),
            ],
            vec![("lockfilePinned", false), ("vulnerabilityScanning", true)],
        ),
        (
            "deps2",
            "dependencies",
            vec![
                ("name", "npm: downstream-app"),
                ("lifecycleScripts", "Enabled"),
                ("releaseCooldown", "None"),
                ("packageManager", "npm / yarn / pnpm"),
            ],
            vec![("lockfilePinned", false), ("vulnerabilityScanning", true)],
        ),
        (
            "repo",
            "source_control",
            vec![("name", "app-repo"), ("visibility", "Private")],
            vec![("branchProtection", true)],
        ),
        (
            "build",
            "build_environment",
            vec![
                ("name", "Shared CI Runner"),
                ("isolationLevel", "Shared Node"),
            ],
            vec![],
        ),
        (
            "ci",
            "cicd_pipeline",
            vec![("name", "Release Workflow")],
            vec![("trustedPublishing", true), ("approvalRequired", false)],
        ),
        (
            "token",
            "secrets_credentials",
            vec![
                ("name", "npm Publish Token"),
                ("tokenScope", "Publish + 2FA Bypass"),
                ("vaultType", "HashiCorp Vault"),
            ],
            vec![("autoRevoke", false)],
        ),
        (
            "registry",
            "artifact_storage",
            vec![
                ("name", "Internal Registry"),
                ("registryType", "Harbor OCI Registry"),
            ],
            vec![("signatureVerification", true), ("immutableTags", true)],
        ),
        (
            "dist",
            "distribution",
            vec![("name", "CDN"), ("channel", "Public CDN")],
            vec![("integrityCheck", true)],
        ),
        (
            "prod",
            "runtime_environment",
            vec![
                ("name", "Production Cluster"),
                ("environmentType", "Production"),
            ],
            vec![("enforceZeroTrust", false)],
        ),
        (
            "siem",
            "monitoring_response",
            vec![
                ("name", "SIEM"),
                ("alertThreshold", "Strict Policy Violations"),
            ],
            vec![],
        ),
    ];
    let mut ids = HashMap::new();
    for (key, category_id, strings, booleans) in nodes {
        let mut properties = HashMap::new();
        for (key, value) in strings {
            properties.insert(key.into(), PropertyField::String(value.into()));
        }
        for (key, value) in booleans {
            properties.insert(key.into(), PropertyField::Boolean(value));
        }
        let Json(node) = create_node(
            State(state.clone()),
            Path(project.id.clone()),
            Json(CreateNode {
                category_id: category_id.into(),
                properties,
            }),
        )
        .await
        .expect("example node should be created");
        ids.insert(key, node.id);
    }

    let edge_specs = [
        ("maintainer", "maintains", "deps"),
        ("maintainer", "operates", "ci"),
        ("repo", "references", "deps"),
        ("repo", "triggers", "ci"),
        ("repo", "provides_source", "build"),
        // Build consumer first so its harvest occurs before the developer reaches the token.
        ("deps", "consumed_by", "build"),
        ("deps", "consumed_by", "dev"),
        ("deps2", "consumed_by", "dev"),
        ("dev", "accesses", "token"),
        ("token", "authenticates", "build"),
        ("token", "authenticates", "ci"),
        ("ci", "executes", "build"),
        ("ci", "publishes", "registry"),
        ("ci", "republishes", "deps"),
        ("ci", "republishes", "deps2"),
        ("ci", "deploys", "prod"),
        ("build", "produces", "registry"),
        ("build", "logs_to", "siem"),
        ("registry", "provides", "dist"),
        ("registry", "provides", "prod"),
        ("dist", "delivers", "prod"),
        ("prod", "monitored_by", "siem"),
        ("siem", "alerts", "dev"),
        ("maintainer", "contributes_to", "repo"),
    ];
    for (source, relationship, target) in edge_specs {
        let Json(edge) = create_edge(
            State(state.clone()),
            Path(project.id.clone()),
            Json(CreateEdge {
                source_node_id: ids[source].clone(),
                target_node_id: ids[target].clone(),
                relationship: relationship.into(),
            }),
        )
        .await
        .unwrap_or_else(|error| {
            panic!("example edge {source} -{relationship}-> {target} rejected: {error:?}")
        });
        assert_eq!(edge.relationship, relationship);
    }

    let simulate = || {
        simulate_attack_handler(
            State(state.clone()),
            Path(project.id.clone()),
            Json(SimulateAttack {
                start_node_id: ids["deps"].clone(),
                scenario: "ChainDrop".into(),
            }),
        )
    };
    let Json(result) = simulate().await.expect("example attack should simulate");
    let key_for_id = |id: &str| {
        ids.iter()
            .find_map(|(key, value)| (value == id).then_some(*key))
            .expect("golden result node id should have an example key")
    };
    let mut compromised_keys = result
        .compromised_node_ids
        .iter()
        .map(|id| key_for_id(id))
        .collect::<Vec<_>>();
    compromised_keys.sort_unstable();
    let mut blocked_keys = result
        .blocked_node_ids
        .iter()
        .map(|id| key_for_id(id))
        .collect::<Vec<_>>();
    blocked_keys.sort_unstable();
    let golden = serde_json::json!({
        "Steps": result.steps.iter().map(|step| serde_json::json!({
            "Source": key_for_id(&step.source_node_id),
            "Relationship": step.relationship,
            "Target": key_for_id(&step.target_node_id),
            "Outcome": step.outcome,
            "Phase": step.phase,
            "Reverse": step.reverse,
        })).collect::<Vec<_>>(),
        "Compromised": compromised_keys,
        "Blocked": blocked_keys,
        "DetectedAtStep": result.detected_at_step,
        "WormGenerations": result.worm_generations,
        "ExposedSecretIds": result.exposed_secret_ids.as_ref().map(|values| {
            let mut keys = values.iter().map(|id| key_for_id(id)).collect::<Vec<_>>();
            keys.sort_unstable();
            keys
        }),
        "Severity": result.overall_severity,
    });
    let expected: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/chaindrop_golden.json"))
            .expect("golden fixture is valid JSON");
    assert_eq!(golden, expected, "ChainDrop deps trace changed");
    let find_step = |source: &str, relationship: &str, target: &str| {
        result.steps.iter().find(|step| {
            step.source_node_id == ids[source]
                && step.relationship == relationship
                && step.target_node_id == ids[target]
        })
    };
    assert_eq!(
        find_step("deps", "consumed_by", "dev").unwrap().outcome,
        StepOutcome::Compromised
    );
    assert_eq!(
        find_step("deps", "consumed_by", "build").unwrap().outcome,
        StepOutcome::Compromised
    );
    let harvest = find_step("build", "authenticates", "token").expect("reverse harvest step");
    assert_eq!(harvest.reverse, Some(true));
    assert_eq!(harvest.outcome, StepOutcome::Compromised);
    assert_eq!(
        find_step("token", "authenticates", "ci").unwrap().outcome,
        StepOutcome::Compromised
    );
    assert_eq!(
        find_step("ci", "publishes", "registry").unwrap().outcome,
        StepOutcome::Compromised
    );
    assert_eq!(
        find_step("registry", "provides", "dist").unwrap().outcome,
        StepOutcome::Compromised
    );
    assert_eq!(
        find_step("registry", "provides", "prod").unwrap().outcome,
        StepOutcome::Compromised
    );
    assert!(find_step("ci", "republishes", "deps").is_some());
    assert_eq!(
        find_step("ci", "republishes", "deps2").unwrap().outcome,
        StepOutcome::Compromised
    );
    assert_eq!(
        result
            .steps
            .iter()
            .filter(|step| step.relationship == "republishes")
            .count(),
        2
    );
    assert!(result.compromised_node_ids.contains(&ids["deps2"]));
    assert_eq!(
        find_step("prod", "monitored_by", "siem").unwrap().outcome,
        StepOutcome::Detected
    );
    assert!(find_step("siem", "alerts", "dev").is_some());
    assert!(result.overall_severity.score < 10.0);
    assert!(result.worm_generations.unwrap_or_default() >= 1);
    assert!(result.exposed_secret_ids.unwrap().contains(&ids["token"]));

    let mut deps_disabled = HashMap::new();
    deps_disabled.insert(
        "lifecycleScripts".into(),
        PropertyField::String("Disabled".into()),
    );
    let Json(_) = edit_node(
        State(state.clone()),
        Path((project.id.clone(), ids["deps"].clone())),
        Json(EditNode {
            properties: deps_disabled,
        }),
    )
    .await
    .expect("disable lifecycle scripts");
    let Json(disabled) = simulate().await.expect("disabled attack should simulate");
    assert!(
        disabled
            .steps
            .iter()
            .filter(|step| step.source_node_id == ids["deps"] && step.relationship == "consumed_by")
            .all(|step| step.outcome == StepOutcome::Blocked)
    );
    assert_eq!(disabled.compromised_node_ids, vec![ids["deps"].clone()]);

    let mut ci_untrusted = HashMap::new();
    ci_untrusted.insert("trustedPublishing".into(), PropertyField::Boolean(false));
    let Json(_) = edit_node(
        State(state.clone()),
        Path((project.id.clone(), ids["ci"].clone())),
        Json(EditNode {
            properties: ci_untrusted,
        }),
    )
    .await
    .expect("disable trusted publishing");
    let mut deps_enabled = HashMap::new();
    deps_enabled.insert(
        "lifecycleScripts".into(),
        PropertyField::String("Enabled".into()),
    );
    let Json(_) = edit_node(
        State(state.clone()),
        Path((project.id.clone(), ids["deps"].clone())),
        Json(EditNode {
            properties: deps_enabled,
        }),
    )
    .await
    .expect("restore lifecycle scripts");
    let Json(untrusted) = simulate()
        .await
        .expect("untrusted publishing attack should simulate");
    assert!(
        untrusted
            .steps
            .iter()
            .any(|step| step.source_node_id == ids["ci"]
                && step.relationship == "publishes"
                && step.target_node_id == ids["registry"]
                && step.outcome == StepOutcome::Blocked)
    );

    let mut read_only = HashMap::new();
    read_only.insert(
        "tokenScope".into(),
        PropertyField::String("Read-only".into()),
    );
    read_only.insert(
        "vaultType".into(),
        PropertyField::String("HashiCorp Vault".into()),
    );
    read_only.insert("autoRevoke".into(), PropertyField::Boolean(false));
    let Json(_) = edit_node(
        State(state.clone()),
        Path((project.id.clone(), ids["token"].clone())),
        Json(EditNode {
            properties: read_only,
        }),
    )
    .await
    .expect("reduce token scope");
    let Json(read_only_result) = simulate().await.expect("read-only attack should simulate");
    assert!(
        read_only_result
            .steps
            .iter()
            .any(|step| step.relationship == "republishes" && step.outcome == StepOutcome::Blocked)
    );

    let mut ci_trusted = HashMap::new();
    ci_trusted.insert("trustedPublishing".into(), PropertyField::Boolean(true));
    let Json(_) = edit_node(
        State(state.clone()),
        Path((project.id.clone(), ids["ci"].clone())),
        Json(EditNode {
            properties: ci_trusted,
        }),
    )
    .await
    .expect("restore trusted publishing");
    let mut token_original = HashMap::new();
    token_original.insert(
        "tokenScope".into(),
        PropertyField::String("Publish + 2FA Bypass".into()),
    );
    token_original.insert(
        "vaultType".into(),
        PropertyField::String("HashiCorp Vault".into()),
    );
    token_original.insert("autoRevoke".into(), PropertyField::Boolean(false));
    let Json(_) = edit_node(
        State(state.clone()),
        Path((project.id.clone(), ids["token"].clone())),
        Json(EditNode {
            properties: token_original,
        }),
    )
    .await
    .expect("restore original token settings");

    run_three_scenario_example_cases(state, project.id, ids).await;
}

async fn edit_example_property(
    state: &AppState,
    project_id: &str,
    node_id: &str,
    property_key: &str,
    value: PropertyField,
) {
    let Json(_) = edit_node(
        State(state.clone()),
        Path((project_id.to_string(), node_id.to_string())),
        Json(EditNode {
            properties: HashMap::from([(property_key.into(), value)]),
        }),
    )
    .await
    .expect("example property should be editable");
}

async fn simulate_example_case(
    state: &AppState,
    project_id: &str,
    start_node_id: &str,
    scenario: &str,
) -> AttackSimulationResult {
    let Json(result) = simulate_attack_handler(
        State(state.clone()),
        Path(project_id.to_string()),
        Json(SimulateAttack {
            start_node_id: start_node_id.to_string(),
            scenario: scenario.to_string(),
        }),
    )
    .await
    .expect("example scenario should simulate");
    result
}

#[allow(clippy::too_many_lines)]
async fn run_three_scenario_example_cases(
    state: AppState,
    project_id: String,
    ids: HashMap<&str, String>,
) {
    let key_for_id = |id: &str| {
        ids.iter()
            .find_map(|(key, value)| (value == id).then_some(*key))
            .expect("example node id has a key")
    };
    let trace_keys = |result: &AttackSimulationResult| {
        result
            .steps
            .iter()
            .map(|step| {
                (
                    key_for_id(&step.source_node_id).to_string(),
                    step.relationship.clone(),
                    key_for_id(&step.target_node_id).to_string(),
                    step.outcome,
                )
            })
            .collect::<Vec<_>>()
    };
    let expected_trace = |entries: Vec<(&str, &str, &str, StepOutcome)>| {
        entries
            .into_iter()
            .map(|(source, relationship, target, outcome)| {
                (source.into(), relationship.into(), target.into(), outcome)
            })
            .collect::<Vec<_>>()
    };
    let compromised_keys = |result: &AttackSimulationResult| {
        let mut keys = result
            .compromised_node_ids
            .iter()
            .map(|id| key_for_id(id))
            .collect::<Vec<_>>();
        keys.sort_unstable();
        keys
    };
    let blocked_keys = |result: &AttackSimulationResult| {
        let mut keys = result
            .blocked_node_ids
            .iter()
            .map(|id| key_for_id(id))
            .collect::<Vec<_>>();
        keys.sort_unstable();
        keys
    };

    let chain = simulate_example_case(&state, &project_id, &ids["maintainer"], "ChainDrop").await;
    assert!(chain.steps.iter().any(|step| {
        step.source_node_id == ids["maintainer"]
            && step.relationship == "contributes_to"
            && step.target_node_id == ids["repo"]
            && step.outcome == StepOutcome::Blocked
    }));

    let case_a = simulate_example_case(&state, &project_id, &ids["build"], "BuildTamper").await;
    assert_eq!(
        trace_keys(&case_a),
        expected_trace(vec![
            ("build", "produces", "registry", StepOutcome::Compromised),
            ("registry", "provides", "dist", StepOutcome::Compromised),
            ("registry", "provides", "prod", StepOutcome::Compromised),
            ("dist", "delivers", "prod", StepOutcome::Compromised),
            ("prod", "monitored_by", "siem", StepOutcome::Compromised),
        ])
    );
    assert_eq!(
        compromised_keys(&case_a),
        vec!["build", "dist", "prod", "registry", "siem"]
    );
    assert!(blocked_keys(&case_a).is_empty());
    assert_eq!(case_a.detected_at_step, None);
    assert!((case_a.overall_severity.score - 4.17).abs() < 0.01);

    edit_example_property(
        &state,
        &project_id,
        &ids["build"],
        "reproducibleBuilds",
        PropertyField::Boolean(true),
    )
    .await;
    let case_b = simulate_example_case(&state, &project_id, &ids["build"], "BuildTamper").await;
    assert_eq!(
        trace_keys(&case_b),
        expected_trace(vec![(
            "build",
            "produces",
            "registry",
            StepOutcome::Blocked
        )])
    );
    assert_eq!(compromised_keys(&case_b), vec!["build"]);
    assert_eq!(blocked_keys(&case_b), vec!["registry"]);
    assert_eq!(case_b.detected_at_step, None);
    assert!((case_b.overall_severity.score - 0.83).abs() < 0.01);
    edit_example_property(
        &state,
        &project_id,
        &ids["build"],
        "reproducibleBuilds",
        PropertyField::Boolean(false),
    )
    .await;

    edit_example_property(
        &state,
        &project_id,
        &ids["siem"],
        "alertThreshold",
        PropertyField::String("All Anomalies (Zero-Tolerance)".into()),
    )
    .await;
    let case_c = simulate_example_case(&state, &project_id, &ids["build"], "BuildTamper").await;
    assert_eq!(case_c.steps.len(), 5);
    assert_eq!(case_c.steps[4].outcome, StepOutcome::Detected);
    assert_eq!(case_c.detected_at_step, Some(4));
    assert_eq!(
        compromised_keys(&case_c),
        vec!["build", "dist", "prod", "registry", "siem"]
    );
    assert!((case_c.overall_severity.score - 2.92).abs() < 0.01);
    edit_example_property(
        &state,
        &project_id,
        &ids["siem"],
        "alertThreshold",
        PropertyField::String("Strict Policy Violations".into()),
    )
    .await;

    let case_d = simulate_example_case(
        &state,
        &project_id,
        &ids["maintainer"],
        "MaintainerTakeover",
    )
    .await;
    assert_eq!(
        trace_keys(&case_d),
        expected_trace(vec![
            (
                "maintainer",
                "contributes_to",
                "repo",
                StepOutcome::Compromised
            ),
            ("repo", "triggers", "ci", StepOutcome::Compromised),
            ("ci", "publishes", "registry", StepOutcome::Compromised),
            ("registry", "provides", "dist", StepOutcome::Compromised),
            ("registry", "provides", "prod", StepOutcome::Compromised),
            ("dist", "delivers", "prod", StepOutcome::Compromised),
            ("prod", "monitored_by", "siem", StepOutcome::Compromised),
        ])
    );
    assert_eq!(
        compromised_keys(&case_d),
        vec![
            "ci",
            "dist",
            "maintainer",
            "prod",
            "registry",
            "repo",
            "siem"
        ]
    );
    assert!(blocked_keys(&case_d).is_empty());
    assert_eq!(case_d.detected_at_step, None);
    assert!((case_d.overall_severity.score - 5.83).abs() < 0.01);

    edit_example_property(
        &state,
        &project_id,
        &ids["repo"],
        "requiredReviewers",
        PropertyField::String("2+ reviewers".into()),
    )
    .await;
    let case_e = simulate_example_case(
        &state,
        &project_id,
        &ids["maintainer"],
        "MaintainerTakeover",
    )
    .await;
    assert_eq!(case_e.steps.len(), 7);
    assert_eq!(case_e.steps[0].outcome, StepOutcome::Slowed);
    assert_eq!(compromised_keys(&case_e), compromised_keys(&case_d));
    assert_eq!(case_e.detected_at_step, None);
    assert!((case_e.overall_severity.score - 5.83).abs() < 0.01);
    edit_example_property(
        &state,
        &project_id,
        &ids["repo"],
        "requiredReviewers",
        PropertyField::String("None".into()),
    )
    .await;

    edit_example_property(
        &state,
        &project_id,
        &ids["ci"],
        "releaseSource",
        PropertyField::String("Built from tag".into()),
    )
    .await;
    let case_f = simulate_example_case(
        &state,
        &project_id,
        &ids["maintainer"],
        "MaintainerTakeover",
    )
    .await;
    assert_eq!(case_f.steps.len(), 3);
    assert_eq!(case_f.steps[2].outcome, StepOutcome::Blocked);
    assert_eq!(compromised_keys(&case_f), vec!["ci", "maintainer", "repo"]);
    assert_eq!(blocked_keys(&case_f), vec!["registry"]);
    assert_eq!(case_f.detected_at_step, None);
    assert!((case_f.overall_severity.score - 2.5).abs() < 0.01);
    edit_example_property(
        &state,
        &project_id,
        &ids["ci"],
        "releaseSource",
        PropertyField::String("Uploaded tarball".into()),
    )
    .await;
}

#[tokio::test]
async fn test_chaindrop_example_graph_validates_and_simulates() {
    run_chaindrop_example_graph_regression().await;
}

#[tokio::test]
async fn test_chaindrop_golden_trace() {
    run_chaindrop_example_graph_regression().await;
}

fn chain_node(id: &str, category: &str, properties: HashMap<String, PropertyField>) -> Node {
    Node {
        id: id.into(),
        category_id: category.into(),
        properties,
    }
}

fn chain_graph() -> Graph {
    let nodes = vec![
        chain_node("D", "dependencies", HashMap::new()),
        chain_node("W", "identity_people", HashMap::new()),
        chain_node("B", "build_environment", HashMap::new()),
        chain_node("S", "secrets_credentials", HashMap::new()),
        chain_node("C", "cicd_pipeline", HashMap::new()),
        chain_node("A", "artifact_storage", HashMap::new()),
        chain_node("R", "runtime_environment", HashMap::new()),
        chain_node("M", "monitoring_response", HashMap::new()),
    ];
    let pairs = [
        ("D", "W", "consumed_by"),
        ("D", "B", "consumed_by"),
        ("S", "B", "authenticates"),
        ("S", "C", "authenticates"),
        ("C", "A", "publishes"),
        ("C", "D", "republishes"),
        ("A", "R", "provides"),
        ("B", "M", "logs_to"),
    ];
    Graph {
        project_id: "p".into(),
        nodes,
        edges: pairs
            .iter()
            .enumerate()
            .map(|(i, (source, target, rel))| Edge {
                id: format!("e{i}"),
                source_node_id: (*source).into(),
                target_node_id: (*target).into(),
                relationship: (*rel).into(),
            })
            .collect(),
    }
}

fn prop_string(node: &mut Node, key: &str, value: &str) {
    node.properties
        .insert(key.into(), PropertyField::String(value.into()));
}

fn prop_bool(node: &mut Node, key: &str, value: bool) {
    node.properties
        .insert(key.into(), PropertyField::Boolean(value));
}

#[test]
fn test_chaindrop_unmitigated() {
    let graph = chain_graph();
    let result = simulate_attack(&graph, "a".into(), "D", "ChainDrop").expect("valid ChainDrop");
    for id in ["D", "W", "B", "S", "C", "A", "R"] {
        assert!(
            result.compromised_node_ids.iter().any(|found| found == id),
            "{id}"
        );
    }
    assert!(
        result
            .steps
            .iter()
            .any(|step| step.phase.as_deref() == Some("harvest") && step.reverse == Some(true))
    );
    assert!(
        result
            .steps
            .iter()
            .any(|step| step.relationship == "republishes")
    );
    assert!(result.worm_generations.unwrap_or_default() >= 1);
    assert_eq!(
        result.compromised_node_ids,
        simulate_attack(&graph, "b".into(), "D", "ChainDrop")
            .expect("valid ChainDrop")
            .compromised_node_ids
    );
    assert!(matches!(
        simulate_attack(&graph, "g".into(), "D", "nonsense"),
        Err(ApiError::InvalidScenario)
    ));
    assert!(matches!(
        simulate_attack(&graph, "g".into(), "D", ""),
        Err(ApiError::InvalidScenario)
    ));
}

#[test]
fn test_scenario_parsing_and_start_categories() {
    use backend::attack::ScenarioKind;

    for alias in ["ChainDrop", "chain_drop", "CHAINDROP"] {
        assert_eq!(ScenarioKind::parse(alias), Some(ScenarioKind::ChainDrop));
    }
    for alias in ["BuildTamper", "build_tamper"] {
        assert_eq!(ScenarioKind::parse(alias), Some(ScenarioKind::BuildTamper));
    }
    for alias in ["MaintainerTakeover", "maintainer-takeover"] {
        assert_eq!(
            ScenarioKind::parse(alias),
            Some(ScenarioKind::MaintainerTakeover)
        );
    }

    let graph = chain_graph();
    for (start, scenario) in [
        ("B", "ChainDrop"),
        ("C", "BuildTamper"),
        ("D", "BuildTamper"),
        ("D", "MaintainerTakeover"),
        ("B", "MaintainerTakeover"),
    ] {
        assert!(matches!(
            simulate_attack(&graph, "invalid-start".into(), start, scenario),
            Err(ApiError::InvalidStartNode)
        ));
    }
}

#[test]
fn test_build_tamper_paths_and_permissive_missing_control() {
    let mut graph = Graph {
        project_id: "p".into(),
        nodes: vec![
            chain_node("B", "build_environment", HashMap::new()),
            chain_node(
                "A",
                "artifact_storage",
                HashMap::from([("signatureVerification".into(), PropertyField::Boolean(true))]),
            ),
            chain_node("R", "runtime_environment", HashMap::new()),
            chain_node(
                "M",
                "monitoring_response",
                HashMap::from([(
                    "alertThreshold".into(),
                    PropertyField::String("Strict Policy Violations".into()),
                )]),
            ),
        ],
        edges: vec![
            Edge {
                id: "e1".into(),
                source_node_id: "B".into(),
                target_node_id: "A".into(),
                relationship: "produces".into(),
            },
            Edge {
                id: "e2".into(),
                source_node_id: "A".into(),
                target_node_id: "R".into(),
                relationship: "provides".into(),
            },
            Edge {
                id: "e3".into(),
                source_node_id: "R".into(),
                target_node_id: "M".into(),
                relationship: "monitored_by".into(),
            },
        ],
    };

    let result =
        simulate_attack(&graph, "a".into(), "B", "BuildTamper").expect("valid BuildTamper");
    assert_eq!(result.steps.len(), 3);
    assert_eq!(result.steps[0].outcome, StepOutcome::Compromised);
    assert!(result.steps[0].reason.contains("validly signed"));
    assert!(result.steps[0].controls_triggered[0].contains("signatureVerification"));
    assert_eq!(result.steps[1].outcome, StepOutcome::Compromised);
    assert_eq!(result.steps[2].outcome, StepOutcome::Compromised);
    assert_eq!(result.steps[0].phase.as_deref(), Some("execution"));
    assert!(result.steps.iter().all(|step| step.reverse.is_none()));
    let json = serde_json::to_value(&result).expect("result serializes");
    assert!(json.get("WormGenerations").is_none());
    assert!(json.get("ExposedSecretIds").is_none());

    graph.nodes[0]
        .properties
        .insert("reproducibleBuilds".into(), PropertyField::Boolean(true));
    let blocked =
        simulate_attack(&graph, "b".into(), "B", "BuildTamper").expect("valid BuildTamper");
    assert_eq!(blocked.steps.len(), 1);
    assert_eq!(blocked.steps[0].outcome, StepOutcome::Blocked);
    assert_eq!(
        blocked.steps[0].controls_triggered,
        vec!["reproducibleBuilds"]
    );
    assert_eq!(blocked.blocked_node_ids, vec!["A"]);

    graph.nodes[0].properties.clear();
    graph.nodes[3].properties.insert(
        "alertThreshold".into(),
        PropertyField::String("All Anomalies (Zero-Tolerance)".into()),
    );
    let detected =
        simulate_attack(&graph, "c".into(), "B", "BuildTamper").expect("valid BuildTamper");
    assert_eq!(detected.steps.len(), 3);
    assert_eq!(detected.steps[2].outcome, StepOutcome::Detected);
    assert_eq!(detected.detected_at_step, Some(2));
}

#[test]
fn test_takeover_rules_and_edge_scoping() {
    let make_graph = |reviewers: Option<&str>| {
        let mut repo_properties =
            HashMap::from([("branchProtection".into(), PropertyField::Boolean(true))]);
        if let Some(value) = reviewers {
            repo_properties.insert(
                "requiredReviewers".into(),
                PropertyField::String(value.into()),
            );
        }
        Graph {
            project_id: "p".into(),
            nodes: vec![
                chain_node("M", "identity_people", HashMap::new()),
                chain_node("R", "source_control", repo_properties),
                chain_node("C", "cicd_pipeline", HashMap::new()),
                chain_node("A", "artifact_storage", HashMap::new()),
                chain_node("P", "runtime_environment", HashMap::new()),
                chain_node(
                    "S",
                    "monitoring_response",
                    HashMap::from([(
                        "alertThreshold".into(),
                        PropertyField::String("All Anomalies (Zero-Tolerance)".into()),
                    )]),
                ),
                chain_node("D", "dependencies", HashMap::new()),
            ],
            edges: [
                ("M", "R", "contributes_to"),
                ("M", "D", "maintains"),
                ("M", "C", "operates"),
                ("R", "C", "triggers"),
                ("C", "A", "publishes"),
                ("C", "D", "republishes"),
                ("A", "P", "provides"),
                ("P", "S", "monitored_by"),
            ]
            .iter()
            .enumerate()
            .map(|(index, (source, target, relationship))| Edge {
                id: format!("e{index}"),
                source_node_id: (*source).into(),
                target_node_id: (*target).into(),
                relationship: (*relationship).into(),
            })
            .collect(),
        }
    };

    for reviewers in [None, Some("1 reviewer")] {
        let graph = make_graph(reviewers);
        let result = simulate_attack(&graph, "a".into(), "M", "MaintainerTakeover")
            .expect("valid MaintainerTakeover");
        assert_eq!(result.steps[0].outcome, StepOutcome::Compromised);
        assert_eq!(result.detected_at_step, None);
        assert!(
            !result
                .steps
                .iter()
                .any(|step| step.relationship == "operates")
        );
        assert!(
            !result
                .steps
                .iter()
                .any(|step| step.relationship == "republishes")
        );
        assert!(
            !result
                .steps
                .iter()
                .any(|step| step.relationship == "maintains" && step.target_node_id == "D")
        );
        assert!(!result.compromised_node_ids.contains(&"D".to_string()));
    }

    let graph = make_graph(Some("2+ reviewers"));
    let result = simulate_attack(&graph, "a".into(), "M", "MaintainerTakeover")
        .expect("valid MaintainerTakeover");
    assert_eq!(result.steps[0].outcome, StepOutcome::Slowed);
    assert_eq!(result.steps[1].relationship, "triggers");
    assert_eq!(result.steps[1].outcome, StepOutcome::Compromised);
    assert!(result.detected_at_step.is_none());
}

#[test]
fn test_chaindrop_controls_and_cycle_safety() {
    let mut graph = chain_graph();
    let base_steps = graph.edges.len();
    prop_string(&mut graph.nodes[0], "lifecycleScripts", "Disabled");
    let blocked = simulate_attack(&graph, "a".into(), "D", "chaindrop").expect("valid ChainDrop");
    assert!(
        blocked
            .steps
            .iter()
            .filter(|s| s.relationship == "consumed_by")
            .all(|s| s.outcome == StepOutcome::Blocked)
    );
    assert!(
        !blocked
            .compromised_node_ids
            .iter()
            .any(|id| id == "B" || id == "W")
    );

    let mut graph = chain_graph();
    prop_bool(&mut graph.nodes[0], "lockfilePinned", true);
    prop_string(&mut graph.nodes[0], "releaseCooldown", "7 days");
    assert!(
        simulate_attack(&graph, "a".into(), "D", "ChainDrop")
            .expect("valid ChainDrop")
            .steps
            .iter()
            .filter(|s| s.relationship == "consumed_by")
            .all(|s| s.outcome == StepOutcome::Blocked)
    );

    let mut graph = chain_graph();
    prop_string(&mut graph.nodes[0], "releaseCooldown", "1 day");
    assert!(
        simulate_attack(&graph, "a".into(), "D", "ChainDrop")
            .expect("valid ChainDrop")
            .steps
            .iter()
            .filter(|s| s.relationship == "consumed_by")
            .all(|s| s.outcome == StepOutcome::Slowed)
    );

    let mut graph = chain_graph();
    prop_string(&mut graph.nodes[3], "vaultType", "OIDC Short-Lived Token");
    let short = simulate_attack(&graph, "a".into(), "D", "ChainDrop").expect("valid ChainDrop");
    assert!(
        short
            .steps
            .iter()
            .any(|s| s.phase.as_deref() == Some("harvest") && s.outcome == StepOutcome::Slowed)
    );
    assert!(
        short
            .exposed_secret_ids
            .as_ref()
            .unwrap()
            .iter()
            .any(|id| id == "S")
    );

    let mut graph = chain_graph();
    prop_bool(&mut graph.nodes[4], "trustedPublishing", true);
    prop_bool(&mut graph.nodes[5], "signatureVerification", true);
    prop_bool(&mut graph.nodes[6], "integrityCheck", true);
    let trusted = simulate_attack(&graph, "a".into(), "D", "ChainDrop").expect("valid ChainDrop");
    assert!(
        trusted
            .steps
            .iter()
            .any(|s| s.relationship == "publishes" && s.outcome == StepOutcome::Compromised)
    );
    assert!(trusted.steps.iter().any(|s| s.relationship == "provides"
        && s.outcome == StepOutcome::Compromised
        && s.reason.contains("hash")));
    assert!(trusted.steps.len() <= base_steps);

    let mut graph = chain_graph();
    prop_bool(&mut graph.nodes[5], "signatureVerification", true);
    let signature_blocked =
        simulate_attack(&graph, "a".into(), "D", "ChainDrop").expect("valid ChainDrop");
    assert!(
        signature_blocked
            .steps
            .iter()
            .any(|s| s.relationship == "publishes" && s.outcome == StepOutcome::Blocked)
    );
}

#[test]
fn test_chaindrop_token_scope_gates_republishing() {
    for (scope, expected) in [
        ("Read-only", StepOutcome::Blocked),
        ("Granular", StepOutcome::Slowed),
    ] {
        let mut graph = chain_graph();
        prop_string(&mut graph.nodes[3], "tokenScope", scope);
        let result =
            simulate_attack(&graph, "a".into(), "D", "ChainDrop").expect("valid ChainDrop");
        assert!(
            result
                .steps
                .iter()
                .any(|s| s.relationship == "republishes" && s.outcome == expected)
        );
    }

    // Missing newly introduced properties use the unmitigated defaults.
    let graph = chain_graph();
    let result = simulate_attack(&graph, "a".into(), "D", "ChainDrop").expect("valid ChainDrop");
    assert!(result.compromised_node_ids.iter().any(|id| id == "B"));
    assert!(result.compromised_node_ids.iter().any(|id| id == "C"));
    assert!(result.compromised_node_ids.iter().any(|id| id == "R"));
}

#[tokio::test]
async fn test_projects_crud() {
    let state = setup_test_state().await;

    let Json(projects_empty) = get_projects(State(state.clone()))
        .await
        .expect("get projects should succeed");
    assert!(projects_empty.is_empty());

    let Json(created) = create_project(
        State(state.clone()),
        Json(CreateProject {
            name: String::from("Production Pipeline Guard"),
        }),
    )
    .await
    .expect("create project should succeed");

    assert_eq!(created.name, "Production Pipeline Guard");
    assert!(created.id.starts_with("proj_"));

    let Json(projects) = get_projects(State(state.clone()))
        .await
        .expect("get projects should succeed");
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].id, created.id);

    let Json(graph) = get_graph(State(state.clone()), Path(created.id.clone()))
        .await
        .expect("get graph should succeed");
    assert_eq!(graph.project_id, created.id);
    assert!(graph.nodes.is_empty());
    assert!(graph.edges.is_empty());

    let err = get_graph(State(state.clone()), Path(String::from("nonexistent")))
        .await
        .expect_err("nonexistent project graph should 404");
    assert!(matches!(err, ApiError::ProjectNotFound));

    // Test edit_project
    let Json(edited) = edit_project(
        State(state.clone()),
        Path(created.id.clone()),
        Json(EditProject {
            name: String::from("Updated Pipeline Guard"),
        }),
    )
    .await
    .expect("edit project should succeed");
    assert_eq!(edited.id, created.id);
    assert_eq!(edited.name, "Updated Pipeline Guard");

    // Test delete_project
    let Json(()) = delete_project(State(state.clone()), Path(created.id.clone()))
        .await
        .expect("delete project should succeed");

    let Json(projects_after_delete) = get_projects(State(state))
        .await
        .expect("get projects should succeed");
    assert!(projects_after_delete.is_empty());
}

#[tokio::test]
async fn test_node_crud_and_errors() {
    let state = setup_test_state().await;

    let Json(proj) = create_project(
        State(state.clone()),
        Json(CreateProject {
            name: String::from("Node Test Project"),
        }),
    )
    .await
    .expect("project creation should succeed");

    let Json(other_proj) = create_project(
        State(state.clone()),
        Json(CreateProject {
            name: String::from("Other Project"),
        }),
    )
    .await
    .expect("second project creation should succeed");

    let mut props = HashMap::new();
    props.insert(
        String::from("name"),
        PropertyField::String(String::from("core-repo")),
    );
    let Json(node) = create_node(
        State(state.clone()),
        Path(proj.id.clone()),
        Json(CreateNode {
            category_id: String::from("source_control"),
            properties: props,
        }),
    )
    .await
    .expect("node creation should succeed");
    assert_eq!(node.category_id, "source_control");

    let mut updated_props = HashMap::new();
    updated_props.insert(
        String::from("name"),
        PropertyField::String(String::from("core-repo-v2")),
    );
    let Json(edited_node) = edit_node(
        State(state.clone()),
        Path((proj.id.clone(), node.id.clone())),
        Json(EditNode {
            properties: updated_props.clone(),
        }),
    )
    .await
    .expect("edit node should succeed");
    assert_eq!(edited_node.properties, updated_props);

    let edit_node_err = edit_node(
        State(state.clone()),
        Path((proj.id.clone(), String::from("invalid_id"))),
        Json(EditNode {
            properties: updated_props.clone(),
        }),
    )
    .await
    .expect_err("nonexistent node edit should fail");
    assert!(matches!(edit_node_err, ApiError::NodeNotFound));

    let cross_project_node_err = edit_node(
        State(state.clone()),
        Path((other_proj.id.clone(), node.id.clone())),
        Json(EditNode {
            properties: updated_props.clone(),
        }),
    )
    .await
    .expect_err("node edit outside its project should fail");
    assert!(matches!(cross_project_node_err, ApiError::NodeNotFound));

    let missing_project_node_err = edit_node(
        State(state.clone()),
        Path((String::from("missing_project"), node.id.clone())),
        Json(EditNode {
            properties: HashMap::new(),
        }),
    )
    .await
    .expect_err("node edit in a missing project should fail");
    assert!(matches!(
        missing_project_node_err,
        ApiError::ProjectNotFound
    ));

    let delete_cross_project_err =
        delete_node(State(state.clone()), Path((other_proj.id, node.id.clone())))
            .await
            .expect_err("node delete outside its project should fail");
    assert!(matches!(delete_cross_project_err, ApiError::NodeNotFound));

    let delete_missing_project_err = delete_node(
        State(state.clone()),
        Path((String::from("missing_project"), node.id.clone())),
    )
    .await
    .expect_err("node delete in a missing project should fail");
    assert!(matches!(
        delete_missing_project_err,
        ApiError::ProjectNotFound
    ));

    let Json(()) = delete_node(State(state), Path((proj.id, node.id)))
        .await
        .expect("delete node should succeed");
}

#[tokio::test]
#[expect(
    clippy::too_many_lines,
    reason = "single test covers full edge lifecycle"
)]
async fn test_edge_crud_validation_and_cascade() {
    let state = setup_test_state().await;

    let Json(proj) = create_project(
        State(state.clone()),
        Json(CreateProject {
            name: String::from("Edge Test Project"),
        }),
    )
    .await
    .expect("project creation should succeed");

    let Json(other_proj) = create_project(
        State(state.clone()),
        Json(CreateProject {
            name: String::from("Other Project"),
        }),
    )
    .await
    .expect("second project creation should succeed");

    let Json(node1) = create_node(
        State(state.clone()),
        Path(proj.id.clone()),
        Json(CreateNode {
            category_id: String::from("source_control"),
            properties: HashMap::new(),
        }),
    )
    .await
    .expect("node1 creation should succeed");

    let Json(node2) = create_node(
        State(state.clone()),
        Path(proj.id.clone()),
        Json(CreateNode {
            category_id: String::from("cicd_pipeline"),
            properties: HashMap::new(),
        }),
    )
    .await
    .expect("node2 creation should succeed");

    let Json(edge) = create_edge(
        State(state.clone()),
        Path(proj.id.clone()),
        Json(CreateEdge {
            source_node_id: node1.id.clone(),
            target_node_id: node2.id.clone(),
            relationship: String::from("triggers"),
        }),
    )
    .await
    .expect("create edge should succeed");
    assert_eq!(edge.relationship, "triggers");

    let dup_err = create_edge(
        State(state.clone()),
        Path(proj.id.clone()),
        Json(CreateEdge {
            source_node_id: node1.id.clone(),
            target_node_id: node2.id.clone(),
            relationship: String::from("triggers"),
        }),
    )
    .await
    .expect_err("duplicate edge should fail");
    assert!(matches!(dup_err, ApiError::DuplicateEdge));

    let invalid_rel_err = create_edge(
        State(state.clone()),
        Path(proj.id.clone()),
        Json(CreateEdge {
            source_node_id: node1.id.clone(),
            target_node_id: node2.id.clone(),
            relationship: String::from("deploys"),
        }),
    )
    .await
    .expect_err("invalid relationship should fail");
    assert!(matches!(invalid_rel_err, ApiError::InvalidRelationship));

    let Json(graph) = get_graph(State(state.clone()), Path(proj.id.clone()))
        .await
        .expect("get graph should succeed");
    assert_eq!(graph.nodes.len(), 2);
    assert_eq!(graph.edges.len(), 1);

    let Json(edited_edge) = edit_edge(
        State(state.clone()),
        Path((proj.id.clone(), edge.id.clone())),
        Json(EditEdge {
            relationship: String::from("triggers"),
        }),
    )
    .await
    .expect("edit edge should succeed");
    assert_eq!(edited_edge.id, edge.id);

    let cross_project_edge_err = edit_edge(
        State(state.clone()),
        Path((other_proj.id.clone(), edge.id.clone())),
        Json(EditEdge {
            relationship: String::from("triggers"),
        }),
    )
    .await
    .expect_err("edge edit outside its project should fail");
    assert!(matches!(cross_project_edge_err, ApiError::EdgeNotFound));

    let missing_project_edge_err = delete_edge(
        State(state.clone()),
        Path((String::from("missing_project"), edge.id.clone())),
    )
    .await
    .expect_err("edge delete in a missing project should fail");
    assert!(matches!(
        missing_project_edge_err,
        ApiError::ProjectNotFound
    ));

    let Json(()) = delete_node(State(state.clone()), Path((proj.id.clone(), node1.id)))
        .await
        .expect("delete node should succeed");

    let Json(final_graph) = get_graph(State(state.clone()), Path(proj.id.clone()))
        .await
        .expect("final graph should succeed");
    assert_eq!(final_graph.nodes.len(), 1);
    assert_eq!(final_graph.edges.len(), 0);

    let delete_err = delete_edge(State(state), Path((proj.id, edge.id)))
        .await
        .expect_err("deleting already cascaded edge should 404");
    assert!(matches!(delete_err, ApiError::EdgeNotFound));
}

#[tokio::test]
async fn test_simulate_attack() {
    let state = setup_test_state().await;

    let Json(proj) = create_project(
        State(state.clone()),
        Json(CreateProject {
            name: String::from("Attack Sim Project"),
        }),
    )
    .await
    .expect("project creation should succeed");

    // identity_people --contributes_to--> source_control (no branch protection: compromised)
    let Json(identity) = create_node(
        State(state.clone()),
        Path(proj.id.clone()),
        Json(CreateNode {
            category_id: String::from("identity_people"),
            properties: HashMap::new(),
        }),
    )
    .await
    .expect("identity node creation should succeed");

    let mut unprotected_repo_props = HashMap::new();
    unprotected_repo_props.insert(
        String::from("branchProtection"),
        PropertyField::Boolean(false),
    );
    let Json(repo) = create_node(
        State(state.clone()),
        Path(proj.id.clone()),
        Json(CreateNode {
            category_id: String::from("source_control"),
            properties: unprotected_repo_props,
        }),
    )
    .await
    .expect("repo node creation should succeed");

    // source_control --triggers--> cicd_pipeline (approval required: slowed, not blocked)
    let mut guarded_pipeline_props = HashMap::new();
    guarded_pipeline_props.insert(
        String::from("approvalRequired"),
        PropertyField::Boolean(true),
    );
    let Json(pipeline) = create_node(
        State(state.clone()),
        Path(proj.id.clone()),
        Json(CreateNode {
            category_id: String::from("cicd_pipeline"),
            properties: guarded_pipeline_props,
        }),
    )
    .await
    .expect("pipeline node creation should succeed");

    let Json(edge_to_repo) = create_edge(
        State(state.clone()),
        Path(proj.id.clone()),
        Json(CreateEdge {
            source_node_id: identity.id.clone(),
            target_node_id: repo.id.clone(),
            relationship: String::from("contributes_to"),
        }),
    )
    .await
    .expect("identity -> repo edge should succeed");

    let Json(edge_to_pipeline) = create_edge(
        State(state.clone()),
        Path(proj.id.clone()),
        Json(CreateEdge {
            source_node_id: repo.id.clone(),
            target_node_id: pipeline.id.clone(),
            relationship: String::from("triggers"),
        }),
    )
    .await
    .expect("repo -> pipeline edge should succeed");

    let Json(result) = simulate_attack_handler(
        State(state.clone()),
        Path(proj.id.clone()),
        Json(SimulateAttack {
            start_node_id: identity.id.clone(),
            scenario: String::from("MaintainerTakeover"),
        }),
    )
    .await
    .expect("attack simulation should succeed");

    assert_eq!(result.project_id, proj.id);
    assert_eq!(result.start_node_id, identity.id);
    assert!(result.attack_id.starts_with("attack_"));
    assert_eq!(result.steps.len(), 2);

    let repo_step = result
        .steps
        .iter()
        .find(|s| s.edge_id == edge_to_repo.id)
        .expect("repo step should be present");
    assert_eq!(repo_step.outcome, StepOutcome::Compromised);
    assert!(repo_step.controls_triggered.is_empty());

    let pipeline_step = result
        .steps
        .iter()
        .find(|s| s.edge_id == edge_to_pipeline.id)
        .expect("pipeline step should be present");
    assert_eq!(pipeline_step.outcome, StepOutcome::Slowed);
    assert_eq!(
        pipeline_step.controls_triggered,
        vec![String::from("approvalRequired")]
    );

    // Slowed still propagates, so all three nodes end up compromised, none blocked.
    assert_eq!(result.compromised_node_ids.len(), 3);
    assert!(result.compromised_node_ids.contains(&identity.id));
    assert!(result.compromised_node_ids.contains(&repo.id));
    assert!(result.compromised_node_ids.contains(&pipeline.id));
    assert!(result.blocked_node_ids.is_empty());
    assert!(result.detected_at_step.is_none());

    // Multiple reviewers slow a trusted maintainer; branch protection is bypassed.
    let mut protected_props = HashMap::new();
    protected_props.insert(
        String::from("branchProtection"),
        PropertyField::Boolean(true),
    );
    protected_props.insert(
        String::from("requiredReviewers"),
        PropertyField::String("2+ reviewers".into()),
    );
    let Json(_) = edit_node(
        State(state.clone()),
        Path((proj.id.clone(), repo.id.clone())),
        Json(EditNode {
            properties: protected_props,
        }),
    )
    .await
    .expect("edit node should succeed");

    let Json(blocked_result) = simulate_attack_handler(
        State(state.clone()),
        Path(proj.id.clone()),
        Json(SimulateAttack {
            start_node_id: identity.id.clone(),
            scenario: String::from("MaintainerTakeover"),
        }),
    )
    .await
    .expect("attack simulation should succeed");

    assert_eq!(blocked_result.steps.len(), 2);
    assert_eq!(blocked_result.steps[0].outcome, StepOutcome::Slowed);
    assert!(
        blocked_result.steps[0]
            .controls_triggered
            .contains(&"requiredReviewers".into())
    );
    assert_eq!(blocked_result.compromised_node_ids.len(), 3);
    assert!(blocked_result.blocked_node_ids.is_empty());

    // Branch protection alone does not block a trusted maintainer.
    let mut branch_only = HashMap::new();
    branch_only.insert("branchProtection".into(), PropertyField::Boolean(true));
    branch_only.insert(
        "requiredReviewers".into(),
        PropertyField::String("None".into()),
    );
    let Json(_) = edit_node(
        State(state.clone()),
        Path((proj.id.clone(), repo.id.clone())),
        Json(EditNode {
            properties: branch_only,
        }),
    )
    .await
    .expect("restore no additional reviewers");
    let Json(branch_result) = simulate_attack_handler(
        State(state.clone()),
        Path(proj.id.clone()),
        Json(SimulateAttack {
            start_node_id: identity.id.clone(),
            scenario: String::from("MaintainerTakeover"),
        }),
    )
    .await
    .expect("trusted maintainer should bypass branch protection");
    assert_eq!(branch_result.steps.len(), 2);
    assert_eq!(branch_result.steps[0].outcome, StepOutcome::Compromised);
    assert!(branch_result.blocked_node_ids.is_empty());

    // Nonexistent project should 404.
    let missing_project_err = simulate_attack_handler(
        State(state.clone()),
        Path(String::from("nonexistent")),
        Json(SimulateAttack {
            start_node_id: identity.id.clone(),
            scenario: String::from("ChainDrop"),
        }),
    )
    .await
    .expect_err("simulating on a missing project should fail");
    assert!(matches!(missing_project_err, ApiError::ProjectNotFound));

    // Start node not in the project should 404 as NodeNotFound.
    let missing_node_err = simulate_attack_handler(
        State(state.clone()),
        Path(proj.id.clone()),
        Json(SimulateAttack {
            start_node_id: String::from("node_does_not_exist"),
            scenario: String::from("ChainDrop"),
        }),
    )
    .await
    .expect_err("simulating from a missing node should fail");
    assert!(matches!(missing_node_err, ApiError::NodeNotFound));

    // Empty project (no nodes at all) should reject with EmptyGraph.
    let Json(empty_proj) = create_project(
        State(state.clone()),
        Json(CreateProject {
            name: String::from("Empty Project"),
        }),
    )
    .await
    .expect("empty project creation should succeed");

    let empty_graph_err = simulate_attack_handler(
        State(state),
        Path(empty_proj.id),
        Json(SimulateAttack {
            start_node_id: String::from("irrelevant"),
            scenario: String::from("ChainDrop"),
        }),
    )
    .await
    .expect_err("simulating on an empty project should fail");
    assert!(matches!(empty_graph_err, ApiError::EmptyGraph));
}
