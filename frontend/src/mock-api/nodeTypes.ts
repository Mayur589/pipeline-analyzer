import type { NodeCategory } from '../types/graph';

export const NODE_CATEGORIES: NodeCategory[] = [
  {
    id: 'identity_people',
    category: 'Identity & People',
    defaultProperties: ['name', 'role', 'mfaEnabled', 'accessLevel'],
    description: 'Developers, admins, service accounts, and IAM roles accessing the pipeline.',
    iconName: 'Users',
    color: '#38bdf8', // Sky
    borderAccent: 'border-sky-500/30 hover:border-sky-500/70',
    bgAccent: 'bg-sky-500/10 text-sky-400',
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
    iconName: 'GitBranch',
    color: '#818cf8', // Indigo
    borderAccent: 'border-indigo-500/30 hover:border-indigo-500/70',
    bgAccent: 'bg-indigo-500/10 text-indigo-400',
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
    iconName: 'Package',
    color: '#f59e0b', // Amber
    borderAccent: 'border-amber-500/30 hover:border-amber-500/70',
    bgAccent: 'bg-amber-500/10 text-amber-400',
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
    iconName: 'Cpu',
    color: '#ec4899', // Pink
    borderAccent: 'border-pink-500/30 hover:border-pink-500/70',
    bgAccent: 'bg-pink-500/10 text-pink-400',
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
    iconName: 'Workflow',
    color: '#06b6d4', // Cyan
    borderAccent: 'border-cyan-500/30 hover:border-cyan-500/70',
    bgAccent: 'bg-cyan-500/10 text-cyan-400',
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
    iconName: 'Key',
    color: '#eab308', // Yellow
    borderAccent: 'border-yellow-500/30 hover:border-yellow-500/70',
    bgAccent: 'bg-yellow-500/10 text-yellow-400',
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
    iconName: 'Database',
    color: '#10b981', // Emerald
    borderAccent: 'border-emerald-500/30 hover:border-emerald-500/70',
    bgAccent: 'bg-emerald-500/10 text-emerald-400',
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
    iconName: 'Globe',
    color: '#a855f7', // Purple
    borderAccent: 'border-purple-500/30 hover:border-purple-500/70',
    bgAccent: 'bg-purple-500/10 text-purple-400',
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
    iconName: 'Server',
    color: '#f97316', // Orange
    borderAccent: 'border-orange-500/30 hover:border-orange-500/70',
    bgAccent: 'bg-orange-500/10 text-orange-400',
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
    iconName: 'ShieldAlert',
    color: '#ef4444', // Rose/Red
    borderAccent: 'border-red-500/30 hover:border-red-500/70',
    bgAccent: 'bg-red-500/10 text-red-400',
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
