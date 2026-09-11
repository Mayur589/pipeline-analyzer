use axum::Json;
use axum::extract::Path;
use axum::extract::Query;
use serde::Deserialize;

use crate::types::ApiError;
use crate::types::Edge;
use crate::types::Graph;
use crate::types::Node;
use crate::types::NodeCategory;
use crate::types::NodeProperties;
use crate::types::Project;

mod types;

type ApiResult<T> = Result<Json<T>, ApiError>;

/// Returns all node categories available to create nodes.
///
/// The returned categories define the supported node types and their property
/// field definitions.
pub async fn get_node_categories() -> ApiResult<Vec<NodeCategory>> {
    todo!()
}

/// Returns all relationship types supported by the API.
pub async fn get_relationships() -> ApiResult<Vec<String>> {
    todo!()
}

/// Returns all projects available to the caller.
pub async fn get_projects() -> ApiResult<Vec<Project>> {
    todo!()
}

/// Returns the complete graph for the specified project.
///
/// Fails with `ApiError::ProjectNotFound` when the project does not exist.
pub async fn get_graph(Path(project_id): Path<String>) -> ApiResult<Graph> {
    todo!()
}

/// Validates whether a relationship is allowed between two node categories.
///
/// Returns the supported relationship types for the given source and target
/// categories. Fails with `ApiError::InvalidCategoryConnection` when the
/// category pair cannot be connected.
pub async fn validate_relationship(
    Query(query): Query<ValidateRelationshipQuery>,
) -> ApiResult<Vec<String>> {
    todo!()
}

/// Creates a new project and returns the created project.
pub async fn create_project(Json(project): Json<CreateProject>) -> ApiResult<Project> {
    todo!()
}

/// Creates a node in the appropriate project context and returns the created node.
pub async fn create_node(Json(node): Json<CreateNode>) -> ApiResult<Node> {
    todo!()
}

/// Updates the properties of an existing node and returns the updated node.
///
/// Fails with `ApiError::NodeNotFound` when the node does not exist.
pub async fn edit_node(Path(node_id): Path<String>, Json(node): Json<EditNode>) -> ApiResult<Node> {
    todo!()
}

/// Deletes an existing node.
///
/// Fails with `ApiError::NodeNotFound` when the node does not exist.
pub async fn delete_node(Path(node_id): Path<String>) -> ApiResult<()> {
    todo!()
}

/// Creates an edge between two existing nodes and returns the created edge.
///
/// Validates that the relationship is supported for the source and target
/// node categories and that the edge does not already exist.
pub async fn create_edge(Json(edge): Json<CreateEdge>) -> ApiResult<Edge> {
    todo!()
}

/// Updates the relationship of an existing edge and returns the updated edge.
///
/// Fails with `ApiError::NodeNotFound` when the edge does not exist.
pub async fn edit_edge(
    Path(edge_id): Path<String>,
    Json(edge): Json<CreateEdge>,
) -> ApiResult<Edge> {
    todo!()
}

/// Deletes an existing edge.
///
/// Fails with `ApiError::NodeNotFound` when the edge does not exist.
pub async fn delete_edge(Path(edge_id): Path<String>) -> ApiResult<()> {
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
