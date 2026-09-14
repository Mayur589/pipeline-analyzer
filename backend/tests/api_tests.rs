use std::collections::HashMap;
use std::sync::Arc;

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
use backend::simulate_attack_handler;
use backend::types::ApiError;
use backend::types::PropertyField;
use backend::types::StepOutcome;
use backend::validate_relationship;

async fn setup_test_state() -> AppState {
    let temp_dir = std::env::temp_dir();
    let db_path = temp_dir.join(format!("test_db_{}.json", std::process::id()));
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
    assert_eq!(relationships.len(), 21);
    assert!(relationships.contains(&String::from("triggers")));
    assert!(relationships.contains(&String::from("deploys")));
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
            scenario: String::from("compromised_maintainer_credentials"),
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

    // Now flip branch protection on and re-run: the repo hop should be blocked
    // and the attack should not reach the pipeline.
    let mut protected_props = HashMap::new();
    protected_props.insert(
        String::from("branchProtection"),
        PropertyField::Boolean(true),
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
            scenario: String::from("compromised_maintainer_credentials"),
        }),
    )
    .await
    .expect("attack simulation should succeed");

    assert_eq!(blocked_result.steps.len(), 1);
    assert_eq!(blocked_result.steps[0].outcome, StepOutcome::Blocked);
    assert_eq!(blocked_result.compromised_node_ids.len(), 1);
    assert!(blocked_result.compromised_node_ids.contains(&identity.id));
    assert_eq!(blocked_result.blocked_node_ids, vec![repo.id.clone()]);

    // Nonexistent project should 404.
    let missing_project_err = simulate_attack_handler(
        State(state.clone()),
        Path(String::from("nonexistent")),
        Json(SimulateAttack {
            start_node_id: identity.id.clone(),
            scenario: String::from("compromised_maintainer_credentials"),
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
            scenario: String::from("compromised_maintainer_credentials"),
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
            scenario: String::from("compromised_maintainer_credentials"),
        }),
    )
    .await
    .expect_err("simulating on an empty project should fail");
    assert!(matches!(empty_graph_err, ApiError::EmptyGraph));
}
