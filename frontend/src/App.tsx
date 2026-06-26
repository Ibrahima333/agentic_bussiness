import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatArea } from "./components/ChatArea";
import { PipelineInput } from "./components/PipelineInput";
import { Dashboard } from "./components/Dashboard";
import { QuickChat } from "./components/QuickChat";
import { AppState } from "./types";
import { clearHistory, fetchConfig, fetchHistory, fetchResult } from "./lib/api";
import { MessageSquare, LayoutDashboard, MessagesSquare } from "lucide-react";

export default function App() {
  const [view, setView] = useState<"chat" | "quickchat" | "dashboard">("chat");
  const activeResultRequestRef = useRef<string | null>(null);
  const [state, setState] = useState<AppState>({
    databases: [],
    schemas: [],
    providers: [],
    selectedDatabase: "",
    selectedSchema: "",
    selectedProvider: (localStorage.getItem("askdata_provider") as string) || "gemini",
    overwriteExisting: false,
    history: [],
    activeResultId: null,
    activeResult: null,
    isLoading: false,
    isBootstrapping: true,
    errorMessage: null,
    insertText: null,
  });

  const refreshConfiguration = useCallback(async (preserveSelection = true) => {
    const [config, history] = await Promise.all([fetchConfig(), fetchHistory()]);

    setState((prev) => {
      const nextActiveResultId = preserveSelection && prev.activeResultId
        ? prev.activeResultId
        : (history[0]?.id ?? null);

      return {
        ...prev,
        databases: config.databases,
        schemas: config.schemas,
        providers: config.providers,
        selectedDatabase: preserveSelection && prev.selectedDatabase
          ? prev.selectedDatabase
          : config.selectedDatabase,
        selectedSchema: preserveSelection && prev.selectedSchema
          ? prev.selectedSchema
          : config.selectedSchema,
        // Le provider vient toujours du localStorage — jamais du backend
        selectedProvider: localStorage.getItem("askdata_provider") || prev.selectedProvider || config.selectedProvider,
        history,
        activeResultId: nextActiveResultId,
        activeResult: prev.activeResult?.id === nextActiveResultId ? prev.activeResult : null,
        errorMessage: null,
      };
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        await refreshConfiguration(false);
        if (cancelled) {
          return;
        }
        setState((prev) => ({
          ...prev,
          isBootstrapping: false,
        }));
      } catch (error) {
        if (cancelled) {
          return;
        }
        setState((prev) => ({
          ...prev,
          isBootstrapping: false,
          errorMessage: error instanceof Error ? error.message : "Impossible de charger l'application.",
        }));
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [refreshConfiguration]);

  useEffect(() => {
    if (!state.selectedDatabase) {
      return;
    }

    let cancelled = false;

    async function refreshSchemas() {
      try {
        const config = await fetchConfig(state.selectedDatabase);
        if (cancelled) {
          return;
        }

        setState((prev) => {
          const selectedSchema = config.schemas.includes(prev.selectedSchema)
            ? prev.selectedSchema
            : (config.selectedSchema || config.schemas[0] || "");

          return {
            ...prev,
            schemas: config.schemas,
            selectedSchema,
            errorMessage: prev.errorMessage,
          };
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setState((prev) => ({
          ...prev,
          errorMessage: error instanceof Error ? error.message : "Impossible de récupérer les schémas.",
        }));
      }
    }

    void refreshSchemas();
    return () => {
      cancelled = true;
    };
  }, [state.selectedDatabase]);

  useEffect(() => {
    if (!state.activeResultId) {
      return;
    }
    if (state.activeResult?.id === state.activeResultId) {
      return;
    }
    if (activeResultRequestRef.current === state.activeResultId) {
      return;
    }

    let cancelled = false;
    activeResultRequestRef.current = state.activeResultId;

    async function loadActiveResult() {
      try {
        const result = await fetchResult(state.activeResultId as string);
        if (cancelled) {
          return;
        }
        setState((prev) => ({
          ...prev,
          activeResult: result,
          errorMessage: null,
        }));
      } catch (error) {
        if (cancelled) {
          return;
        }
        setState((prev) => ({
          ...prev,
          errorMessage: error instanceof Error ? error.message : "Impossible de charger le résultat sélectionné.",
        }));
      } finally {
        activeResultRequestRef.current = null;
      }
    }

    void loadActiveResult();
    return () => {
      cancelled = true;
      activeResultRequestRef.current = null;
    };
  }, [state.activeResultId, state.activeResult]);

  const handleClearHistory = useCallback(async () => {
    await clearHistory();
    setState((prev) => ({
      ...prev,
      history: [],
      activeResultId: null,
      activeResult: null,
      errorMessage: null,
    }));
  }, []);

  return (
    <div className="flex h-screen bg-white font-sans text-zinc-900 overflow-hidden">
      <Sidebar
        state={state}
        setState={setState}
        onRefresh={() => void refreshConfiguration(true)}
        onClearHistory={() => void handleClearHistory()}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Barre de navigation des vues */}
        <nav className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-zinc-200 bg-white">
          <button
            type="button"
            onClick={() => setView("chat")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === "chat"
                ? "bg-zinc-100 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Analyse
          </button>
          <button
            type="button"
            onClick={() => setView("quickchat")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === "quickchat"
                ? "bg-zinc-100 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <MessagesSquare className="w-4 h-4" />
            Chat IA
          </button>
          <button
            type="button"
            onClick={() => setView("dashboard")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === "dashboard"
                ? "bg-zinc-100 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </button>
        </nav>

        {/* Contenu selon la vue */}
        {view === "chat" && (
          <div className="flex-1 flex flex-col relative overflow-hidden">
            <ChatArea state={state} />
            <PipelineInput state={state} setState={setState} />
          </div>
        )}
        {view === "quickchat" && (
          <QuickChat
            database={state.selectedDatabase}
            schema={state.selectedSchema}
            provider={state.selectedProvider}
          />
        )}
        {view === "dashboard" && <Dashboard />}
      </main>
    </div>
  );
}
