use std::collections::HashMap;

use axum::Json;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde::Deserialize;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PropertyField {
    String(String),
    Number(f64),
    Boolean(bool),
}

pub type NodeProperties = HashMap<String, PropertyField>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PropertyFieldDef {
    pub key: String,
    pub ty: PropertyField,
    pub options: Option<Vec<String>>,
    pub default_value: Option<PropertyField>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct NodeCategory {
    pub id: String,
    pub field_defs: Vec<PropertyFieldDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Project {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Node {
    pub id: String,
    pub category_id: String,
    pub properties: NodeProperties,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Edge {
    pub id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub relationship: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Graph {
    pub project_id: String,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum StepOutcome {
    Compromised,
    Slowed,
    Blocked,
    Detected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct AttackStep {
    pub edge_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub relationship: String,
    pub outcome: StepOutcome,
    pub reason: String,
    pub controls_triggered: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SeverityScore {
    pub score: f64,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct AttackSimulationResult {
    pub attack_id: String,
    pub project_id: String,
    pub start_node_id: String,
    pub scenario: String,
    pub steps: Vec<AttackStep>,
    pub compromised_node_ids: Vec<String>,
    pub blocked_node_ids: Vec<String>,
    pub detected_at_step: Option<usize>,
    pub overall_severity: SeverityScore,
}

#[derive(Debug, Clone, Copy, strum::Display, thiserror::Error)]
#[strum(serialize_all = "SCREAMING_SNAKE_CASE")]
pub enum ApiError {
    InvalidCategoryConnection,
    InvalidRelationship,
    DuplicateEdge,
    NodeNotFound,
    EdgeNotFound,
    ProjectNotFound,
    EmptyGraph, // new: nothing to simulate against
}

impl ApiError {
    fn status_code(self) -> StatusCode {
        match self {
            Self::DuplicateEdge => StatusCode::CONFLICT,
            Self::NodeNotFound | Self::EdgeNotFound | Self::ProjectNotFound => {
                StatusCode::NOT_FOUND
            }
            Self::InvalidCategoryConnection | Self::InvalidRelationship | Self::EmptyGraph => {
                StatusCode::BAD_REQUEST
            }
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let status = self.status_code();

        let response = ErrorResponse {
            code: status.as_str().to_string(),
            message: self.to_string(),
        };

        (status, Json(response)).into_response()
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorResponse {
    pub code: String,
    pub message: String,
}
