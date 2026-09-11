use std::collections::HashMap;

use axum::Json;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde::Deserialize;
use serde::Serialize;

#[derive(Serialize, Deserialize)]
pub enum PropertyField {
    String(String),
    Number(f64),
    Boolean(bool),
}

pub type NodeProperties = HashMap<String, PropertyField>;

#[derive(Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct PropertyFieldDef {
    pub key: String,
    pub ty: PropertyField,
    pub options: Option<Vec<String>>,
    pub default_value: Option<PropertyField>,
}

#[derive(Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct NodeCategory {
    pub id: String,
    pub field_defs: Vec<PropertyFieldDef>,
}

#[derive(Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct Project {
    pub id: String,
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct Node {
    pub id: String,
    pub category_id: String,
    pub properties: NodeProperties,
}

#[derive(Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct Edge {
    pub id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub relationship: String,
}

#[derive(Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct Graph {
    pub project_id: String,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}

#[derive(Debug, Clone, Copy, strum::Display)]
#[derive(thiserror::Error)]
#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]
pub enum ApiError {
    InvalidCategoryConnection,
    InvalidRelationship,
    DuplicateEdge,
    NodeNotFound,
    ProjectNotFound,
}

impl ApiError {
    fn status_code(self) -> StatusCode {
        match self {
            Self::InvalidCategoryConnection => StatusCode::BAD_REQUEST,
            Self::InvalidRelationship => StatusCode::BAD_REQUEST,
            Self::DuplicateEdge => StatusCode::CONFLICT,
            Self::NodeNotFound => StatusCode::NOT_FOUND,
            Self::ProjectNotFound => StatusCode::NOT_FOUND,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let status = self.status_code();

        let response = ErrorResponse {
            code: self.to_string(),
            message: self.to_string(),
        };

        (status, Json(response)).into_response()
    }
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub code: String,
    pub message: String,
}
