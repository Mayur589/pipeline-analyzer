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
use backend::ValidateRelationshipQuery;
use backend::create_edge;
use backend::create_node;
use backend::create_project;
use backend::database::DatabaseStore;
use backend::delete_edge;
use backend::delete_node;
use backend::edit_edge;
use backend::edit_node;
use backend::get_graph;
use backend::get_node_categories;
use backend::get_projects;
use backend::get_relationships;
use backend::types::ApiError;
use backend::types::PropertyField;
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

    let err = get_graph(State(state), Path(String::from("nonexistent")))
        .await
        .expect_err("nonexistent project graph should 404");
    assert!(matches!(err, ApiError::ProjectNotFound));
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

    let mut props = HashMap::new();
    props.insert(
        String::from("name"),
        PropertyField::String(String::from("core-repo")),
    );
    let Json(node) = create_node(
        State(state.clone()),
        Path(proj.id),
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
        Path(node.id.clone()),
        Json(EditNode {
            properties: updated_props.clone(),
        }),
    )
    .await
    .expect("edit node should succeed");
    assert_eq!(edited_node.properties, updated_props);

    let edit_node_err = edit_node(
        State(state.clone()),
        Path(String::from("invalid_id")),
        Json(EditNode {
            properties: updated_props,
        }),
    )
    .await
    .expect_err("nonexistent node edit should fail");
    assert!(matches!(edit_node_err, ApiError::NodeNotFound));

    let Json(()) = delete_node(State(state), Path(node.id))
        .await
        .expect("delete node should succeed");
}

#[tokio::test]
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
        Path(edge.id.clone()),
        Json(EditEdge {
            relationship: String::from("triggers"),
        }),
    )
    .await
    .expect("edit edge should succeed");
    assert_eq!(edited_edge.id, edge.id);

    let Json(()) = delete_node(State(state.clone()), Path(node1.id))
        .await
        .expect("delete node should succeed");

    let Json(final_graph) = get_graph(State(state.clone()), Path(proj.id))
        .await
        .expect("final graph should succeed");
    assert_eq!(final_graph.nodes.len(), 1);
    assert_eq!(final_graph.edges.len(), 0);

    let delete_err = delete_edge(State(state), Path(edge.id))
        .await
        .expect_err("deleting already cascaded edge should 404");
    assert!(matches!(delete_err, ApiError::EdgeNotFound));
}
