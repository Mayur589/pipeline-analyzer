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

pub async fn get_node_categories() -> ApiResult<Vec<NodeCategory>> {
    todo!()
}

pub async fn get_relationships() -> ApiResult<Vec<String>> {
    todo!()
}

pub async fn get_projects() -> ApiResult<Vec<Project>> {
    todo!()
}

pub async fn get_graph(Path(project_id): Path<String>) -> ApiResult<Graph> {
    todo!()
}

pub async fn validate_relationship(
    Query(query): Query<ValidateRelationshipQuery>,
) -> ApiResult<Vec<String>> {
    todo!()
}

pub async fn create_project(Json(project): Json<CreateProject>) -> ApiResult<Project> {
    todo!()
}

pub async fn create_node(Json(node): Json<CreateNode>) -> ApiResult<Node> {
    todo!()
}

pub async fn edit_node(Path(node_id): Path<String>, Json(node): Json<EditNode>) -> ApiResult<Node> {
    todo!()
}

pub async fn delete_node(Path(node_id): Path<String>) -> ApiResult<()> {
    todo!()
}

pub async fn create_edge(Json(edge): Json<CreateEdge>) -> ApiResult<Edge> {
    todo!()
}

pub async fn edit_edge(
    Path(edge_id): Path<String>,
    Json(edge): Json<CreateEdge>,
) -> ApiResult<Edge> {
    todo!()
}

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
