import React, { useState } from "react";
import { Sparkles, Loader2, AlertCircle, Send } from "lucide-react";
import { AppState } from "../types";
import { runPipeline } from "../lib/api";
import { cn } from "../lib/utils";

interface PipelineInputProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function PipelineInput({ state, setState }: PipelineInputProps) {
  const [question, setQuestion] = useState("");

  const isReady = state.databases.length > 0 && state.selectedDatabase && !state.isBootstrapping;
  const canSubmit = isReady && question.trim() && !state.isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setState(prev => ({ ...prev, isLoading: true, errorMessage: null }));

    try {
      const result = await runPipeline({
        questionText: question,
        artifactName: "",
        databaseName: state.selectedDatabase,
        schemaName: state.selectedSchema,
        providerName: state.selectedProvider,
        overwriteExisting: state.overwriteExisting,
      });

      setState(prev => ({
        ...prev,
        isLoading: false,
        history: [
          { id: result.id, questionName: result.questionName, questionText: result.questionText,
            databaseName: result.databaseName, schemaName: result.schemaName,
            providerName: result.providerName, timestamp: result.timestamp },
          ...prev.history.filter(h => h.id !== result.id),
        ],
        activeResultId: result.id,
        activeResult: result,
        errorMessage: null,
      }));
      setQuestion("");
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        errorMessage: error instanceof Error ? error.message : "Échec de l'analyse.",
      }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSubmit(e as any);
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-50 via-slate-50/95 to-transparent pt-8 pb-5 px-6">
      <div className="max-w-3xl mx-auto space-y-2">
        {/* Erreur inline */}
        {state.errorMessage && (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-500" />
            <span>{state.errorMessage}</span>
          </div>
        )}

        {/* Hint DB non connectée */}
        {!isReady && !state.isBootstrapping && (
          <div className="text-center text-xs text-slate-400">
            Connectez d'abord une base de données dans la sidebar →
          </div>
        )}

        {/* Zone de saisie */}
        <form onSubmit={handleSubmit}
          className={cn(
            "bg-white border rounded-2xl shadow-lg shadow-slate-200/50 overflow-hidden transition-all",
            canSubmit || question.trim()
              ? "border-blue-300 ring-4 ring-blue-50"
              : "border-slate-200"
          )}
        >
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isReady
              ? `Posez une question sur ${state.selectedDatabase}… (⌘+Entrée pour envoyer)`
              : "Connectez une base pour commencer…"}
            className="w-full resize-none outline-none text-slate-900 placeholder:text-slate-400 text-[15px] p-4 min-h-[72px] max-h-40"
            disabled={!isReady || state.isLoading}
          />
          <div className="flex items-center justify-between px-4 pb-3 gap-3">
            <div className="text-xs text-slate-400">
              {state.selectedDatabase && state.selectedSchema
                ? <span className="bg-slate-100 px-2 py-1 rounded-lg font-mono">{state.selectedDatabase} · {state.selectedSchema}</span>
                : null}
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className={cn(
                "inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all",
                canSubmit
                  ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-200"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              )}
            >
              {state.isLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Analyse…</>
                : <><Send className="w-4 h-4" />Analyser</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
