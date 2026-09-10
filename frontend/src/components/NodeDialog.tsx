import React, { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useGraphStore } from '../store/graphStore';
import { CategoryIcon } from './CategoryIcon';
import { X, Check, Sparkles } from 'lucide-react';

export const NodeDialog: React.FC = () => {
  const {
    isNodeDialogOpen,
    pendingDrop,
    closeNodeDialog,
    nodeCategories,
    addNode,
    isLoading
  } = useGraphStore();

  const category = nodeCategories.find((c) => c.id === pendingDrop?.categoryId);

  // Prepare default values
  const defaultValues: Record<string, any> = {};
  if (category) {
    // Fill from fieldDefs or defaultProperties
    category.defaultProperties.forEach((propKey) => {
      const fieldDef = category.fieldDefs?.find((f) => f.key === propKey);
      if (fieldDef) {
        defaultValues[propKey] = fieldDef.defaultValue !== undefined ? fieldDef.defaultValue : '';
      } else {
        if (propKey === 'name') {
          defaultValues[propKey] = `${category.category} Component`;
        } else if (
          propKey.toLowerCase().includes('protection') ||
          propKey.toLowerCase().includes('enabled') ||
          propKey.toLowerCase().includes('required') ||
          propKey.toLowerCase().includes('scanning') ||
          propKey.toLowerCase().includes('ephemeral') ||
          propKey.toLowerCase().includes('zerotrust') ||
          propKey.toLowerCase().includes('immutable')
        ) {
          defaultValues[propKey] = true;
        } else {
          defaultValues[propKey] = '';
        }
      }
    });
  }

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors }
  } = useForm({
    defaultValues
  });

  // Reset form whenever category or dialog open state changes
  useEffect(() => {
    if (isNodeDialogOpen && category) {
      reset(defaultValues);
    }
  }, [isNodeDialogOpen, category]);

  if (!isNodeDialogOpen || !category || !pendingDrop) {
    return null;
  }

  const onSubmit = async (data: Record<string, any>) => {
    try {
      await addNode({
        categoryId: category.id,
        properties: data,
        position: pendingDrop.position
      });
    } catch (err) {
      console.error('Error adding node:', err);
    }
  };

  const color = category.color || '#06b6d4';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-lg bg-[#0f172a] border border-slate-700/80 rounded-2xl shadow-2xl shadow-cyan-950/30 overflow-hidden animate-scale-in"
        style={{
          boxShadow: `0 10px 40px -10px ${color}22`
        }}
      >
        {/* Modal Header */}
        <div
          className="flex items-center justify-between p-4 border-b border-slate-800"
          style={{
            background: `linear-gradient(to right, ${color}18, transparent)`
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-sm"
              style={{
                backgroundColor: `${color}20`,
                borderColor: `${color}40`,
                color: color
              }}
            >
              <CategoryIcon iconName={category.iconName} className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">
                  Configure {category.category}
                </h3>
                <span
                  className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full border"
                  style={{
                    backgroundColor: `${color}15`,
                    borderColor: `${color}40`,
                    color: color
                  }}
                >
                  New Node
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {category.description || 'Supply chain component configuration'}
              </p>
            </div>
          </div>

          <button
            onClick={closeNodeDialog}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="text-xs text-slate-400 pb-2 border-b border-slate-800 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Dynamic schema fields derived from category specification:</span>
          </div>

          <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-4 custom-scrollbar">
            {category.defaultProperties.map((propKey) => {
              const fieldDef = category.fieldDefs?.find((f) => f.key === propKey);
              const label = fieldDef?.label || propKey.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
              const type = fieldDef?.type || (propKey.toLowerCase().includes('protection') || propKey.toLowerCase().includes('enabled') || propKey.toLowerCase().includes('required') ? 'checkbox' : 'text');

              if (type === 'checkbox') {
                return (
                  <Controller
                    key={propKey}
                    name={propKey}
                    control={control}
                    render={({ field }) => (
                      <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors group">
                        <input
                          type="checkbox"
                          checked={!!field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded text-cyan-500 bg-slate-950 border-slate-700 focus:ring-cyan-500/40 focus:ring-offset-0 transition-all accent-cyan-500"
                        />
                        <div className="text-xs">
                          <span className="font-semibold text-slate-200 group-hover:text-white transition-colors block">
                            {label}
                          </span>
                          {fieldDef?.description && (
                            <span className="text-slate-400 text-[11px] block mt-0.5">
                              {fieldDef.description}
                            </span>
                          )}
                        </div>
                      </label>
                    )}
                  />
                );
              }

              if (type === 'select' && fieldDef?.options) {
                return (
                  <div key={propKey} className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-200">
                      {label}
                    </label>
                    <select
                      {...register(propKey, { required: `${label} is required` })}
                      className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                    >
                      {fieldDef.options.map((opt) => (
                        <option key={opt} value={opt} className="bg-slate-900 text-slate-200">
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }

              return (
                <div key={propKey} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-200">
                      {label}
                    </label>
                    <span className="text-[10px] font-mono text-slate-500">string</span>
                  </div>
                  <input
                    type="text"
                    placeholder={fieldDef?.placeholder || `Enter ${label}...`}
                    {...register(propKey, {
                      required: propKey === 'name' ? 'Name is required' : false
                    })}
                    className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                  />
                  {errors[propKey] && (
                    <span className="text-[11px] text-rose-400 block">
                      {errors[propKey]?.message as string}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Modal Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={closeNodeDialog}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-lg border border-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 rounded-lg shadow-md shadow-cyan-600/30 transition-all disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isLoading ? 'Creating Node...' : 'Add Node to Pipeline'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
