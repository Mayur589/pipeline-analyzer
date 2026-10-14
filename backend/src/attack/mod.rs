use std::collections::{BTreeSet, HashMap, HashSet, VecDeque};

use crate::types::{
    AttackSimulationResult, AttackStep, Graph, Node, NodeProperties, PropertyField, SeverityScore,
    StepOutcome,
};

fn get_bool(props: &NodeProperties, key: &str) -> bool {
    matches!(props.get(key), Some(PropertyField::Boolean(true)))
}

fn get_select<'a>(props: &'a NodeProperties, key: &str) -> Option<&'a str> {
    match props.get(key) {
        Some(PropertyField::String(s)) => Some(s.as_str()),
        _ => None,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ScenarioKind {
    ChainDrop,
    BuildTamper,
    MaintainerTakeover,
}

impl ScenarioKind {
    pub fn parse(s: &str) -> Option<Self> {
        let normalized = s
            .chars()
            .filter(|character| !matches!(character, '_' | '-' | ' '))
            .flat_map(char::to_lowercase)
            .collect::<String>();
        match normalized.as_str() {
            "chaindrop" => Some(Self::ChainDrop),
            "buildtamper" => Some(Self::BuildTamper),
            "maintainertakeover" => Some(Self::MaintainerTakeover),
            _ => None,
        }
    }

    #[must_use]
    pub fn id(self) -> &'static str {
        match self {
            Self::ChainDrop => "ChainDrop",
            Self::BuildTamper => "BuildTamper",
            Self::MaintainerTakeover => "MaintainerTakeover",
        }
    }

    #[must_use]
    pub fn valid_start_categories(self) -> &'static [&'static str] {
        match self {
            Self::ChainDrop => &["dependencies", "identity_people"],
            Self::MaintainerTakeover => &["identity_people"],
            Self::BuildTamper => &["build_environment"],
        }
    }

    fn follows(self, rel: &str, target_category: &str) -> bool {
        match self {
            Self::ChainDrop => true,
            Self::BuildTamper => matches!(
                (rel, target_category),
                ("produces" | "publishes", "artifact_storage")
                    | ("provides", "distribution" | "runtime_environment")
                    | ("delivers" | "deploys", "runtime_environment")
                    | ("monitored_by", "monitoring_response")
            ),
            Self::MaintainerTakeover => matches!(
                (rel, target_category),
                ("contributes_to" | "maintains", "source_control")
                    | ("triggers", "cicd_pipeline")
                    | ("publishes", "artifact_storage")
                    | ("provides", "distribution" | "runtime_environment")
                    | ("delivers", "runtime_environment")
                    | ("monitored_by", "monitoring_response")
            ),
        }
    }
}

/// Shared base rule set used by scenario-specific evaluators. Keep these outcomes unchanged.
fn evaluate_base(relationship: &str, target: &Node) -> (StepOutcome, String, Vec<String>) {
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
    let mut score = compromised as f64 / total.max(1) as f64 * 10.0;
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
        label: label.into(),
    }
}

fn phase_for(rel: &str) -> Option<String> {
    match rel {
        "consumed_by" | "executes" => Some("execution".into()),
        "publishes" | "republishes" | "provides" | "delivers" | "deploys" => {
            Some("propagation".into())
        }
        _ => None,
    }
}

fn evaluate_chaindrop(
    rel: &str,
    source: &Node,
    target: &Node,
) -> (StepOutcome, String, Vec<String>) {
    match (rel, target.category_id.as_str()) {
        ("consumed_by", "build_environment" | "identity_people") => {
            if get_select(&source.properties, "lifecycleScripts").unwrap_or("Enabled") == "Disabled" {
                return (StepOutcome::Blocked, "preinstall hook never runs".into(), vec!["lifecycleScripts".into()]);
            }
            let cooldown = get_select(&source.properties, "releaseCooldown").unwrap_or("None") != "None";
            let pinned = get_bool(&source.properties, "lockfilePinned");
            match (cooldown, pinned) {
                (true, true) => (StepOutcome::Blocked, "Fresh release never resolved".into(), vec!["releaseCooldown".into(), "lockfilePinned".into()]),
                (true, false) | (false, true) => (StepOutcome::Slowed, "Partial protection delays resolution of the malicious release".into(), vec![if cooldown { "releaseCooldown" } else { "lockfilePinned" }.into()]),
                (false, false) => (StepOutcome::Compromised, "Lifecycle script runs before install completes; vulnerabilityScanning does not help because the new release has no CVE yet".into(), vec!["vulnerabilityScanning does not detect a new release without a CVE".into()]),
            }
        }
        ("publishes", "artifact_storage") if get_bool(&source.properties, "trustedPublishing") => (StepOutcome::Compromised, "Trusted publishing creates a poisoned release with valid OIDC provenance; signatureVerification does not block it".into(), vec!["trustedPublishing".into()]),
        ("provides" | "delivers", "distribution" | "runtime_environment") => (StepOutcome::Compromised, "Integrity check passes because the poisoned artifact hash matches the published release".into(), vec!["integrityCheck matches the poisoned artifact".into()]),
        _ => evaluate_base(rel, target),
    }
}

fn phase_for_new_scenarios(rel: &str) -> Option<String> {
    match rel {
        "contributes_to" | "maintains" | "triggers" | "produces" => Some("execution".into()),
        "publishes" | "provides" | "delivers" | "deploys" => Some("propagation".into()),
        _ => None,
    }
}

fn evaluate_build_tamper(
    rel: &str,
    source: &Node,
    target: &Node,
) -> (StepOutcome, String, Vec<String>) {
    match (rel, target.category_id.as_str()) {
        ("produces" | "publishes", "artifact_storage") => {
            if source.category_id == "build_environment"
                && get_bool(&source.properties, "reproducibleBuilds")
            {
                (
                    StepOutcome::Blocked,
                    "Independent rebuild produces a different hash; the poisoned build is rejected"
                        .into(),
                    vec!["reproducibleBuilds".into()],
                )
            } else if get_bool(&target.properties, "signatureVerification") {
                (
                    StepOutcome::Compromised,
                    "Signature verification passes because the poisoned build is validly signed"
                        .into(),
                    vec!["signatureVerification passes for a validly signed build".into()],
                )
            } else {
                (
                    StepOutcome::Compromised,
                    "The poisoned build is accepted into artifact storage".into(),
                    vec![],
                )
            }
        }
        ("provides" | "delivers", "distribution" | "runtime_environment") => (
            StepOutcome::Compromised,
            "Integrity hash matches the poisoned release".into(),
            vec!["integrityCheck matches the poisoned release".into()],
        ),
        ("monitored_by", "monitoring_response") => {
            if get_select(&target.properties, "alertThreshold")
                == Some("All Anomalies (Zero-Tolerance)")
            {
                (
                    StepOutcome::Detected,
                    "Zero-Tolerance monitoring detects the anomalous build behavior".into(),
                    vec!["alertThreshold".into()],
                )
            } else {
                (
                    StepOutcome::Compromised,
                    "The implant mimics normal traffic and passes monitoring".into(),
                    vec![],
                )
            }
        }
        _ => evaluate_base(rel, target),
    }
}

fn evaluate_takeover(
    rel: &str,
    source: &Node,
    target: &Node,
) -> (StepOutcome, String, Vec<String>) {
    match (rel, target.category_id.as_str()) {
        ("contributes_to" | "maintains", "source_control") => {
            let branch_protection = get_bool(&target.properties, "branchProtection");
            let mut controls = Vec::new();
            let mut reason = if get_select(&target.properties, "requiredReviewers")
                == Some("2+ reviewers")
            {
                controls.push("requiredReviewers".into());
                "Multiple reviewers slow the trusted maintainer's change, but do not stop it".to_string()
            } else {
                "A trusted maintainer's change enters reviewed history; the single approver is an accomplice".to_string()
            };
            if branch_protection {
                controls.push("branchProtection bypassed by trusted maintainer".into());
                reason.push_str("; branch protection does not constrain this trusted maintainer");
            }
            let outcome = if controls.iter().any(|control| control == "requiredReviewers") {
                StepOutcome::Slowed
            } else {
                StepOutcome::Compromised
            };
            (outcome, reason, controls)
        }
        ("publishes", "artifact_storage")
            if get_select(&source.properties, "releaseSource") == Some("Built from tag") =>
        {
            (
                StepOutcome::Blocked,
                "The release is built from the reviewed tag, so the payload hidden in the uploaded tarball cannot ship".into(),
                vec!["releaseSource".into()],
            )
        }
        ("publishes", "artifact_storage") => (
            StepOutcome::Compromised,
            "The uploaded tarball differs from reviewed repository history but is legitimately signed; signature verification passes".into(),
            if get_bool(&target.properties, "signatureVerification") {
                vec!["signatureVerification passes for the legitimately signed release".into()]
            } else {
                vec![]
            },
        ),
        ("provides" | "delivers", "distribution" | "runtime_environment") => (
            StepOutcome::Compromised,
            "Integrity hash matches the poisoned release".into(),
            vec!["integrityCheck matches the poisoned release".into()],
        ),
        ("monitored_by", "monitoring_response") => (
            StepOutcome::Compromised,
            "Legitimate maintainer access raises no monitoring anomaly".into(),
            vec![],
        ),
        _ => evaluate_base(rel, target),
    }
}

/// Simulates a scenario from a valid start node.
///
/// # Errors
///
/// Returns `InvalidScenario` for an unknown scenario, `NodeNotFound` for a
/// missing start node, or `InvalidStartNode` when the start category is invalid.
pub fn simulate_attack(
    graph: &Graph,
    attack_id: String,
    start_node_id: &str,
    scenario: &str,
) -> Result<AttackSimulationResult, crate::types::ApiError> {
    let kind = ScenarioKind::parse(scenario).ok_or(crate::types::ApiError::InvalidScenario)?;
    let node_by_id: HashMap<&str, &Node> = graph.nodes.iter().map(|n| (n.id.as_str(), n)).collect();
    let start = node_by_id
        .get(start_node_id)
        .copied()
        .ok_or(crate::types::ApiError::NodeNotFound)?;
    if !kind
        .valid_start_categories()
        .contains(&start.category_id.as_str())
    {
        return Err(crate::types::ApiError::InvalidStartNode);
    }
    let mut steps = Vec::new();
    let mut compromised = BTreeSet::from([start_node_id.to_string()]);
    let mut blocked = BTreeSet::new();
    let mut exposed = BTreeSet::new();
    let mut detected_at_step = None;
    let mut visited = HashSet::from([start_node_id.to_string()]);
    let mut traversed = HashSet::<&str>::new();
    let mut queue = VecDeque::from([start_node_id.to_string()]);
    let mut worm_generations = 0usize;

    while let Some(current_id) = queue.pop_front() {
        let Some(&current) = node_by_id.get(current_id.as_str()) else {
            continue;
        };
        for edge in graph
            .edges
            .iter()
            .filter(|e| e.source_node_id == current_id)
        {
            if !traversed.insert(edge.id.as_str()) {
                continue;
            }
            let Some(&target) = node_by_id.get(edge.target_node_id.as_str()) else {
                continue;
            };
            if !kind.follows(&edge.relationship, &target.category_id) {
                continue;
            }
            let (outcome, reason, controls) = match kind {
                ScenarioKind::ChainDrop => evaluate_chaindrop(&edge.relationship, current, target),
                ScenarioKind::BuildTamper => {
                    evaluate_build_tamper(&edge.relationship, current, target)
                }
                ScenarioKind::MaintainerTakeover => {
                    evaluate_takeover(&edge.relationship, current, target)
                }
            };
            if edge.relationship == "republishes" && kind == ScenarioKind::ChainDrop {
                let trusted = get_bool(&current.properties, "trustedPublishing");
                let capability = graph
                    .edges
                    .iter()
                    .filter(|auth| {
                        auth.relationship == "authenticates" && auth.target_node_id == current.id
                    })
                    .filter(|auth| compromised.contains(&auth.source_node_id))
                    .filter_map(|auth| node_by_id.get(auth.source_node_id.as_str()).copied())
                    .map(|secret| {
                        get_select(&secret.properties, "tokenScope")
                            .unwrap_or("Publish + 2FA Bypass")
                    })
                    .max_by_key(|scope| match *scope {
                        "Publish + 2FA Bypass" => 3,
                        "Granular" => 2,
                        "Read-only" => 1,
                        _ => 0,
                    });
                let (o, r, c) = if trusted || capability == Some("Publish + 2FA Bypass") {
                    (StepOutcome::Compromised, "Publisher can republish with trusted OIDC publishing or a 2FA-bypass token".into(), vec![if trusted { "trustedPublishing" } else { "tokenScope" }.into()])
                } else if capability == Some("Granular") {
                    (
                        StepOutcome::Slowed,
                        "Granular publish token limits propagation".into(),
                        vec!["tokenScope".into()],
                    )
                } else {
                    (StepOutcome::Blocked, "No publish capability: only read-only credentials or no compromised token are available".into(), vec!["tokenScope".into()])
                };
                let (outcome, reason, controls) = (o, r, c);
                if matches!(outcome, StepOutcome::Compromised | StepOutcome::Slowed) {
                    worm_generations += 1;
                }
                record_step(
                    &mut steps,
                    edge,
                    &current_id,
                    target,
                    outcome,
                    reason,
                    controls,
                    true,
                    false,
                    Some("propagation".into()),
                );
                apply_outcome(
                    outcome,
                    target,
                    &mut compromised,
                    &mut blocked,
                    &mut visited,
                    &mut queue,
                    &mut detected_at_step,
                    steps.len() - 1,
                );
                continue;
            }
            record_step(
                &mut steps,
                edge,
                &current_id,
                target,
                outcome,
                reason,
                controls,
                true,
                false,
                if kind == ScenarioKind::ChainDrop {
                    phase_for(&edge.relationship)
                } else {
                    phase_for_new_scenarios(&edge.relationship)
                },
            );
            apply_outcome(
                outcome,
                target,
                &mut compromised,
                &mut blocked,
                &mut visited,
                &mut queue,
                &mut detected_at_step,
                steps.len() - 1,
            );
        }
        if kind == ScenarioKind::ChainDrop
            && matches!(
                current.category_id.as_str(),
                "build_environment" | "cicd_pipeline"
            )
        {
            let harvest_edges: Vec<_> = graph
                .edges
                .iter()
                .filter(|e| {
                    e.relationship == "authenticates"
                        && e.target_node_id == current_id
                        && !traversed.contains(e.id.as_str())
                })
                .collect();
            for edge in harvest_edges {
                let Some(&secret) = node_by_id.get(edge.source_node_id.as_str()) else {
                    continue;
                };
                if secret.category_id != "secrets_credentials" || compromised.contains(&secret.id) {
                    continue;
                }
                traversed.insert(edge.id.as_str());
                let short_lived = get_select(&secret.properties, "vaultType")
                    == Some("OIDC Short-Lived Token")
                    || get_bool(&secret.properties, "autoRevoke")
                    || get_select(&secret.properties, "tokenScope") == Some("Read-only");
                let outcome = if short_lived {
                    StepOutcome::Slowed
                } else {
                    StepOutcome::Compromised
                };
                let reason = if short_lived {
                    "Credential harvested while live inside the job; short lifetime, auto-revocation, or read-only scope slows its use"
                } else {
                    "Long-lived credential harvested from the compromised job"
                };
                record_step(
                    &mut steps,
                    edge,
                    &current_id,
                    secret,
                    outcome,
                    reason.into(),
                    if short_lived {
                        vec!["vaultType/autoRevoke/tokenScope".into()]
                    } else {
                        vec![]
                    },
                    true,
                    true,
                    Some("harvest".into()),
                );
                exposed.insert(secret.id.clone());
                apply_outcome(
                    outcome,
                    secret,
                    &mut compromised,
                    &mut blocked,
                    &mut visited,
                    &mut queue,
                    &mut detected_at_step,
                    steps.len() - 1,
                );
            }
        }
    }

    let overall_severity = severity_from(
        compromised.len(),
        graph.nodes.len(),
        detected_at_step.is_some(),
    );
    Ok(AttackSimulationResult {
        attack_id,
        project_id: graph.project_id.clone(),
        start_node_id: start_node_id.into(),
        scenario: scenario.into(),
        steps,
        compromised_node_ids: compromised.into_iter().collect(),
        blocked_node_ids: blocked.into_iter().collect(),
        detected_at_step,
        overall_severity,
        worm_generations: (kind == ScenarioKind::ChainDrop).then_some(worm_generations),
        exposed_secret_ids: (kind == ScenarioKind::ChainDrop)
            .then(|| exposed.into_iter().collect()),
    })
}

fn record_step(
    steps: &mut Vec<AttackStep>,
    edge: &crate::types::Edge,
    from: &str,
    to: &Node,
    outcome: StepOutcome,
    reason: String,
    controls: Vec<String>,
    chain: bool,
    reverse: bool,
    phase: Option<String>,
) {
    steps.push(AttackStep {
        edge_id: edge.id.clone(),
        source_node_id: from.into(),
        target_node_id: to.id.clone(),
        relationship: edge.relationship.clone(),
        outcome,
        reason,
        controls_triggered: controls,
        phase,
        reverse: (chain && reverse).then_some(true),
    });
}

fn apply_outcome(
    outcome: StepOutcome,
    target: &Node,
    compromised: &mut BTreeSet<String>,
    blocked: &mut BTreeSet<String>,
    visited: &mut HashSet<String>,
    queue: &mut VecDeque<String>,
    detected: &mut Option<usize>,
    index: usize,
) {
    match outcome {
        StepOutcome::Compromised | StepOutcome::Slowed => {
            compromised.insert(target.id.clone());
            if visited.insert(target.id.clone()) {
                queue.push_back(target.id.clone());
            }
        }
        StepOutcome::Blocked => {
            blocked.insert(target.id.clone());
        }
        StepOutcome::Detected => {
            compromised.insert(target.id.clone());
            if visited.insert(target.id.clone()) {
                queue.push_back(target.id.clone());
            }
            if detected.is_none() {
                *detected = Some(index);
            }
        }
    }
}
