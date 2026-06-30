import React, { useState } from "react";
import { Database, LayoutTemplate, RefreshCw, History, FileText, Trash2 } from "lucide-react";
import { AppState } from "../types";
import { cn } from "../lib/utils";
import DatabaseConfig from "./DatabaseConfig";
import { connectDbConfig, fetchDbConfig, saveDbConfig, testDbConfig } from "../lib/api";
import LLMModelConfig from "./LLMModelConfig";
import { SchemaExplorer } from "./SchemaExplorer";

/** Logo AskData : bulle + barres */
function AskDataLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="#18181b" />
      <path d="M5 7 Q5 5 7 5 L25 5 Q27 5 27 7 L27 19 Q27 21 25 21 L13 21 L8 26 L8 21 Q5 21 5 19 Z"
        fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="9"  y="15" width="3" height="4" rx="1" fill="#6366f1" opacity="0.6" />
      <rect x="14" y="11" width="3" height="8" rx="1" fill="#6366f1" opacity="0.8" />
      <rect x="19" y="8"  width="3" height="11" rx="1" fill="#6366f1" />
    </svg>
  );
}

interface SidebarProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onRefresh: () => void;
  onClearHistory: () => Promise<void> | void;
}

export function Sidebar({ state, setState, onRefresh, onClearHistory }: SidebarProps) {
  const [isClearingHistory, setIsClearingHistory] = useState(false);

  const isReady = state.databases.length > 0 && state.selectedDatabase;

  const handleClearHistory = async () => {
    if (state.history.length === 0 || isClearingHistory) return;
    if (!window.confirm("Supprimer tout l'historique ?")) return;
    setIsClearingHistory(true);
    try { await onClearHistory(); } finally { setIsClearingHistory(false); }
  };

  return (
    <aside className="w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col h-screen text-zinc-100">

      {/* Logo */}
      <div className="px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <AskDataLogo />
          <div>
            <h1 className="font-bold text-white tracking-tight leading-none text-base">AskData</h1>
            <p className="text-[11px] text-zinc-500 mt-0.5">Interrogez vos données</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* Configuration */}
        <div className="p-4 space-y-3 border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Config</span>
            <button onClick={onRefresh} className="text-zinc-600 hover:text-zinc-300 transition-colors" title="Actualiser">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          <DatabaseConfig
            api={{ fetchDbConfig, testDbConfig, saveDbConfig, connectDbConfig }}
            onAfterConnect={() => void onRefresh()}
          />
          <LLMModelConfig onProviderChange={p => setState(prev => ({ ...prev, selectedProvider: p }))} />
        </div>

        {/* Cible */}
        {isReady && (
          <div className="p-4 space-y-3 border-b border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Cible</span>
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" /> Base
                </label>
                <select
                  className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-md p-2.5 outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  value={state.selectedDatabase}
                  onChange={e => setState({ ...state, selectedDatabase: e.target.value, selectedSchema: "", activeResultId: null, activeResult: null })}
                >
                  {state.databases.map(db => <option key={db} value={db}>{db}</option>)}
                </select>
              </div>
              {state.schemas.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                    <LayoutTemplate className="w-3.5 h-3.5" /> Schéma
                  </label>
                  <select
                    className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-md p-2.5 outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                    value={state.selectedSchema}
                    onChange={e => setState({ ...state, selectedSchema: e.target.value, activeResultId: null, activeResult: null })}
                  >
                    {state.schemas.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
            </div>
            <SchemaExplorer
              database={state.selectedDatabase}
              schema={state.selectedSchema}
              onInsert={text => setState(prev => ({ ...prev, insertText: text }))}
            />
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div className="relative shrink-0">
                <input type="checkbox" className="sr-only"
                  checked={state.overwriteExisting}
                  onChange={e => setState({ ...state, overwriteExisting: e.target.checked })} />
                <div className={cn("block w-8 h-4 rounded-full transition-colors", state.overwriteExisting ? "bg-indigo-600" : "bg-zinc-700")} />
                <div className={cn("absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition-transform shadow-sm", state.overwriteExisting ? "translate-x-4" : "")} />
              </div>
              <span className="text-[11px] text-zinc-600 group-hover:text-zinc-400 transition-colors">Écraser les résultats existants</span>
            </label>
          </div>
        )}

        {/* Historique */}
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Historique
            </span>
            {state.history.length > 0 && (
              <button
                onClick={() => void handleClearHistory()}
                disabled={isClearingHistory}
                className="text-[11px] text-zinc-600 hover:text-rose-400 flex items-center gap-1 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                {isClearingHistory ? "…" : "Effacer"}
              </button>
            )}
          </div>
          {state.history.length === 0 ? (
            <p className="text-xs text-zinc-600 italic">Aucune analyse pour l'instant.</p>
          ) : (
            <div className="space-y-0.5">
              {state.history.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setState({ ...state, activeResultId: item.id, activeResult: state.activeResult?.id === item.id ? state.activeResult : null })}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg border transition-all group",
                    state.activeResultId === item.id
                      ? "bg-indigo-600/20 border-indigo-500/30 text-white"
                      : "border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <FileText className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", state.activeResultId === item.id ? "text-indigo-400" : "text-zinc-600 group-hover:text-zinc-400")} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium leading-snug line-clamp-2">
                        {item.questionText || item.questionName}
                      </p>
                      <span className="text-[10px] text-zinc-600 mt-0.5 block">{item.databaseName}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
