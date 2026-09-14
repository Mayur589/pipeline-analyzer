use std::collections::HashMap;
use std::collections::HashSet;
use std::collections::VecDeque;

use crate::types::AttackSimulationResult;
use crate::types::AttackStep;
use crate::types::Graph;
use crate::types::Node;
use crate::types::NodeProperties;
use crate::types::PropertyField;
use crate::types::SeverityScore;
use crate::types::StepOutcome;

fn get_bool(props: &NodeProperties, key: &str) -> bool {
    matches!(props.get(key), Some(PropertyField::Boolean(true)))
}

fn get_select<'a>(props: &'a NodeProperties, key: &str) -> Option<&'a str> {
    match props.get(key) {
        Some(PropertyField::String(s)) => Some(s.as_str()),
        _ => None,
    }
}

/// Evaluates whether an attack propagating along `relationship` into `target`
/// succeeds, is slowed, is blocked, or is detected, based on the target
/// node's configured controls.
fn evaluate_step(relationship: &str, target: &Node) -> (StepOutcome, String, Vec<String>) {
    match (relationship, target.category_id.as_str()) {
        ("contributes_to" | "maintains", "source_control") => {
            if get_bool(&target.properties, "branchProtection") {
                (
                    StepOutcome::Blocked,
                    "Branch protection requires review; malicious push rejected".into(),
                    vec!["branchProtection".into()],
                )
            } else {
                (
                    StepOutcome::Compromised,
                    "No branch protection — malicious commit merged directly".into(),
                    vec![],
                )
            }
        }
        ("triggers", "cicd_pipeline") => {
            if get_bool(&target.properties, "approvalRequired") {
                (
                    StepOutcome::Slowed,
                    "Pipeline requires manual approval — attack delayed".into(),
                    vec!["approvalRequired".into()],
                )
            } else {
                (
                    StepOutcome::Compromised,
                    "Pipeline auto-triggers on push — malicious code executes unattended".into(),
                    vec![],
                )
            }
        }
        ("executes", "build_environment") => {
            if get_select(&target.properties, "isolationLevel") == Some("Shared Node") {
                (
                    StepOutcome::Compromised,
                    "Shared build node — blast radius extends to co-located builds".into(),
                    vec!["isolationLevel".into()],
                )
            } else {
                (
                    StepOutcome::Slowed,
                    "Isolated/ephemeral runner limits lateral movement".into(),
                    vec!["isolationLevel".into()],
                )
            }
        }
        ("authenticates", "secrets_credentials") => {
            if get_bool(&target.properties, "autoRevoke")
                || get_select(&target.properties, "vaultType") == Some("OIDC Short-Lived Token")
            {
                (
                    StepOutcome::Blocked,
                    "Short-lived/auto-revoked credentials limit exfiltration value".into(),
                    vec!["autoRevoke".into()],
                )
            } else {
                (
                    StepOutcome::Compromised,
                    "Long-lived static credentials exfiltrated".into(),
                    vec![],
                )
            }
        }
        ("produces" | "publishes", "artifact_storage") => {
            if get_bool(&target.properties, "signatureVerification") {
                (
                    StepOutcome::Blocked,
                    "Signature verification rejects unsigned malicious artifact".into(),
                    vec!["signatureVerification".into()],
                )
            } else {
                (
                    StepOutcome::Compromised,
                    "Unsigned artifact accepted into registry".into(),
                    vec![],
                )
            }
        }
        ("provides" | "delivers", "distribution" | "runtime_environment") => {
            if get_bool(&target.properties, "integrityCheck") {
                (
                    StepOutcome::Blocked,
                    "Integrity check catches tampered artifact before delivery".into(),
                    vec!["integrityCheck".into()],
                )
            } else {
                (
                    StepOutcome::Compromised,
                    "No integrity check — malicious artifact distributed".into(),
                    vec![],
                )
            }
        }
        ("deploys", "runtime_environment") => {
            if get_bool(&target.properties, "enforceZeroTrust") {
                (
                    StepOutcome::Slowed,
                    "Zero-trust policies restrict what the compromised workload can reach".into(),
                    vec!["enforceZeroTrust".into()],
                )
            } else {
                (
                    StepOutcome::Compromised,
                    "Backdoor running in production with broad network access".into(),
                    vec![],
                )
            }
        }
        ("monitored_by", "monitoring_response") => {
            match get_select(&target.properties, "alertThreshold") {
                Some("All Anomalies (Zero-Tolerance)" | "Strict Policy Violations") => (
                    StepOutcome::Detected,
                    "Monitoring flags the anomalous behavior".into(),
                    vec!["alertThreshold".into()],
                ),
                _ => (
                    StepOutcome::Compromised,
                    "Alert threshold too lenient — activity goes unnoticed".into(),
                    vec![],
                ),
            }
        }
        _ => (
            StepOutcome::Compromised,
            "No specific control modeled for this hop — assumed compromised".into(),
            vec![],
        ),
    }
}

fn severity_from(compromised: usize, total: usize, detected: bool) -> SeverityScore {
    let ratio = compromised as f64 / total.max(1) as f64;
    let mut score = ratio * 10.0;
    if detected {
        score *= 0.7;
    }
    let label = match score {
        s if s >= 7.5 => "Critical",
        s if s >= 5.0 => "High",
        s if s >= 2.5 => "Medium",
        _ => "Low",
    };

    SeverityScore {
        score,
        label: label.to_string(),
    }
}

/// Runs a breadth-first attack simulation starting from `start_node_id`,
/// propagating along outgoing edges and gating each hop on the target
/// node's configured controls.
///
/// Assumes `start_node_id` has already been validated as present in `graph`.
#[must_use]
pub fn simulate_attack(
    graph: &Graph,
    attack_id: String,
    start_node_id: &str,
    scenario: &str,
) -> AttackSimulationResult {
    let node_by_id: HashMap<&str, &Node> = graph.nodes.iter().map(|n| (n.id.as_str(), n)).collect();

    let mut steps = Vec::new();
    let mut compromised: HashSet<String> = HashSet::from([start_node_id.to_string()]);
    let mut blocked: HashSet<String> = HashSet::new();
    let mut detected_at_step = None;
    let mut visited: HashSet<&str> = HashSet::from([start_node_id]);

    let mut queue: VecDeque<&str> = VecDeque::from([start_node_id]);

    while let Some(current_id) = queue.pop_front() {
        for edge in graph
            .edges
            .iter()
            .filter(|e| e.source_node_id == current_id)
        {
            let Some(&target) = node_by_id.get(edge.target_node_id.as_str()) else {
                continue;
            };

            let (outcome, reason, controls) = evaluate_step(&edge.relationship, target);

            match outcome {
                StepOutcome::Compromised | StepOutcome::Slowed => {
                    compromised.insert(target.id.clone());
                    if visited.insert(target.id.as_str()) {
                        queue.push_back(&target.id);
                    }
                }
                StepOutcome::Blocked => {
                    blocked.insert(target.id.clone());
                }
                StepOutcome::Detected => {
                    compromised.insert(target.id.clone());
                    if visited.insert(target.id.as_str()) {
                        queue.push_back(&target.id);
                    }
                    if detected_at_step.is_none() {
                        detected_at_step = Some(steps.len());
                    }
                }
            }

            steps.push(AttackStep {
                edge_id: edge.id.clone(),
                source_node_id: current_id.to_string(),
                target_node_id: target.id.clone(),
                relationship: edge.relationship.clone(),
                outcome,
                reason,
                controls_triggered: controls,
            });
        }
    }

    let overall_severity = severity_from(
        compromised.len(),
        graph.nodes.len(),
        detected_at_step.is_some(),
    );

    AttackSimulationResult {
        attack_id,
        project_id: graph.project_id.clone(),
        start_node_id: start_node_id.to_string(),
        scenario: scenario.to_string(),
        steps,
        compromised_node_ids: compromised.into_iter().collect(),
        blocked_node_ids: blocked.into_iter().collect(),
        detected_at_step,
        overall_severity,
    }
}
