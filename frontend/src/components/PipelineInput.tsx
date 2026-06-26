import React, { useEffect, useState } from "react";
import { Loader2, AlertCircle, ArrowUp } from "lucide-react";
import { AppState } from "../types";
import { runPipeline } from "../lib/api";
import { cn } from "../lib/utils";

interface PipelineInputProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function PipelineInput({ state, setState }: PipelineInputProps) {
  const [question, setQuestion] = useState("");

  useEffect(() => {
    if (state.insertText) {
      setQuestion(prev => prev ? `${prev} ${state.insertText}` : state.insertText!);
      setState(prev => ({ ...prev, insertText: null }));
    }
  }, [state.insertText]);

  const isReady = state.databases.length > 0 && state.selectedDatabase && !state.isBootstrapping;
  const canSubmit = isReady && question.trim() && !state.isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setState(prev => ({ ...prev, isLoading: true, errorMessage: null }));
    try {
      const result = await runPipeline({
        questionText: question, artifactName: "",
        databaseName: state.selectedDatabase, schemaName: state.selectedSchema,
        providerName: state.selectedProvider, overwriteExisting: state.overwriteExisting,
      });
      setState(prev => ({
        ...prev, isLoading: false,
        history: [
          { id: result.id, questionName: result.questionName, questionText: result.questionText,
            databaseName: result.databaseName, schemaName: result.schemaName,
            providerName: result.providerName, timestamp: result.timestamp },
          ...prev.history.filter(h => h.id !== result.id),
        ],
        activeResultId: result.id, activeResult: result, errorMessage: null,
      }));
      setQuestion("");
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false, errorMessage: error instanceof Error ? error.message : "Echec de l'analyse." }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void handleSubmit(e as any); }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white/95 to-transparent pt-8 pb-5 px-6">
      <div className="max-w-3xl mx-auto space-y-2">
        {state.errorMessage && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{state.errorMessage}</span>
          </div>
        )}
        {!isReady && !state.isBootstrapping && (
          <p className="text-center text-xs text-zinc-400">Configurez d'abord votre base dans la sidebar</p>
        )}
        <form onSubmit={handleSubmit} className={cn(
          "bg-white border rounded-xl overflow-hidden transition-all",
          canSubmit || question.trim() ? "border-indigo-400 ring-2 ring-indigo-100" : "border-zinc-300"
        )}>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isReady ? `Posez une question sur ${state.selectedDatabase}… (⌘+Entrée)` : "Connectez une base pour commencer…"}
            className="w-full resize-none outline-none text-zinc-900 placeholder:text-zinc-400 text-[15px] p-4 min-h-[72px] max-h-40 bg-white"
            disabled={!isReady || state.isLoading}
          />
          <div className="flex items-center justify-between px-4 pb-3 gap-3 bg-white">
            <div className="text-xs text-zinc-400">
              {state.selectedDatabase && state.selectedSchema && (
                <code className="bg-zinc-100 px-2 py-1 rounded font-mono text-zinc-600">
                  {state.selectedDatabase} / {state.selectedSchema}
                </code>
              )}
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center transition-all",
                canSubmit ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
              )}
            >
              {state.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
