import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatArea } from "./components/ChatArea";
import { PipelineInput } from "./components/PipelineInput";
import { Dashboard } from "./components/Dashboard";
import { QuickChat } from "./components/QuickChat";
import { Login } from "./components/Login";
import { AdminPanel } from "./components/AdminPanel";
import { AppState } from "./types";
import { clearHistory, fetchConfig, fetchHistory, fetchResult } from "./lib/api";
import { MessageSquare, LayoutDashboard, MessagesSquare, Shield, LogOut } from "lucide-react";
import { clearAuth, getUser, isAuthenticated } from "./lib/auth";

export default function App() {
  const [authed, setAuthed]       = useState(() => isAuthenticated());
  const [currentUser, setCurrentUser] = useState(() => getUser());
  const [view, setView] = useState<"chat" | "quickchat" | "dashboard" | "admin">("chat");

  // Déconnexion automatique si le backend répond 401
  useEffect(() => {
    const handler = () => { setAuthed(false); setCurrentUser(null); };
    window.addEventListener("auth:logout", handler);
    return () => window.removeEventListener("auth:logout", handler);
  }, []);
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
    if (!authed) return;
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
  }, [refreshConfiguration, authed]);

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

  function handleLogout() {
    clearAuth();
    setAuthed(false);
    setCurrentUser(null);
  }

  if (!authed) {
    return <Login onLogin={() => { setAuthed(true); setCurrentUser(getUser()); }} />;
  }

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
        <nav className="shrink-0 flex items-center gap-0.5 px-4 border-b border-zinc-200 bg-white">
          {([
            { id: "chat",      label: "Analyse",   icon: <MessageSquare className="w-4 h-4" /> },
            { id: "quickchat", label: "Chat IA",   icon: <MessagesSquare className="w-4 h-4" /> },
            { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
          ] as { id: typeof view; label: string; icon: React.ReactNode }[]).map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setView(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                view === tab.id
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 hover:border-zinc-300"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Bouton Admin (admin uniquement) */}
          {currentUser?.role === "admin" && (
            <button
              type="button"
              onClick={() => setView("admin")}
              className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                view === "admin"
                  ? "border-violet-500 text-violet-700"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 hover:border-zinc-300"
              }`}
            >
              <Shield className="w-4 h-4" />
              Admin
            </button>
          )}

          {/* User + Logout */}
          <div className="flex items-center gap-1 pl-2 border-l border-zinc-200 ml-1">
            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold hidden sm:flex">
              {currentUser?.email?.[0]?.toUpperCase() ?? "?"}
            </div>
            <span className="text-xs text-zinc-500 px-1 hidden sm:block max-w-[140px] truncate">
              {currentUser?.email?.split("@")[0]}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="p-1.5 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Se déconnecter"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
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
        {view === "admin"     && <AdminPanel />}
      </main>
    </div>
  );
}
