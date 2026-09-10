import type { NodeCategory } from '../types/graph';

export const NODE_CATEGORIES: NodeCategory[] = [
  {
    id: 'identity_people',
    category: 'Identity & People',
    defaultProperties: ['name', 'role', 'mfaEnabled', 'accessLevel'],
    description: 'Developers, admins, service accounts, and IAM roles accessing the pipeline.',
    color: '#38bdf8',
    fieldDefs: [
      { key: 'name', label: 'Name / Identifier', type: 'text', defaultValue: 'Security Engineer', placeholder: 'e.g., Core DevOps Team' },
      { key: 'role', label: 'Role / Team', type: 'select', options: ['Maintainer', 'Contributor', 'DevOps Admin', 'Service Account', 'External Auditor'], defaultValue: 'Maintainer' },
      { key: 'mfaEnabled', label: 'Hardware MFA Enforced', type: 'checkbox', defaultValue: true, description: 'Requires FIDO2/WebAuthn hardware key' },
      { key: 'accessLevel', label: 'Access Level', type: 'select', options: ['Read-Only', 'Write', 'Admin', 'Root / Owner'], defaultValue: 'Admin' }
    ]
  },
  {
    id: 'source_control',
    category: 'Source Control',
    defaultProperties: ['name', 'visibility', 'branchProtection'],
    description: 'Repositories, version control systems, and code review governance.',
    color: '#818cf8',
    fieldDefs: [
      { key: 'name', label: 'Repository Name', type: 'text', defaultValue: 'org/backend-service', placeholder: 'e.g., org/auth-gateway' },
      { key: 'visibility', label: 'Visibility', type: 'select', options: ['Private', 'Internal', 'Public'], defaultValue: 'Private' },
      { key: 'branchProtection', label: 'Branch Protection Enforced', type: 'checkbox', defaultValue: true, description: 'Requires signed commits and PR approvals' }
    ]
  },
  {
    id: 'dependencies',
    category: 'Dependencies',
    defaultProperties: ['name', 'packageManager', 'vulnerabilityScanning'],
    description: 'Third-party open-source libraries, vendored code, and software packages.',
    color: '#f59e0b',
    fieldDefs: [
      { key: 'name', label: 'Dependency Set / Package', type: 'text', defaultValue: 'npm-production-deps', placeholder: 'e.g., react-dom, lodash' },
      { key: 'packageManager', label: 'Package Manager / Ecosystem', type: 'select', options: ['npm / yarn / pnpm', 'PyPI / pip', 'Go Modules', 'Maven / Gradle', 'Cargo (Rust)', 'NuGet'], defaultValue: 'npm / yarn / pnpm' },
      { key: 'vulnerabilityScanning', label: 'Automated SCA / Vulnerability Scanning', type: 'checkbox', defaultValue: true, description: 'Continuous Snyk/Dependabot scanning' }
    ]
  },
  {
    id: 'build_environment',
    category: 'Build Environment',
    defaultProperties: ['name', 'isolationLevel', 'ephemeral', 'baseImage'],
    description: 'Compilers, build workers, sandboxes, and base OS container images.',
    color: '#ec4899',
    fieldDefs: [
      { key: 'name', label: 'Build Worker Cluster', type: 'text', defaultValue: 'Isolated-Runner-Cluster-01', placeholder: 'e.g., hermetic-builder-node' },
      { key: 'isolationLevel', label: 'Isolation Level', type: 'select', options: ['Hermetic Container', 'Firecracker MicroVM', 'Dedicated Bare-Metal', 'Shared Node'], defaultValue: 'Hermetic Container' },
      { key: 'ephemeral', label: 'Ephemeral / Single-Use Worker', type: 'checkbox', defaultValue: true, description: 'Workers destroyed immediately after build' },
      { key: 'baseImage', label: 'Hardened Base Image', type: 'text', defaultValue: 'cgr.dev/chainguard/node:latest', placeholder: 'e.g., distroless/static' }
    ]
  },
  {
    id: 'cicd_pipeline',
    category: 'CI/CD Pipeline',
    defaultProperties: ['name', 'runnerType', 'approvalRequired'],
    description: 'Workflows, orchestration engines, automated test suites, and gates.',
    color: '#06b6d4',
    fieldDefs: [
      { key: 'name', label: 'Pipeline Name', type: 'text', defaultValue: 'Release-Pipeline-Prod', placeholder: 'e.g., CI-Build-And-Sign' },
      { key: 'runnerType', label: 'Runner Infrastructure', type: 'select', options: ['GitHub Actions (Self-Hosted)', 'GitLab Runner (Protected)', 'Argo Workflows', 'Tekton Pipelines', 'CircleCI Cloud'], defaultValue: 'GitHub Actions (Self-Hosted)' },
      { key: 'approvalRequired', label: 'Manual Approval Required', type: 'checkbox', defaultValue: true, description: 'Requires dual-custody review prior to promotion' }
    ]
  },
  {
    id: 'secrets_credentials',
    category: 'Secrets & Credentials',
    defaultProperties: ['name', 'vaultType', 'autoRevoke'],
    description: 'API keys, signing certificates, deployment tokens, and KMS keys.',
    color: '#eab308',
    fieldDefs: [
      { key: 'name', label: 'Secret Identifier / Role', type: 'text', defaultValue: 'Cosign-KMS-Signer-Key', placeholder: 'e.g., AWS-OIDC-Deployer' },
      { key: 'vaultType', label: 'Vault Provider', type: 'select', options: ['HashiCorp Vault', 'AWS KMS / Secrets Manager', 'GCP Secret Manager', 'Azure Key Vault', 'OIDC Short-Lived Token'], defaultValue: 'OIDC Short-Lived Token' },
      { key: 'autoRevoke', label: 'Auto-Rotate / Short-Lived Expiry', type: 'checkbox', defaultValue: true, description: 'Tokens expire in < 60 minutes with auto-revocation' }
    ]
  },
  {
    id: 'artifact_storage',
    category: 'Artifact Storage',
    defaultProperties: ['name', 'registryType', 'immutableTags', 'signatureVerification'],
    description: 'OCI container registries, binary repositories, and package archives.',
    color: '#10b981',
    fieldDefs: [
      { key: 'name', label: 'Registry / Repository', type: 'text', defaultValue: 'registry.internal.corp/app', placeholder: 'e.g., artifact-hub/core' },
      { key: 'registryType', label: 'Registry Platform', type: 'select', options: ['Harbor OCI Registry', 'AWS ECR', 'Google Artifact Registry', 'GitHub Container Registry', 'JFrog Artifactory'], defaultValue: 'Harbor OCI Registry' },
      { key: 'immutableTags', label: 'Immutable Tags Enforced', type: 'checkbox', defaultValue: true, description: 'Disallows overwriting released version tags' },
      { key: 'signatureVerification', label: 'Sigstore / Cosign Signature Required', type: 'checkbox', defaultValue: true, description: 'Cryptographic provenance check required before pull' }
    ]
  },
  {
    id: 'distribution',
    category: 'Distribution',
    defaultProperties: ['name', 'channel', 'integrityCheck'],
    description: 'Release portals, CDN networks, package indexes, and client delivery.',
    color: '#a855f7',
    fieldDefs: [
      { key: 'name', label: 'Release Channel / CDN', type: 'text', defaultValue: 'Global-CloudFront-Delivery', placeholder: 'e.g., Fastly-Edge-CDN' },
      { key: 'channel', label: 'Channel Type', type: 'select', options: ['Public CDN', 'Private VPC Gateway', 'App Store / Enterprise Portal', 'Direct Binary Download'], defaultValue: 'Public CDN' },
      { key: 'integrityCheck', label: 'Subresource Integrity (SRI) / Checksums', type: 'checkbox', defaultValue: true, description: 'SHA-256 and cryptographic checksums published' }
    ]
  },
  {
    id: 'runtime_environment',
    category: 'Runtime Environment',
    defaultProperties: ['name', 'environmentType', 'enforceZeroTrust'],
    description: 'Kubernetes clusters, serverless workers, VMs, and edge instances.',
    color: '#f97316',
    fieldDefs: [
      { key: 'name', label: 'Cluster / Host Name', type: 'text', defaultValue: 'k8s-prod-us-east-1', placeholder: 'e.g., prod-eks-workload-01' },
      { key: 'environmentType', label: 'Environment Tier', type: 'select', options: ['Production', 'Staging', 'Canary', 'Sandbox / Testing'], defaultValue: 'Production' },
      { key: 'enforceZeroTrust', label: 'Zero-Trust mTLS & eBPF Security', type: 'checkbox', defaultValue: true, description: 'Cilium eBPF network policy + Istio mTLS' }
    ]
  },
  {
    id: 'monitoring_response',
    category: 'Monitoring & Response',
    defaultProperties: ['name', 'siemIntegration', 'alertThreshold'],
    description: 'Runtime telemetry, SIEM logging, eBPF sensors, and incident triggers.',
    color: '#ef4444',
    fieldDefs: [
      { key: 'name', label: 'Monitoring Probe / Pipeline', type: 'text', defaultValue: 'Falco-Runtime-Guard', placeholder: 'e.g., Datadog-SIEM-Ingest' },
      { key: 'siemIntegration', label: 'SIEM / Observability Platform', type: 'select', options: ['Falco + Splunk', 'Datadog Cloud SIEM', 'Elastic Security', 'AWS Security Hub', 'Grafana Loki + Prometheus'], defaultValue: 'Falco + Splunk' },
      { key: 'alertThreshold', label: 'Incident Escalation Threshold', type: 'select', options: ['Critical & High Only', 'All Anomalies (Zero-Tolerance)', 'Strict Policy Violations', 'Digest Summary'], defaultValue: 'All Anomalies (Zero-Tolerance)' }
    ]
  }
];

export async function getNodeTypes(): Promise<NodeCategory[]> {
  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 80));
  return JSON.parse(JSON.stringify(NODE_CATEGORIES));
}
