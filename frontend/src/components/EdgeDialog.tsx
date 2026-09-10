import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useGraphStore } from '../store/graphStore';
import { getProperty } from '../types/graph';
import { X, Link2, ArrowRight, Check } from 'lucide-react';

const RELATIONSHIP_PRESETS = [
  'Injects credentials into',
  'Triggers build in',
  'Pulls dependency into',
  'Publishes artifact to',
  'Deploys container to',
  'Monitors telemetry from',
  'Enforces branch policy on',
  'Signs artifact with',
  'Authenticates via OIDC'
];

interface EdgeFormValues {
  relationship: string;
}

export const EdgeDialog: React.FC = () => {
  const {
    isEdgeDialogOpen,
    pendingConnection,
    closeEdgeDialog,
    nodes,
    addEdge,
    isLoading
  } = useGraphStore();

  const [selectedPreset, setSelectedPreset] = useState<string>(RELATIONSHIP_PRESETS[0]);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<EdgeFormValues>({
    defaultValues: {
      relationship: RELATIONSHIP_PRESETS[0]
    }
  });

  if (!isEdgeDialogOpen || !pendingConnection) {
    return null;
  }

  const sourceNode = nodes.find((n) => n.id === pendingConnection.sourceNodeId);
  const targetNode = nodes.find((n) => n.id === pendingConnection.targetNodeId);

  const sourceName = sourceNode ? getProperty(sourceNode.properties, 'name') || sourceNode.id : 'Source Node';
  const targetName = targetNode ? getProperty(targetNode.properties, 'name') || targetNode.id : 'Target Node';

  const handleSelectPreset = (preset: string) => {
    setSelectedPreset(preset);
    setValue('relationship', preset);
  };

  const onSubmit = async (data: EdgeFormValues) => {
    try {
      await addEdge({
        sourceNodeId: pendingConnection.sourceNodeId,
        targetNodeId: pendingConnection.targetNodeId,
        relationship: data.relationship.trim()
      });
    } catch (err) {
      console.error('Failed to create edge:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-[#0f172a] border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/40 overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-gradient-to-r from-cyan-500/10 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Connect Supply Chain Nodes</h3>
              <p className="text-[11px] text-slate-400">Define the security relationship</p>
            </div>
          </div>
          <button
            onClick={closeEdgeDialog}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source -> Target Connection preview */}
        <div className="p-4 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="max-w-[42%] truncate">
            <span className="text-[10px] text-slate-500 uppercase font-mono block">From (Source)</span>
            <span className="font-semibold text-slate-200 truncate block">{sourceName}</span>
          </div>
          <ArrowRight className="w-4 h-4 text-cyan-400 shrink-0 mx-2" />
          <div className="max-w-[42%] text-right truncate">
            <span className="text-[10px] text-slate-500 uppercase font-mono block">To (Target)</span>
            <span className="font-semibold text-slate-200 truncate block">{targetName}</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-200">
              Relationship Label
            </label>
            <input
              type="text"
              placeholder="e.g. Injects credentials into"
              {...register('relationship', { required: 'Relationship description is required' })}
              className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-mono"
            />
            {errors.relationship && (
              <span className="text-[11px] text-rose-400 block">
                {errors.relationship.message}
              </span>
            )}
          </div>

          {/* Preset Buttons */}
          <div className="space-y-1.5">
            <span className="block text-[11px] font-medium text-slate-400">
              Or pick a security relationship preset:
            </span>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto custom-scrollbar pt-1">
              {RELATIONSHIP_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`text-[11px] px-2.5 py-1 rounded-md border transition-all text-left font-mono ${
                    selectedPreset === preset
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-medium'
                      : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={closeEdgeDialog}
              disabled={isLoading}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-lg border border-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 rounded-lg shadow-md shadow-cyan-600/30 transition-all disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isLoading ? 'Connecting...' : 'Save Relationship'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
