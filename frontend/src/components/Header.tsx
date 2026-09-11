import React from 'react';
import { useGraphStore } from '../store/graphStore';

export const Header: React.FC = () => {
  const { nodes, edges, clearCanvas, addNode, addEdge, projectId } = useGraphStore();

  const handleExportJson = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify({ projectId, nodes, edges }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `pipelineguard-${projectId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleLoadSamplePipeline = async () => {
    clearCanvas();

    try {
      // 1. Identity
      const devTeam = await addNode({
        categoryId: 'identity_people',
        properties: { name: 'Core Dev Team', role: 'Maintainer', mfaEnabled: true, accessLevel: 'Write' },
        position: { x: 100, y: 220 }
      });

      // 2. Source Control
      const githubRepo = await addNode({
        categoryId: 'source_control',
        properties: { name: 'org/payments-service', visibility: 'Private', branchProtection: true },
        position: { x: 340, y: 140 }
      });

      // 3. Dependencies
      const npmDeps = await addNode({
        categoryId: 'dependencies',
        properties: { name: 'npm-dependencies', packageManager: 'npm / yarn / pnpm', vulnerabilityScanning: true },
        position: { x: 340, y: 380 }
      });

      // 4. Secrets
      const vaultKms = await addNode({
        categoryId: 'secrets_credentials',
        properties: { name: 'KMS Signer Key', vaultType: 'OIDC Short-Lived Token', autoRevoke: true },
        position: { x: 580, y: 60 }
      });

      // 5. CI/CD
      const cicd = await addNode({
        categoryId: 'cicd_pipeline',
        properties: { name: 'Prod Release Pipeline', runnerType: 'GitHub Actions (Self-Hosted)', approvalRequired: true },
        position: { x: 580, y: 220 }
      });

      // 6. Build Environment
      const buildWorker = await addNode({
        categoryId: 'build_environment',
        properties: { name: 'Hermetic Builder Node', isolationLevel: 'Hermetic Container', ephemeral: true },
        position: { x: 820, y: 220 }
      });

      // 7. Artifact Storage
      const ociRegistry = await addNode({
        categoryId: 'artifact_storage',
        properties: { name: 'Harbor OCI Registry', registryType: 'Harbor OCI Registry', immutableTags: true, signatureVerification: true },
        position: { x: 1060, y: 220 }
      });

      // 8. Runtime
      const k8sCluster = await addNode({
        categoryId: 'runtime_environment',
        properties: { name: 'Production EKS Cluster', environmentType: 'Production', enforceZeroTrust: true },
        position: { x: 1300, y: 220 }
      });

      // 9. Monitoring
      const falcoAudit = await addNode({
        categoryId: 'monitoring_response',
        properties: { name: 'Falco Threat Guard', siemIntegration: 'Falco + Splunk', alertThreshold: 'All Anomalies (Zero-Tolerance)' },
        position: { x: 700, y: 440 }
      });

      // Connect them with strictly valid semantic relationships
      await addEdge({ sourceNodeId: devTeam.id, targetNodeId: githubRepo.id, relationshipId: 'contributes_to' });
      await addEdge({ sourceNodeId: githubRepo.id, targetNodeId: cicd.id, relationshipId: 'triggers' });
      await addEdge({ sourceNodeId: githubRepo.id, targetNodeId: buildWorker.id, relationshipId: 'provides_source' });
      await addEdge({ sourceNodeId: vaultKms.id, targetNodeId: cicd.id, relationshipId: 'authenticates' });
      await addEdge({ sourceNodeId: cicd.id, targetNodeId: buildWorker.id, relationshipId: 'executes' });
      await addEdge({ sourceNodeId: npmDeps.id, targetNodeId: buildWorker.id, relationshipId: 'consumed_by' });
      await addEdge({ sourceNodeId: buildWorker.id, targetNodeId: ociRegistry.id, relationshipId: 'produces' });
      await addEdge({ sourceNodeId: ociRegistry.id, targetNodeId: k8sCluster.id, relationshipId: 'provides' });
      await addEdge({ sourceNodeId: k8sCluster.id, targetNodeId: falcoAudit.id, relationshipId: 'monitored_by' });
      await addEdge({ sourceNodeId: falcoAudit.id, targetNodeId: devTeam.id, relationshipId: 'alerts' });
    } catch (e) {
      console.error('Failed to load sample pipeline:', e);
    }
  };

  return (
    <header className="h-14 bg-[#0B1220]/80 backdrop-blur-md border-b border-white/5 px-6 flex items-center justify-between z-30 select-none">
      {/* Project name only */}
      <div className="flex items-center">
        <h1 className="text-sm font-semibold tracking-tight text-slate-100">
          PipelineGuard
        </h1>
      </div>

      {/* Action buttons: Load Sample, Export */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleLoadSamplePipeline}
          className="px-3 py-1.5 text-xs font-normal text-slate-300 hover:text-white hover:bg-white/5 rounded-md transition-colors"
        >
          Load Sample
        </button>

        <button
          onClick={handleExportJson}
          className="px-3 py-1.5 text-xs font-normal text-slate-300 hover:text-white hover:bg-white/5 rounded-md transition-colors"
        >
          Export
        </button>
      </div>
    </header>
  );
};
