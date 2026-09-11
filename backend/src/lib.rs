pub mod database;
pub mod schema;
pub mod types;

use core::sync::atomic::AtomicU64;
use core::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::SystemTime;
use std::time::UNIX_EPOCH;

use axum::Json;
use axum::extract::Path;
use axum::extract::Query;
use axum::extract::State;
use serde::Deserialize;

use crate::database::Database;
use crate::database::DatabaseStore;
use crate::types::ApiError;
use crate::types::Edge;
use crate::types::Graph;
use crate::types::Node;
use crate::types::NodeCategory;
use crate::types::NodeProperties;
use crate::types::Project;

type ApiResult<T> = Result<Json<T>, ApiError>;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<DatabaseStore>,
}

fn generate_id(prefix: &str) -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let count = COUNTER.fetch_add(1, Ordering::Relaxed);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis());
    format!("{prefix}_{timestamp:x}_{count:x}")
}

/// Returns whether `project_id` exists in the database.
fn project_exists(db: &Database, project_id: &str) -> bool {
    db.projects.iter().any(|p| p.id == project_id)
}

/// Returns whether `node_id` belongs to `project_id`.
///
/// Falls back to the single existing project when no per-project tracking
/// exists, which accommodates databases created before node tracking.
fn node_in_project(db: &Database, node_id: &str, project_id: &str) -> bool {
    db.node_projects
        .get(node_id)
        .is_some_and(|project| project == project_id)
        || (db.node_projects.is_empty()
            && db.projects.len() == 1
            && db.projects[0].id == project_id)
}

/// Returns whether `edge_id` belongs to `project_id`.
///
/// Falls back to the single existing project when no per-project tracking
/// exists, which accommodates databases created before edge tracking.
fn edge_in_project(db: &Database, edge_id: &str, project_id: &str) -> bool {
    db.edge_projects
        .get(edge_id)
        .is_some_and(|project| project == project_id)
        || (db.edge_projects.is_empty()
            && db.projects.len() == 1
            && db.projects[0].id == project_id)
}

/// Returns all node categories supported by the API.
///
/// Each category describes a valid node type and its available property
/// definitions.
///
/// # Errors
///
/// This function never returns an error.
pub async fn get_node_categories(State(_state): State<AppState>) -> ApiResult<Vec<NodeCategory>> {
    tokio::task::yield_now().await;
    Ok(Json(schema::all_node_categories()))
}

/// Returns all relationship types supported by the API.
///
/// # Errors
///
/// This function never returns an error.
pub async fn get_relationships(State(_state): State<AppState>) -> ApiResult<Vec<String>> {
    tokio::task::yield_now().await;
    Ok(Json(schema::all_relationships()))
}

/// Returns all projects currently stored in the database.
///
/// # Errors
///
/// This function never returns an error.
pub async fn get_projects(State(state): State<AppState>) -> ApiResult<Vec<Project>> {
    let db = state.db.read().await;
    Ok(Json(db.projects.clone()))
}

/// Returns the complete graph for a project, including its nodes and edges.
///
/// # Errors
///
/// Returns [`ApiError::ProjectNotFound`] if the project does not exist.
pub async fn get_graph(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
) -> ApiResult<Graph> {
    let db = state.db.read().await;
    if !project_exists(&db, &project_id) {
        return Err(ApiError::ProjectNotFound);
    }

    let nodes: Vec<Node> = db
        .nodes
        .iter()
        .filter(|n| node_in_project(&db, &n.id, &project_id))
        .cloned()
        .collect();

    let edges: Vec<Edge> = db
        .edges
        .iter()
        .filter(|e| edge_in_project(&db, &e.id, &project_id))
        .cloned()
        .collect();

    Ok(Json(Graph {
        project_id,
        nodes,
        edges,
    }))
}

/// Returns the relationship types allowed between two node categories.
///
/// # Errors
///
/// Returns [`ApiError::InvalidCategoryConnection`] if the category pair cannot
/// be connected by any supported relationship.
pub async fn validate_relationship(
    State(_state): State<AppState>,
    Query(query): Query<ValidateRelationshipQuery>,
) -> ApiResult<Vec<String>> {
    tokio::task::yield_now().await;
    match schema::valid_relationships(&query.source_category, &query.target_category) {
        Some(rels) if !rels.is_empty() => Ok(Json(rels)),
        _ => Err(ApiError::InvalidCategoryConnection),
    }
}

/// Creates a new project and returns the persisted project.
///
/// # Errors
///
/// This function never returns an error.
pub async fn create_project(
    State(state): State<AppState>,
    Json(project): Json<CreateProject>,
) -> ApiResult<Project> {
    let new_project = Project {
        id: generate_id("proj"),
        name: project.name,
    };

    let result = new_project.clone();
    let _ = state
        .db
        .update(move |db| {
            db.projects.push(new_project);
        })
        .await;

    Ok(Json(result))
}

/// Creates a new node within the specified project and returns the persisted node.
///
/// # Errors
///
/// Returns [`ApiError::ProjectNotFound`] if the project does not exist.
pub async fn create_node(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Json(node): Json<CreateNode>,
) -> ApiResult<Node> {
    {
        let db = state.db.read().await;
        if !db.projects.iter().any(|p| p.id == project_id) {
            return Err(ApiError::ProjectNotFound);
        }
    }

    let new_node = Node {
        id: generate_id("node"),
        category_id: node.category_id,
        properties: node.properties,
    };

    let result = new_node.clone();
    let node_id = new_node.id.clone();
    let proj_id = project_id.clone();

    let _ = state
        .db
        .update(move |db| {
            db.nodes.push(new_node);
            db.node_projects.insert(node_id, proj_id);
        })
        .await;

    Ok(Json(result))
}

/// Updates an existing node's properties and returns the updated node.
///
/// # Errors
///
/// Returns [`ApiError::ProjectNotFound`] if the project does not exist, or
/// [`ApiError::NodeNotFound`] if the node does not exist within the project.
pub async fn edit_node(
    State(state): State<AppState>,
    Path((project_id, node_id)): Path<(String, String)>,
    Json(node): Json<EditNode>,
) -> ApiResult<Node> {
    {
        let db = state.db.read().await;
        if !project_exists(&db, &project_id) {
            return Err(ApiError::ProjectNotFound);
        }
    }

    let mut updated = None;

    let _ = state
        .db
        .update(|db| {
            let in_project = node_in_project(db, &node_id, &project_id);
            if in_project && let Some(existing) = db.nodes.iter_mut().find(|n| n.id == node_id) {
                existing.properties = node.properties;
                updated = Some(existing.clone());
            }
        })
        .await;

    updated.map_or(Err(ApiError::NodeNotFound), |n| Ok(Json(n)))
}

/// Deletes an existing node.
///
/// # Errors
///
/// Returns [`ApiError::ProjectNotFound`] if the project does not exist, or
/// [`ApiError::NodeNotFound`] if the node does not exist within the project.
pub async fn delete_node(
    State(state): State<AppState>,
    Path((project_id, node_id)): Path<(String, String)>,
) -> ApiResult<()> {
    {
        let db = state.db.read().await;
        if !project_exists(&db, &project_id) {
            return Err(ApiError::ProjectNotFound);
        }
    }

    let mut found = false;

    let _ = state
        .db
        .update(|db| {
            let in_project = node_in_project(db, &node_id, &project_id);
            if in_project && let Some(pos) = db.nodes.iter().position(|n| n.id == node_id) {
                db.nodes.remove(pos);
                db.node_projects.remove(&node_id);
                found = true;

                let removed_edges: Vec<String> = db
                    .edges
                    .iter()
                    .filter(|e| e.source_node_id == node_id || e.target_node_id == node_id)
                    .map(|e| e.id.clone())
                    .collect();

                db.edges
                    .retain(|e| e.source_node_id != node_id && e.target_node_id != node_id);
                for edge_id in removed_edges {
                    db.edge_projects.remove(&edge_id);
                }
            }
        })
        .await;

    if found {
        Ok(Json(()))
    } else {
        Err(ApiError::NodeNotFound)
    }
}

/// Creates an edge within the specified project and returns the persisted edge.
///
/// The source and target nodes must exist, their category pair must support
/// the requested relationship, and an equivalent edge must not already exist.
///
/// # Errors
///
/// Returns [`ApiError::ProjectNotFound`] if the project does not exist,
/// [`ApiError::NodeNotFound`] if either the source or target node does not exist,
/// [`ApiError::InvalidCategoryConnection`] if the category pair cannot be connected,
/// [`ApiError::InvalidRelationship`] if the relationship is not permitted, or
/// [`ApiError::DuplicateEdge`] if an equivalent edge already exists.
pub async fn create_edge(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Json(edge): Json<CreateEdge>,
) -> ApiResult<Edge> {
    let (source_cat, target_cat) = {
        let db = state.db.read().await;
        if !db.projects.iter().any(|p| p.id == project_id) {
            return Err(ApiError::ProjectNotFound);
        }

        let source_node = db
            .nodes
            .iter()
            .find(|n| n.id == edge.source_node_id)
            .ok_or(ApiError::NodeNotFound)?;

        let target_node = db
            .nodes
            .iter()
            .find(|n| n.id == edge.target_node_id)
            .ok_or(ApiError::NodeNotFound)?;

        (
            source_node.category_id.clone(),
            target_node.category_id.clone(),
        )
    };

    let allowed_rels = schema::valid_relationships(&source_cat, &target_cat)
        .ok_or(ApiError::InvalidCategoryConnection)?;

    if !allowed_rels.contains(&edge.relationship) {
        return Err(ApiError::InvalidRelationship);
    }

    {
        let db = state.db.read().await;
        let duplicate = db.edges.iter().any(|e| {
            e.source_node_id == edge.source_node_id && e.target_node_id == edge.target_node_id
        });

        if duplicate {
            return Err(ApiError::DuplicateEdge);
        }
    }

    let new_edge = Edge {
        id: generate_id("edge"),
        source_node_id: edge.source_node_id,
        target_node_id: edge.target_node_id,
        relationship: edge.relationship,
    };

    let result = new_edge.clone();
    let edge_id = new_edge.id.clone();
    let proj_id = project_id.clone();

    let _ = state
        .db
        .update(move |db| {
            db.edges.push(new_edge);
            db.edge_projects.insert(edge_id, proj_id);
        })
        .await;

    Ok(Json(result))
}

/// Updates the relationship of an existing edge and returns the updated edge.
///
/// # Errors
///
/// Returns [`ApiError::ProjectNotFound`] if the project does not exist,
/// [`ApiError::EdgeNotFound`] if the edge does not exist within the project,
/// [`ApiError::NodeNotFound`] if either connected node does not exist,
/// [`ApiError::InvalidCategoryConnection`] if the category pair cannot be connected, or
/// [`ApiError::InvalidRelationship`] if the relationship is not permitted.
pub async fn edit_edge(
    State(state): State<AppState>,
    Path((project_id, edge_id)): Path<(String, String)>,
    Json(edge): Json<EditEdge>,
) -> ApiResult<Edge> {
    let (source_cat, target_cat) = {
        let db = state.db.read().await;
        if !project_exists(&db, &project_id) {
            return Err(ApiError::ProjectNotFound);
        }

        let existing_edge = db
            .edges
            .iter()
            .find(|e| e.id == edge_id && edge_in_project(&db, &e.id, &project_id))
            .ok_or(ApiError::EdgeNotFound)?;

        let source_node = db
            .nodes
            .iter()
            .find(|n| n.id == existing_edge.source_node_id)
            .ok_or(ApiError::NodeNotFound)?;

        let target_node = db
            .nodes
            .iter()
            .find(|n| n.id == existing_edge.target_node_id)
            .ok_or(ApiError::NodeNotFound)?;

        (
            source_node.category_id.clone(),
            target_node.category_id.clone(),
        )
    };

    let allowed_rels = schema::valid_relationships(&source_cat, &target_cat)
        .ok_or(ApiError::InvalidCategoryConnection)?;

    if !allowed_rels.contains(&edge.relationship) {
        return Err(ApiError::InvalidRelationship);
    }

    let mut updated = None;
    let _ = state
        .db
        .update(|db| {
            if let Some(existing) = db.edges.iter_mut().find(|e| e.id == edge_id) {
                existing.relationship = edge.relationship;
                updated = Some(existing.clone());
            }
        })
        .await;

    updated.map_or(Err(ApiError::EdgeNotFound), |e| Ok(Json(e)))
}

/// Deletes an existing edge.
///
/// # Errors
///
/// Returns [`ApiError::ProjectNotFound`] if the project does not exist, or
/// [`ApiError::EdgeNotFound`] if the edge does not exist within the project.
pub async fn delete_edge(
    State(state): State<AppState>,
    Path((project_id, edge_id)): Path<(String, String)>,
) -> ApiResult<()> {
    {
        let db = state.db.read().await;
        if !project_exists(&db, &project_id) {
            return Err(ApiError::ProjectNotFound);
        }
    }

    let mut found = false;

    let _ = state
        .db
        .update(|db| {
            let in_project = edge_in_project(db, &edge_id, &project_id);
            if in_project && let Some(pos) = db.edges.iter().position(|e| e.id == edge_id) {
                db.edges.remove(pos);
                db.edge_projects.remove(&edge_id);
                found = true;
            }
        })
        .await;

    if found {
        Ok(Json(()))
    } else {
        Err(ApiError::EdgeNotFound)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateProject {
    #[serde(alias = "name")]
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ValidateRelationshipQuery {
    #[serde(alias = "sourceCategory", alias = "source_category")]
    pub source_category: String,
    #[serde(alias = "targetCategory", alias = "target_category")]
    pub target_category: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateNode {
    #[serde(alias = "categoryId", alias = "category_id")]
    pub category_id: String,
    #[serde(alias = "properties")]
    pub properties: NodeProperties,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct EditNode {
    #[serde(alias = "properties")]
    pub properties: NodeProperties,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateEdge {
    #[serde(alias = "sourceNodeId", alias = "source_node_id")]
    pub source_node_id: String,
    #[serde(alias = "targetNodeId", alias = "target_node_id")]
    pub target_node_id: String,
    #[serde(
        alias = "relationshipId",
        alias = "relationship_id",
        alias = "relationship"
    )]
    pub relationship: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct EditEdge {
    #[serde(
        alias = "relationshipId",
        alias = "relationship_id",
        alias = "relationship"
    )]
    pub relationship: String,
}
