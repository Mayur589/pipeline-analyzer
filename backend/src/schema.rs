use crate::types::NodeCategory;
use crate::types::PropertyField;
use crate::types::PropertyFieldDef;

fn identity_category() -> NodeCategory {
    NodeCategory {
        id: String::from("identity_people"),
        field_defs: vec![
            PropertyFieldDef {
                key: String::from("name"),
                ty: PropertyField::String(String::from("string")),
                options: None,
                default_value: Some(PropertyField::String(String::from("Security Engineer"))),
            },
            PropertyFieldDef {
                key: String::from("role"),
                ty: PropertyField::String(String::from("select")),
                options: Some(vec![
                    String::from("Maintainer"),
                    String::from("Contributor"),
                    String::from("DevOps Admin"),
                    String::from("Service Account"),
                    String::from("External Auditor"),
                ]),
                default_value: Some(PropertyField::String(String::from("Maintainer"))),
            },
            PropertyFieldDef {
                key: String::from("mfaEnabled"),
                ty: PropertyField::String(String::from("boolean")),
                options: None,
                default_value: Some(PropertyField::Boolean(true)),
            },
            PropertyFieldDef {
                key: String::from("accessLevel"),
                ty: PropertyField::String(String::from("select")),
                options: Some(vec![
                    String::from("Read-Only"),
                    String::from("Write"),
                    String::from("Admin"),
                    String::from("Root / Owner"),
                ]),
                default_value: Some(PropertyField::String(String::from("Admin"))),
            },
        ],
    }
}

fn source_control_category() -> NodeCategory {
    NodeCategory {
        id: String::from("source_control"),
        field_defs: vec![
            PropertyFieldDef {
                key: String::from("name"),
                ty: PropertyField::String(String::from("string")),
                options: None,
                default_value: Some(PropertyField::String(String::from("org/backend-service"))),
            },
            PropertyFieldDef {
                key: String::from("visibility"),
                ty: PropertyField::String(String::from("select")),
                options: Some(vec![
                    String::from("Private"),
                    String::from("Internal"),
                    String::from("Public"),
                ]),
                default_value: Some(PropertyField::String(String::from("Private"))),
            },
            PropertyFieldDef {
                key: String::from("branchProtection"),
                ty: PropertyField::String(String::from("boolean")),
                options: None,
                default_value: Some(PropertyField::Boolean(true)),
            },
        ],
    }
}

fn dependencies_category() -> NodeCategory {
    NodeCategory {
        id: String::from("dependencies"),
        field_defs: vec![
            PropertyFieldDef {
                key: String::from("name"),
                ty: PropertyField::String(String::from("string")),
                options: None,
                default_value: Some(PropertyField::String(String::from("npm-production-deps"))),
            },
            PropertyFieldDef {
                key: String::from("packageManager"),
                ty: PropertyField::String(String::from("select")),
                options: Some(vec![
                    String::from("npm / yarn / pnpm"),
                    String::from("PyPI / pip"),
                    String::from("Go Modules"),
                    String::from("Maven / Gradle"),
                    String::from("Cargo (Rust)"),
                    String::from("NuGet"),
                ]),
                default_value: Some(PropertyField::String(String::from("npm / yarn / pnpm"))),
            },
            PropertyFieldDef {
                key: String::from("vulnerabilityScanning"),
                ty: PropertyField::String(String::from("boolean")),
                options: None,
                default_value: Some(PropertyField::Boolean(true)),
            },
        ],
    }
}

fn build_environment_category() -> NodeCategory {
    NodeCategory {
        id: String::from("build_environment"),
        field_defs: vec![
            PropertyFieldDef {
                key: String::from("name"),
                ty: PropertyField::String(String::from("string")),
                options: None,
                default_value: Some(PropertyField::String(String::from(
                    "Isolated-Runner-Cluster-01",
                ))),
            },
            PropertyFieldDef {
                key: String::from("isolationLevel"),
                ty: PropertyField::String(String::from("select")),
                options: Some(vec![
                    String::from("Hermetic Container"),
                    String::from("Firecracker MicroVM"),
                    String::from("Dedicated Bare-Metal"),
                    String::from("Shared Node"),
                ]),
                default_value: Some(PropertyField::String(String::from("Hermetic Container"))),
            },
            PropertyFieldDef {
                key: String::from("ephemeral"),
                ty: PropertyField::String(String::from("boolean")),
                options: None,
                default_value: Some(PropertyField::Boolean(true)),
            },
            PropertyFieldDef {
                key: String::from("baseImage"),
                ty: PropertyField::String(String::from("string")),
                options: None,
                default_value: Some(PropertyField::String(String::from(
                    "cgr.dev/chainguard/node:latest",
                ))),
            },
        ],
    }
}

fn cicd_pipeline_category() -> NodeCategory {
    NodeCategory {
        id: String::from("cicd_pipeline"),
        field_defs: vec![
            PropertyFieldDef {
                key: String::from("name"),
                ty: PropertyField::String(String::from("string")),
                options: None,
                default_value: Some(PropertyField::String(String::from("Release-Pipeline-Prod"))),
            },
            PropertyFieldDef {
                key: String::from("runnerType"),
                ty: PropertyField::String(String::from("select")),
                options: Some(vec![
                    String::from("GitHub Actions (Self-Hosted)"),
                    String::from("GitLab Runner (Protected)"),
                    String::from("Argo Workflows"),
                    String::from("Tekton Pipelines"),
                    String::from("CircleCI Cloud"),
                ]),
                default_value: Some(PropertyField::String(String::from(
                    "GitHub Actions (Self-Hosted)",
                ))),
            },
            PropertyFieldDef {
                key: String::from("approvalRequired"),
                ty: PropertyField::String(String::from("boolean")),
                options: None,
                default_value: Some(PropertyField::Boolean(true)),
            },
        ],
    }
}

fn secrets_credentials_category() -> NodeCategory {
    NodeCategory {
        id: String::from("secrets_credentials"),
        field_defs: vec![
            PropertyFieldDef {
                key: String::from("name"),
                ty: PropertyField::String(String::from("string")),
                options: None,
                default_value: Some(PropertyField::String(String::from("Cosign-KMS-Signer-Key"))),
            },
            PropertyFieldDef {
                key: String::from("vaultType"),
                ty: PropertyField::String(String::from("select")),
                options: Some(vec![
                    String::from("HashiCorp Vault"),
                    String::from("AWS KMS / Secrets Manager"),
                    String::from("GCP Secret Manager"),
                    String::from("Azure Key Vault"),
                    String::from("OIDC Short-Lived Token"),
                ]),
                default_value: Some(PropertyField::String(String::from(
                    "OIDC Short-Lived Token",
                ))),
            },
            PropertyFieldDef {
                key: String::from("autoRevoke"),
                ty: PropertyField::String(String::from("boolean")),
                options: None,
                default_value: Some(PropertyField::Boolean(true)),
            },
        ],
    }
}

fn artifact_storage_category() -> NodeCategory {
    NodeCategory {
        id: String::from("artifact_storage"),
        field_defs: vec![
            PropertyFieldDef {
                key: String::from("name"),
                ty: PropertyField::String(String::from("string")),
                options: None,
                default_value: Some(PropertyField::String(String::from(
                    "registry.internal.corp/app",
                ))),
            },
            PropertyFieldDef {
                key: String::from("registryType"),
                ty: PropertyField::String(String::from("select")),
                options: Some(vec![
                    String::from("Harbor OCI Registry"),
                    String::from("AWS ECR"),
                    String::from("Google Artifact Registry"),
                    String::from("GitHub Container Registry"),
                    String::from("JFrog Artifactory"),
                ]),
                default_value: Some(PropertyField::String(String::from("Harbor OCI Registry"))),
            },
            PropertyFieldDef {
                key: String::from("immutableTags"),
                ty: PropertyField::String(String::from("boolean")),
                options: None,
                default_value: Some(PropertyField::Boolean(true)),
            },
            PropertyFieldDef {
                key: String::from("signatureVerification"),
                ty: PropertyField::String(String::from("boolean")),
                options: None,
                default_value: Some(PropertyField::Boolean(true)),
            },
        ],
    }
}

fn distribution_category() -> NodeCategory {
    NodeCategory {
        id: String::from("distribution"),
        field_defs: vec![
            PropertyFieldDef {
                key: String::from("name"),
                ty: PropertyField::String(String::from("string")),
                options: None,
                default_value: Some(PropertyField::String(String::from(
                    "Global-CloudFront-Delivery",
                ))),
            },
            PropertyFieldDef {
                key: String::from("channel"),
                ty: PropertyField::String(String::from("select")),
                options: Some(vec![
                    String::from("Public CDN"),
                    String::from("Private VPC Gateway"),
                    String::from("App Store / Enterprise Portal"),
                    String::from("Direct Binary Download"),
                ]),
                default_value: Some(PropertyField::String(String::from("Public CDN"))),
            },
            PropertyFieldDef {
                key: String::from("integrityCheck"),
                ty: PropertyField::String(String::from("boolean")),
                options: None,
                default_value: Some(PropertyField::Boolean(true)),
            },
        ],
    }
}

fn runtime_environment_category() -> NodeCategory {
    NodeCategory {
        id: String::from("runtime_environment"),
        field_defs: vec![
            PropertyFieldDef {
                key: String::from("name"),
                ty: PropertyField::String(String::from("string")),
                options: None,
                default_value: Some(PropertyField::String(String::from("k8s-prod-us-east-1"))),
            },
            PropertyFieldDef {
                key: String::from("environmentType"),
                ty: PropertyField::String(String::from("select")),
                options: Some(vec![
                    String::from("Production"),
                    String::from("Staging"),
                    String::from("Canary"),
                    String::from("Sandbox / Testing"),
                ]),
                default_value: Some(PropertyField::String(String::from("Production"))),
            },
            PropertyFieldDef {
                key: String::from("enforceZeroTrust"),
                ty: PropertyField::String(String::from("boolean")),
                options: None,
                default_value: Some(PropertyField::Boolean(true)),
            },
        ],
    }
}

fn monitoring_response_category() -> NodeCategory {
    NodeCategory {
        id: String::from("monitoring_response"),
        field_defs: vec![
            PropertyFieldDef {
                key: String::from("name"),
                ty: PropertyField::String(String::from("string")),
                options: None,
                default_value: Some(PropertyField::String(String::from("Falco-Runtime-Guard"))),
            },
            PropertyFieldDef {
                key: String::from("siemIntegration"),
                ty: PropertyField::String(String::from("select")),
                options: Some(vec![
                    String::from("Falco + Splunk"),
                    String::from("Datadog Cloud SIEM"),
                    String::from("Elastic Security"),
                    String::from("AWS Security Hub"),
                    String::from("Grafana Loki + Prometheus"),
                ]),
                default_value: Some(PropertyField::String(String::from("Falco + Splunk"))),
            },
            PropertyFieldDef {
                key: String::from("alertThreshold"),
                ty: PropertyField::String(String::from("select")),
                options: Some(vec![
                    String::from("Critical & High Only"),
                    String::from("All Anomalies (Zero-Tolerance)"),
                    String::from("Strict Policy Violations"),
                    String::from("Digest Summary"),
                ]),
                default_value: Some(PropertyField::String(String::from(
                    "All Anomalies (Zero-Tolerance)",
                ))),
            },
        ],
    }
}

/// Returns all 10 supported node categories with their property field definitions.
#[must_use]
pub fn all_node_categories() -> Vec<NodeCategory> {
    vec![
        identity_category(),
        source_control_category(),
        dependencies_category(),
        build_environment_category(),
        cicd_pipeline_category(),
        secrets_credentials_category(),
        artifact_storage_category(),
        distribution_category(),
        runtime_environment_category(),
        monitoring_response_category(),
    ]
}

/// Returns all 21 supported relationship types.
#[must_use]
pub fn all_relationships() -> Vec<String> {
    const RELATIONSHIPS: &[&str] = &[
        "contributes_to",
        "maintains",
        "triggers",
        "references",
        "provides_source",
        "consumed_by",
        "executes",
        "authenticates",
        "signs",
        "produces",
        "publishes",
        "provides",
        "delivers",
        "deploys",
        "monitored_by",
        "logs_to",
        "alerts",
        "administers",
        "approves",
        "operates",
        "accesses",
    ];

    RELATIONSHIPS.iter().map(|&s| String::from(s)).collect()
}

/// Returns the supported relationship types between a source and target category.
///
/// Returns `None` if the category pair cannot be connected by any relationship.
#[must_use]
pub fn valid_relationships(source_category: &str, target_category: &str) -> Option<Vec<String>> {
    let rels: &[&str] = match (source_category, target_category) {
        ("identity_people", "source_control") => &["contributes_to", "maintains"],
        ("identity_people", "cicd_pipeline") => &["operates", "approves"],
        ("identity_people", "secrets_credentials") => &["accesses"],
        ("identity_people", "runtime_environment") => &["administers"],
        ("source_control", "dependencies") | ("dependencies", "runtime_environment") => {
            &["references"]
        }
        ("source_control", "build_environment") => &["provides_source"],
        ("source_control", "cicd_pipeline") => &["triggers"],
        ("dependencies", "build_environment") => &["consumed_by"],
        ("cicd_pipeline", "build_environment") => &["executes"],
        ("cicd_pipeline", "artifact_storage") => &["publishes"],
        ("cicd_pipeline", "distribution" | "runtime_environment") => &["deploys"],
        ("build_environment", "artifact_storage") => &["produces"],
        ("build_environment", "monitoring_response") | ("monitoring_response", "cicd_pipeline") => {
            &["logs_to"]
        }
        ("secrets_credentials", "cicd_pipeline" | "build_environment")
        | ("runtime_environment", "secrets_credentials") => &["authenticates"],
        ("secrets_credentials", "distribution") => &["signs"],
        ("artifact_storage", "distribution" | "runtime_environment") => &["provides"],
        ("distribution", "runtime_environment") => &["delivers"],
        ("runtime_environment", "monitoring_response") => &["monitored_by"],
        ("monitoring_response", "identity_people") => &["alerts"],
        _ => return None,
    };

    Some(rels.iter().map(|&s| String::from(s)).collect())
}
