import React from 'react';
import { useGraphStore } from '../store/graphStore';
import { ShieldCheck, Download, Trash2, Sparkles, Network } from 'lucide-react';

export const Header: React.FC = () => {
  const { nodes, edges, clearCanvas, addNode, addEdge, projectId } = useGraphStore();

  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ projectId, nodes, edges }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `pipelineguard-${projectId}.json`);
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
        position: { x: 80, y: 160 }
      });

      // 2. Source Control
      const githubRepo = await addNode({
        categoryId: 'source_control',
        properties: { name: 'org/payments-service', visibility: 'Private', branchProtection: true },
        position: { x: 360, y: 160 }
      });

      // 3. Dependencies
      const npmDeps = await addNode({
        categoryId: 'dependencies',
        properties: { name: 'npm-production-packages', packageManager: 'npm / yarn / pnpm', vulnerabilityScanning: true },
        position: { x: 360, y: 380 }
      });

      // 4. Secrets
      const vaultKms = await addNode({
        categoryId: 'secrets_credentials',
        properties: { name: 'KMS-Deploy-Role-Key', vaultType: 'OIDC Short-Lived Token', autoRevoke: true },
        position: { x: 640, y: 40 }
      });

      // 5. CI/CD
      const cicd = await addNode({
        categoryId: 'cicd_pipeline',
        properties: { name: 'Prod-Release-Pipeline', runnerType: 'GitHub Actions (Self-Hosted)', approvalRequired: true },
        position: { x: 640, y: 240 }
      });

      // 6. Artifact Storage
      const ociRegistry = await addNode({
        categoryId: 'artifact_storage',
        properties: { name: 'harbor.prod.corp/app', registryType: 'Harbor OCI Registry', immutableTags: true, signatureVerification: true },
        position: { x: 920, y: 240 }
      });

      // 7. Runtime
      const k8sCluster = await addNode({
        categoryId: 'runtime_environment',
        properties: { name: 'us-east-prod-cluster', environmentType: 'Production', enforceZeroTrust: true },
        position: { x: 1200, y: 240 }
      });

      // 8. Monitoring
      const falcoAudit = await addNode({
        categoryId: 'monitoring_response',
        properties: { name: 'Falco-Runtime-Guard', siemIntegration: 'Falco + Splunk', alertThreshold: 'All Anomalies (Zero-Tolerance)' },
        position: { x: 1200, y: 460 }
      });

      // Connect them with relationships
      await addEdge({ sourceNodeId: devTeam.id, targetNodeId: githubRepo.id, relationship: 'Pushes signed commits to' });
      await addEdge({ sourceNodeId: githubRepo.id, targetNodeId: cicd.id, relationship: 'Triggers build workflow' });
      await addEdge({ sourceNodeId: npmDeps.id, targetNodeId: cicd.id, relationship: 'Pulls verified dependencies into' });
      await addEdge({ sourceNodeId: vaultKms.id, targetNodeId: cicd.id, relationship: 'Injects ephemeral signing key' });
      await addEdge({ sourceNodeId: cicd.id, targetNodeId: ociRegistry.id, relationship: 'Publishes signed container image' });
      await addEdge({ sourceNodeId: ociRegistry.id, targetNodeId: k8sCluster.id, relationship: 'Deploys verified image to' });
      await addEdge({ sourceNodeId: k8sCluster.id, targetNodeId: falcoAudit.id, relationship: 'Streams eBPF runtime events' });

    } catch (e) {
      console.error('Failed to load sample pipeline:', e);
    }
  };

  return (
    <header className="h-14 bg-[#0b1120] border-b border-slate-800/80 px-4 flex items-center justify-between z-30 select-none">
      {/* Brand & Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-emerald-400 p-0.5 shadow-md shadow-cyan-500/20">
            <div className="w-full h-full bg-[#070a13] rounded-[6px] flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
            </div>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              PipelineGuard
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                v1.0
              </span>
            </h1>
            <p className="text-[10px] text-slate-400 font-mono">Cybersecurity Supply Chain Graph</p>
          </div>
        </div>

        <div className="h-4 w-px bg-slate-800 mx-2" />

        {/* Project Tag */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900/90 px-2.5 py-1 rounded-md border border-slate-800">
          <Network className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-mono text-[11px] text-slate-300">Project: {projectId}</span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2">
        {/* Sample Pipeline loader button */}
        <button
          onClick={handleLoadSamplePipeline}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-700/50 hover:border-cyan-500 rounded-lg transition-all shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Load Sample Pipeline</span>
        </button>

        {/* Clear Button */}
        {nodes.length > 0 && (
          <button
            onClick={clearCanvas}
            title="Clear all nodes and edges"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 rounded-lg transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}

        {/* Export JSON Button */}
        <button
          onClick={handleExportJson}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg transition-all"
        >
          <Download className="w-3.5 h-3.5 text-slate-400" />
          <span>Export Graph</span>
        </button>
      </div>
    </header>
  );
};
