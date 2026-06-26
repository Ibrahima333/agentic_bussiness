import React, { useEffect, useState } from "react";
import { Cpu, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2, PlugZap, Lock } from "lucide-react";
import { cn } from "../lib/utils";
import { testLlmConfig, fetchLlmConfig, saveLlmConfig } from "../lib/api";
import { getUser } from "../lib/auth";

type Provider = "gemini" | "groq";
const STORAGE_KEY = "askdata_provider";

type Form = { gemini_api_key: string; groq_api_key: string };
type Props = { onProviderChange?: (provider: string) => void };

export default function LLMModelConfig({ onProviderChange }: Props) {
  const isAdmin = getUser()?.role === "admin";

  const [isOpen, setIsOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>(
    () => (localStorage.getItem(STORAGE_KEY) as Provider) ?? "gemini"
  );
  const [form, setForm] = useState<Form>({ gemini_api_key: "", groq_api_key: "" });
  // true si la clé est déjà configurée en base (masquée côté backend)
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [groqConfigured, setGroqConfigured]     = useState(false);
  const [editingKey, setEditingKey] = useState<"gemini" | "groq" | null>(null);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => { onProviderChange?.(provider); }, []); // eslint-disable-line

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchLlmConfig();
        if (cancelled) return;
        if (isAdmin) {
          // Les clés retournées sont masquées ("***") — on détecte juste si elles existent
          const gConfigured = Boolean(cfg.config?.gemini_api_key);
          const rConfigured = Boolean(cfg.config?.groq_api_key);
          setGeminiConfigured(gConfigured);
          setGroqConfigured(rConfigured);
          // Si déjà configuré : replié + connecté affiché
          if (gConfigured || rConfigured) {
            setConnected(true);
            setStatus({ ok: true, message: "Clé(s) LLM configurée(s) en base" });
            setIsOpen(false);
          }
        } else {
          setAvailableProviders(cfg.availableProviders ?? []);
          if ((cfg.availableProviders ?? []).length > 0) setIsOpen(false);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  const switchProvider = (p: Provider) => {
    setProvider(p);
    setStatus(null);
    setConnected(null);
    localStorage.setItem(STORAGE_KEY, p);
    onProviderChange?.(p);
  };

  const currentKey = provider === "gemini" ? form.gemini_api_key : form.groq_api_key;

  const handleTest = async () => {
    setIsLoading(true);
    setStatus(null);
    const payload = provider === "gemini"
      ? { gemini_api_key: form.gemini_api_key }
      : { groq_api_key: form.groq_api_key };
    try {
      const result = await testLlmConfig(payload);
      const ok = Boolean(result.success);
      setConnected(ok);
      setStatus({ ok, message: result.message });
      if (ok) {
        await saveLlmConfig(payload);
        if (provider === "gemini") setGeminiConfigured(true);
        if (provider === "groq")   setGroqConfigured(true);
        setEditingKey(null);
        setForm({ gemini_api_key: "", groq_api_key: "" });
        setIsOpen(false);
      }
    } catch (err) {
      setConnected(false);
      setStatus({ ok: false, message: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setIsLoading(false);
    }
  };

  const providerLabel = provider === "gemini" ? "Gemini" : "Groq";

  // ── Vue USER : sélecteur simple ──────────────────────────────────────────────
  if (!isAdmin) {
    const providers: Provider[] = (availableProviders.length > 0
      ? availableProviders
      : ["gemini", "groq"]) as Provider[];

    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 overflow-hidden">
        <button
          type="button"
          onClick={() => setIsOpen(o => !o)}
          className="w-full p-4 flex items-center gap-3 hover:bg-zinc-700/50 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border bg-zinc-700 border-zinc-600">
            <Cpu className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-zinc-100 text-sm">Modèle LLM</div>
            <div className="text-xs text-zinc-400">{providerLabel} sélectionné</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Lock className="w-3.5 h-3.5 text-zinc-500" />
            {isOpen ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
          </div>
        </button>

        {isOpen && (
          <div className="border-t border-zinc-700/60 p-4 space-y-3">
            <p className="text-xs text-zinc-500 flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              Clés API configurées par l'administrateur
            </p>
            <div className="flex gap-1 p-1 bg-zinc-900 rounded-md">
              {providers.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => switchProvider(p)}
                  className={cn(
                    "flex-1 py-1.5 text-sm font-semibold rounded-xl transition-all",
                    provider === p ? "bg-indigo-600 text-white" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {p === "gemini" ? "Gemini" : "Groq"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Vue ADMIN : formulaire complet ───────────────────────────────────────────
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className="w-full p-4 flex items-center gap-3 hover:bg-zinc-700/50 transition-colors text-left"
      >
        <div className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border",
          connected === true  ? "bg-emerald-50 border-emerald-100" :
          connected === false ? "bg-rose-50 border-rose-100" :
          "bg-zinc-700 border-zinc-600"
        )}>
          <Cpu className={cn("w-4 h-4",
            connected === true  ? "text-emerald-700" :
            connected === false ? "text-rose-700" :
            "text-indigo-400"
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-zinc-100 text-sm">Modèle LLM</div>
          <div className="text-xs text-zinc-400 truncate">
            {connected === true  ? `${providerLabel} · Connecté ✓` :
             connected === false ? `${providerLabel} · Échec` :
             "Non configuré"}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {connected === true  && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          {connected === false && <XCircle className="w-4 h-4 text-rose-500" />}
          {isOpen ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-zinc-700/60 p-4 space-y-3">
          <div className="flex gap-1 p-1 bg-zinc-900 rounded-md">
            {(["gemini", "groq"] as Provider[]).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => switchProvider(p)}
                className={cn(
                  "flex-1 py-1.5 text-sm font-semibold rounded-xl transition-all",
                  provider === p ? "bg-indigo-600 text-white" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                {p === "gemini" ? "Gemini" : "Groq"}
              </button>
            ))}
          </div>

          {provider === "gemini" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400">Gemini API Key</label>
              {geminiConfigured && editingKey !== "gemini" ? (
                <div className="flex items-center gap-2 bg-zinc-900/60 border border-emerald-700/50 rounded-xl px-3 py-2.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="text-xs text-emerald-400 flex-1">Clé configurée</span>
                  <button type="button" onClick={() => setEditingKey("gemini")}
                    className="text-xs text-zinc-400 hover:text-zinc-100 underline">
                    Modifier
                  </button>
                </div>
              ) : (
                <input
                  type="password"
                  className="w-full bg-zinc-900/60 border border-zinc-700 text-zinc-100 text-sm rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={form.gemini_api_key}
                  onChange={e => setForm(f => ({ ...f, gemini_api_key: e.target.value }))}
                  placeholder="AIza…"
                  disabled={isLoading}
                  autoFocus
                  autoComplete="off"
                />
              )}
            </div>
          )}

          {provider === "groq" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400">Groq API Key</label>
              <div className="text-xs text-zinc-500 mb-1">🔗 api.groq.com</div>
              {groqConfigured && editingKey !== "groq" ? (
                <div className="flex items-center gap-2 bg-zinc-900/60 border border-emerald-700/50 rounded-xl px-3 py-2.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="text-xs text-emerald-400 flex-1">Clé configurée</span>
                  <button type="button" onClick={() => setEditingKey("groq")}
                    className="text-xs text-zinc-400 hover:text-zinc-100 underline">
                    Modifier
                  </button>
                </div>
              ) : (
                <input
                  type="password"
                  className="w-full bg-zinc-900/60 border border-zinc-700 text-zinc-100 text-sm rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={form.groq_api_key}
                  onChange={e => setForm(f => ({ ...f, groq_api_key: e.target.value }))}
                  placeholder="gsk_…"
                  disabled={isLoading}
                  autoFocus
                  autoComplete="off"
                />
              )}
            </div>
          )}

          {status && (
            <div className={cn(
              "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs",
              status.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            )}>
              {status.ok
                ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                : <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
              {status.message}
            </div>
          )}

          <button
            type="button"
            disabled={isLoading || !currentKey}
            onClick={() => void handleTest()}
            className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" />Test en cours…</>
              : <><PlugZap className="w-4 h-4" />Tester & Enregistrer</>}
          </button>
        </div>
      )}
    </div>
  );
}
