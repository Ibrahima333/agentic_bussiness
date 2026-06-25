import React, { useState } from "react";
import { Database, LayoutTemplate, RefreshCw, History, FileText, Sparkles, Trash2, ChevronDown } from "lucide-react";
import { AppState } from "../types";
import { cn } from "../lib/utils";
import DatabaseConfig from "./DatabaseConfig";
import { connectDbConfig, fetchDbConfig, saveDbConfig, testDbConfig } from "../lib/api";
import LLMModelConfig from "./LLMModelConfig";

interface SidebarProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onRefresh: () => void;
  onClearHistory: () => Promise<void> | void;
}

export function Sidebar({ state, setState, onRefresh, onClearHistory }: SidebarProps) {
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isReady = state.databases.length > 0 && state.selectedDatabase;

  const handleClearHistory = async () => {
    if (state.history.length === 0 || isClearingHistory) return;
    if (!window.confirm("Supprimer tout l'historique ?")) return;
    setIsClearingHistory(true);
    try {
      await onClearHistory();
    } finally {
      setIsClearingHistory(false);
    }
  };

  return (
    <aside className="w-72 bg-white border-r border-slate-200 flex flex-col h-screen">
      {/* Logo */}
      <div className="p-5 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 leading-tight">Agentic BI</h1>
            <p className="text-[11px] text-slate-400">Business Intelligence</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Section Config */}
        <div className="p-4 space-y-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Configuration</span>
            <button onClick={onRefresh} className="text-slate-400 hover:text-blue-600 transition-colors" title="Actualiser">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <DatabaseConfig
            api={{ fetchDbConfig, testDbConfig, saveDbConfig, connectDbConfig }}
            onAfterConnect={() => void onRefresh()}
          />

          <LLMModelConfig onProviderChange={p => setState(prev => ({ ...prev, selectedProvider: p }))} />
        </div>

        {/* Section Cible — uniquement si connecté */}
        {isReady && (
          <div className="p-4 space-y-3 border-b border-slate-100">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cible</span>

            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" /> Base
                </label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  value={state.selectedDatabase}
                  onChange={e => setState({ ...state, selectedDatabase: e.target.value, selectedSchema: "" })}
                >
                  {state.databases.map(db => <option key={db} value={db}>{db}</option>)}
                </select>
              </div>

              {state.schemas.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                    <LayoutTemplate className="w-3.5 h-3.5" /> Schéma
                  </label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    value={state.selectedSchema}
                    onChange={e => setState({ ...state, selectedSchema: e.target.value })}
                  >
                    {state.schemas.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Options avancées repliables */}
            <button
              type="button"
              onClick={() => setShowAdvanced(o => !o)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showAdvanced && "rotate-180")} />
              Options avancées
            </button>
            {showAdvanced && (
              <label className="flex items-center gap-2 cursor-pointer group">
                <div className="relative">
                  <input type="checkbox" className="sr-only"
                    checked={state.overwriteExisting}
                    onChange={e => setState({ ...state, overwriteExisting: e.target.checked })} />
                  <div className={cn("block w-9 h-5 rounded-full transition-colors", state.overwriteExisting ? "bg-blue-600" : "bg-slate-200")} />
                  <div className={cn("absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform shadow-sm", state.overwriteExisting ? "translate-x-4" : "")} />
                </div>
                <span className="text-xs text-slate-600">Écraser les résultats existants</span>
              </label>
            )}
          </div>
        )}

        {/* Section Historique */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Historique
            </span>
            {state.history.length > 0 && (
              <button
                onClick={() => void handleClearHistory()}
                disabled={isClearingHistory}
                className="text-[11px] text-rose-500 hover:text-rose-700 flex items-center gap-1 disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" />
                {isClearingHistory ? "…" : "Effacer"}
              </button>
            )}
          </div>

          {state.history.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Aucune analyse pour l'instant.</p>
          ) : (
            <div className="space-y-1.5">
              {state.history.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setState({ ...state, activeResultId: item.id, activeResult: state.activeResult?.id === item.id ? state.activeResult : null })}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-xl border transition-all",
                    state.activeResultId === item.id
                      ? "bg-blue-50 border-blue-200"
                      : "bg-slate-50 border-transparent hover:border-slate-200 hover:bg-white"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800 truncate">{item.questionName}</span>
                    <FileText className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", state.activeResultId === item.id ? "text-blue-500" : "text-slate-300")} />
                  </div>
                  <span className="text-[11px] text-slate-400">{item.databaseName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
