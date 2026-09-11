export interface RelationshipDefinition {
  id: string;
  label: string;
  description: string;
}

export interface RelationshipRule {
  sourceCategory: string;
  targetCategory: string;
  relationships: string[];
}

export type RelationshipErrorCode =
  | 'INVALID_CATEGORY_CONNECTION'
  | 'INVALID_RELATIONSHIP'
  | 'DUPLICATE_EDGE'
  | 'NODE_NOT_FOUND';

export interface RelationshipErrorPayload {
  code: RelationshipErrorCode;
  message: string;
  allowed?: string[];
}

export class SemanticGraphError extends Error {
  code: RelationshipErrorCode;
  allowed?: string[];

  constructor(payload: RelationshipErrorPayload) {
    super(payload.message);
    this.name = 'SemanticGraphError';
    this.code = payload.code;
    this.allowed = payload.allowed;
  }
}

// Complete registry of all semantic relationship definitions
export const RELATIONSHIP_DEFINITIONS: RelationshipDefinition[] = [
  {
    id: 'contributes_to',
    label: 'Contributes To',
    description: 'Authors or pushes code commits and pull requests to the source code repository.'
  },
  {
    id: 'maintains',
    label: 'Maintains',
    description: 'Manages branches, code review policies, permissions, and security settings for the repository.'
  },
  {
    id: 'triggers',
    label: 'Triggers',
    description: 'Initiates or starts an automated CI/CD pipeline workflow based on source code events.'
  },
  {
    id: 'references',
    label: 'References',
    description: 'Declares third-party dependencies, packages, or links external resources.'
  },
  {
    id: 'provides_source',
    label: 'Provides Source',
    description: 'Checks out and supplies validated source code to isolated build environments.'
  },
  {
    id: 'consumed_by',
    label: 'Consumed By',
    description: 'Imports and links third-party dependencies into the build runner compilation step.'
  },
  {
    id: 'executes',
    label: 'Executes',
    description: 'Orchestrates and executes jobs, tests, and build commands within worker environments.'
  },
  {
    id: 'authenticates',
    label: 'Authenticates',
    description: 'Supplies cryptographic tokens, OIDC credentials, or certificates to authenticate access.'
  },
  {
    id: 'signs',
    label: 'Signs',
    description: 'Applies cryptographic cosign / KMS digital signatures to release bundles and binaries.'
  },
  {
    id: 'produces',
    label: 'Produces',
    description: 'Compiles, packages, and outputs built artifacts, container images, or binaries.'
  },
  {
    id: 'publishes',
    label: 'Publishes',
    description: 'Pushes verified build artifacts and container images into registries or repositories.'
  },
  {
    id: 'provides',
    label: 'Provides',
    description: 'Serves stored container images and binary packages to runtime or delivery environments.'
  },
  {
    id: 'delivers',
    label: 'Delivers',
    description: 'Transfers signed release packages from distribution gateways to production workloads.'
  },
  {
    id: 'deploys',
    label: 'Deploys',
    description: 'Rolls out and provisions application workloads into the target runtime environment.'
  },
  {
    id: 'monitored_by',
    label: 'Monitored By',
    description: 'Monitored by eBPF sensors, SIEM agents, and runtime telemetry systems.'
  },
  {
    id: 'logs_to',
    label: 'Logs To',
    description: 'Streams execution logs, telemetry metrics, and build audit events to monitoring systems.'
  },
  {
    id: 'alerts',
    label: 'Alerts',
    description: 'Dispatches high-priority incident notifications and security alerts to human responders.'
  },
  {
    id: 'administers',
    label: 'Administers',
    description: 'Configures, oversees, and manages runtime clusters and workload environments.'
  },
  {
    id: 'approves',
    label: 'Approves',
    description: 'Authorizes manual production approval gates or security reviews before progression.'
  },
  {
    id: 'operates',
    label: 'Operates',
    description: 'Configures and manages continuous integration workflows and deployment pipelines.'
  },
  {
    id: 'accesses',
    label: 'Accesses',
    description: 'Accesses and provisions credentials, signing keys, and secrets from secure vaults.'
  }
];

export const RELATIONSHIPS_BY_ID: Record<string, RelationshipDefinition> = Object.fromEntries(
  RELATIONSHIP_DEFINITIONS.map((def) => [def.id, def])
);

// Semantic Relationship Rule Matrix (Single Source of Truth)
export const RELATIONSHIP_RULES: RelationshipRule[] = [
  {
    sourceCategory: 'identity_people',
    targetCategory: 'source_control',
    relationships: ['contributes_to', 'maintains']
  },
  {
    sourceCategory: 'identity_people',
    targetCategory: 'cicd_pipeline',
    relationships: ['operates', 'approves']
  },
  {
    sourceCategory: 'identity_people',
    targetCategory: 'secrets_credentials',
    relationships: ['accesses']
  },
  {
    sourceCategory: 'identity_people',
    targetCategory: 'runtime_environment',
    relationships: ['administers']
  },
  {
    sourceCategory: 'source_control',
    targetCategory: 'dependencies',
    relationships: ['references']
  },
  {
    sourceCategory: 'source_control',
    targetCategory: 'build_environment',
    relationships: ['provides_source']
  },
  {
    sourceCategory: 'source_control',
    targetCategory: 'cicd_pipeline',
    relationships: ['triggers']
  },
  {
    sourceCategory: 'dependencies',
    targetCategory: 'build_environment',
    relationships: ['consumed_by']
  },
  {
    sourceCategory: 'dependencies',
    targetCategory: 'runtime_environment',
    relationships: ['references']
  },
  {
    sourceCategory: 'cicd_pipeline',
    targetCategory: 'build_environment',
    relationships: ['executes']
  },
  {
    sourceCategory: 'cicd_pipeline',
    targetCategory: 'artifact_storage',
    relationships: ['publishes']
  },
  {
    sourceCategory: 'cicd_pipeline',
    targetCategory: 'distribution',
    relationships: ['deploys']
  },
  {
    sourceCategory: 'cicd_pipeline',
    targetCategory: 'runtime_environment',
    relationships: ['deploys']
  },
  {
    sourceCategory: 'build_environment',
    targetCategory: 'artifact_storage',
    relationships: ['produces']
  },
  {
    sourceCategory: 'build_environment',
    targetCategory: 'monitoring_response',
    relationships: ['logs_to']
  },
  {
    sourceCategory: 'secrets_credentials',
    targetCategory: 'cicd_pipeline',
    relationships: ['authenticates']
  },
  {
    sourceCategory: 'secrets_credentials',
    targetCategory: 'build_environment',
    relationships: ['authenticates']
  },
  {
    sourceCategory: 'secrets_credentials',
    targetCategory: 'distribution',
    relationships: ['signs']
  },
  {
    sourceCategory: 'artifact_storage',
    targetCategory: 'distribution',
    relationships: ['provides']
  },
  {
    sourceCategory: 'artifact_storage',
    targetCategory: 'runtime_environment',
    relationships: ['provides']
  },
  {
    sourceCategory: 'distribution',
    targetCategory: 'runtime_environment',
    relationships: ['delivers']
  },
  {
    sourceCategory: 'runtime_environment',
    targetCategory: 'monitoring_response',
    relationships: ['monitored_by']
  },
  {
    sourceCategory: 'runtime_environment',
    targetCategory: 'secrets_credentials',
    relationships: ['authenticates']
  },
  {
    sourceCategory: 'monitoring_response',
    targetCategory: 'identity_people',
    relationships: ['alerts']
  },
  {
    sourceCategory: 'monitoring_response',
    targetCategory: 'cicd_pipeline',
    relationships: ['logs_to']
  }
];

export interface ValidRelationshipsResult {
  valid: boolean;
  relationships: RelationshipDefinition[];
}

/**
 * Returns all valid relationship definitions allowed between a source and target category.
 */
export function getValidRelationships(
  sourceCategory: string,
  targetCategory: string
): ValidRelationshipsResult {
  const rule = RELATIONSHIP_RULES.find(
    (r) => r.sourceCategory === sourceCategory && r.targetCategory === targetCategory
  );

  if (!rule || rule.relationships.length === 0) {
    return {
      valid: false,
      relationships: []
    };
  }

  const relationships = rule.relationships
    .map((id) => RELATIONSHIPS_BY_ID[id])
    .filter((def): def is RelationshipDefinition => Boolean(def));

  return {
    valid: relationships.length > 0,
    relationships
  };
}

/**
 * Async API simulation to fetch all relationship definitions.
 */
export async function getRelationships(): Promise<RelationshipDefinition[]> {
  await new Promise((resolve) => setTimeout(resolve, 30));
  return JSON.parse(JSON.stringify(RELATIONSHIP_DEFINITIONS));
}

/**
 * Async API simulation to validate and retrieve relationships between two categories.
 */
export async function getValidRelationshipsAsync(
  sourceCategory: string,
  targetCategory: string
): Promise<ValidRelationshipsResult> {
  await new Promise((resolve) => setTimeout(resolve, 30));
  return getValidRelationships(sourceCategory, targetCategory);
}

/**
 * Semantic Relationship Group Colors
 * Identity: Blue
 * Build: Purple
 * Security: Amber
 * Artifact: Emerald
 * Deployment: Pink
 * Monitoring: Gray
 */
export type RelationshipGroup =
  | 'Identity'
  | 'Build'
  | 'Security'
  | 'Artifact'
  | 'Deployment'
  | 'Monitoring';

export interface SemanticGroupInfo {
  group: RelationshipGroup;
  color: string;
}

export function getRelationshipGroupInfo(relationshipId: string): SemanticGroupInfo {
  switch (relationshipId) {
    case 'contributes_to':
    case 'maintains':
    case 'operates':
    case 'administers':
    case 'approves':
      return { group: 'Identity', color: '#3b82f6' }; // Blue

    case 'provides_source':
    case 'consumed_by':
    case 'executes':
    case 'produces':
      return { group: 'Build', color: '#a855f7' }; // Purple

    case 'authenticates':
    case 'signs':
    case 'accesses':
      return { group: 'Security', color: '#f59e0b' }; // Amber

    case 'publishes':
    case 'provides':
      return { group: 'Artifact', color: '#10b981' }; // Emerald

    case 'deploys':
    case 'delivers':
    case 'triggers':
      return { group: 'Deployment', color: '#ec4899' }; // Pink

    case 'monitored_by':
    case 'logs_to':
    case 'alerts':
    case 'references':
    default:
      return { group: 'Monitoring', color: '#94a3b8' }; // Gray
  }
}

export function getRelationshipColor(relationshipId: string): string {
  return getRelationshipGroupInfo(relationshipId).color;
}
