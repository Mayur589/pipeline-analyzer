pub mod database;

use std::sync::Arc;

use axum::Json;
use axum::extract::Path;
use axum::extract::Query;
use axum::extract::State;
use serde::Deserialize;

use crate::database::DatabaseStore;
use crate::types::ApiError;
use crate::types::Edge;
use crate::types::Graph;
use crate::types::Node;
use crate::types::NodeCategory;
use crate::types::NodeProperties;
use crate::types::Project;

mod types;

type ApiResult<T> = Result<Json<T>, ApiError>;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<DatabaseStore>,
}

/// Returns all node categories supported by the API.
///
/// Each category describes a valid node type and its available property
/// definitions.
pub async fn get_node_categories(State(state): State<AppState>) -> ApiResult<Vec<NodeCategory>> {
    todo!()
}

/// Returns all relationship types supported by the API.
pub async fn get_relationships(State(state): State<AppState>) -> ApiResult<Vec<String>> {
    todo!()
}

/// Returns all projects currently stored in the database.
pub async fn get_projects(State(state): State<AppState>) -> ApiResult<Vec<Project>> {
    todo!()
}

/// Returns the complete graph for a project, including its nodes and edges.
///
/// Returns `ApiError::ProjectNotFound` if the project does not exist.
pub async fn get_graph(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
) -> ApiResult<Graph> {
    todo!()
}

/// Returns the relationship types allowed between two node categories.
///
/// Returns `ApiError::InvalidCategoryConnection` if the category pair cannot
/// be connected by any supported relationship.
pub async fn validate_relationship(
    State(state): State<AppState>,
    Query(query): Query<ValidateRelationshipQuery>,
) -> ApiResult<Vec<String>> {
    todo!()
}

/// Creates a new project and returns the persisted project.
pub async fn create_project(
    State(state): State<AppState>,
    Json(project): Json<CreateProject>,
) -> ApiResult<Project> {
    todo!()
}

/// Creates a new node within the specified project and returns the persisted node.
///
/// Returns `ApiError::ProjectNotFound` if the project does not exist.
pub async fn create_node(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Json(node): Json<CreateNode>,
) -> ApiResult<Node> {
    todo!()
}

/// Updates an existing node's properties and returns the updated node.
///
/// Returns `ApiError::NodeNotFound` if the node does not exist.
pub async fn edit_node(
    State(state): State<AppState>,
    Path(node_id): Path<String>,
    Json(node): Json<EditNode>,
) -> ApiResult<Node> {
    todo!()
}

/// Deletes an existing node.
///
/// Returns `ApiError::NodeNotFound` if the node does not exist.
pub async fn delete_node(
    State(state): State<AppState>,
    Path(node_id): Path<String>,
) -> ApiResult<()> {
    todo!()
}

/// Creates an edge within the specified project and returns the persisted edge.
///
/// The source and target nodes must exist, their category pair must support
/// the requested relationship, and an equivalent edge must not already exist.
///
/// Returns an appropriate `ApiError` when these constraints are violated.
pub async fn create_edge(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Json(edge): Json<CreateEdge>,
) -> ApiResult<Edge> {
    todo!()
}

/// Updates the relationship of an existing edge and returns the updated edge.
///
/// Returns `ApiError::EdgeNotFound` if the edge does not exist.
pub async fn edit_edge(
    State(state): State<AppState>,
    Path(edge_id): Path<String>,
    Json(edge): Json<EditEdge>,
) -> ApiResult<Edge> {
    todo!()
}

/// Deletes an existing edge.
///
/// Returns `ApiError::EdgeNotFound` if the edge does not exist.
pub async fn delete_edge(
    State(state): State<AppState>,
    Path(edge_id): Path<String>,
) -> ApiResult<()> {
    todo!()
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateProject {
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct ValidateRelationshipQuery {
    source_category: String,
    target_category: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateNode {
    category_id: String,
    properties: NodeProperties,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct EditNode {
    properties: NodeProperties,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateEdge {
    source_node_id: String,
    target_node_id: String,
    relationship: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct EditEdge {
    relationship: String,
}
