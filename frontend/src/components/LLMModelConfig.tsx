import React, { useEffect, useState } from "react";
import { Cpu, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2, PlugZap } from "lucide-react";
import { cn } from "../lib/utils";
import { testLlmConfig, fetchLlmConfig, saveLlmConfig } from "../lib/api";

type Provider = "gemini" | "crok";
const STORAGE_KEY = "agentic_bi_provider";

type Form = { gemini_api_key: string; crok_api_key: string };
type Props = { onProviderChange?: (provider: string) => void };

export default function LLMModelConfig({ onProviderChange }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [provider, setProvider] = useState<Provider>(
    () => (localStorage.getItem(STORAGE_KEY) as Provider) ?? "gemini"
  );
  const [form, setForm] = useState<Form>({ gemini_api_key: "", crok_api_key: "" });
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
        setForm({
          gemini_api_key: cfg.config?.gemini_api_key ?? "",
          crok_api_key: cfg.config?.crok_api_key ?? "",
        });
        if (cfg.lastTest) {
          const ok = Boolean(cfg.lastTest.success);
          setConnected(ok);
          setStatus({ ok, message: cfg.lastTest.message ?? "" });
          if (ok) setIsOpen(false);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const switchProvider = (p: Provider) => {
    setProvider(p);
    setStatus(null);
    setConnected(null);
    localStorage.setItem(STORAGE_KEY, p);
    onProviderChange?.(p);
  };

  const currentKey = provider === "gemini" ? form.gemini_api_key : form.crok_api_key;

  const handleTest = async () => {
    setIsLoading(true);
    setStatus(null);
    const payload = provider === "gemini"
      ? { gemini_api_key: form.gemini_api_key }
      : { crok_api_key: form.crok_api_key };
    try {
      const result = await testLlmConfig(payload);
      const ok = Boolean(result.success);
      setConnected(ok);
      setStatus({ ok, message: result.message });
      if (ok) {
        await saveLlmConfig(payload);
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

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      {/* Header cliquable */}
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className="w-full p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left"
      >
        <div className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border",
          connected === true ? "bg-emerald-50 border-emerald-100" :
          connected === false ? "bg-rose-50 border-rose-100" :
          "bg-violet-50 border-violet-100"
        )}>
          <Cpu className={cn("w-4 h-4",
            connected === true ? "text-emerald-700" :
            connected === false ? "text-rose-700" :
            "text-violet-700"
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900 text-sm">Modèle LLM</div>
          <div className="text-xs text-slate-500 truncate">
            {connected === true ? `${providerLabel} · Connecté ✓` :
             connected === false ? `${providerLabel} · Échec` :
             "Non configuré"}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {connected === true && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          {connected === false && <XCircle className="w-4 h-4 text-rose-500" />}
          {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {/* Contenu repliable */}
      {isOpen && (
        <div className="border-t border-slate-100 p-4 space-y-3">
          {/* Toggle provider */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
            {(["gemini", "crok"] as Provider[]).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => switchProvider(p)}
                className={cn(
                  "flex-1 py-1.5 text-sm font-semibold rounded-lg transition-all",
                  provider === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                {p === "gemini" ? "Gemini" : "Groq"}
              </button>
            ))}
          </div>

          {/* Gemini */}
          {provider === "gemini" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Gemini API Key</label>
              <input
                type="password"
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-violet-500"
                value={form.gemini_api_key}
                onChange={e => setForm(f => ({ ...f, gemini_api_key: e.target.value }))}
                placeholder="AIza…"
                disabled={isLoading}
                autoComplete="off"
              />
            </div>
          )}

          {/* Groq */}
          {provider === "crok" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Groq API Key</label>
              <div className="text-xs text-slate-400 mb-1">🔗 api.groq.com</div>
              <input
                type="password"
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-violet-500"
                value={form.crok_api_key}
                onChange={e => setForm(f => ({ ...f, crok_api_key: e.target.value }))}
                placeholder="gsk_…"
                disabled={isLoading}
                autoComplete="off"
              />
            </div>
          )}

          {status && (
            <div className={cn(
              "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs",
              status.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"
            )}>
              {status.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
              {status.message}
            </div>
          )}

          <button
            type="button"
            disabled={isLoading || !currentKey}
            onClick={() => void handleTest()}
            className="w-full inline-flex items-center justify-center gap-2 bg-violet-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
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
