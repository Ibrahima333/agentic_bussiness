import React, { useEffect, useState } from "react";
import { KeyRound, TestTube2, ShieldCheck, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { testLlmConfig, fetchLlmConfig, saveLlmConfig } from "../lib/api";

type Provider = "gemini" | "crok";

const STORAGE_KEY = "agentic_bi_provider";

type Form = {
  gemini_api_key: string;
  crok_api_key: string;
};

type Props = {
  onProviderChange?: (provider: string) => void;
};

export default function LLMModelConfig({ onProviderChange }: Props) {
  const [provider, setProvider] = useState<Provider>(
    () => (localStorage.getItem(STORAGE_KEY) as Provider) ?? "gemini"
  );
  const [form, setForm] = useState<Form>({ gemini_api_key: "", crok_api_key: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  // Sync provider to parent on mount
  useEffect(() => {
    onProviderChange?.(provider);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          setStatus({ ok: Boolean(cfg.lastTest.success), message: cfg.lastTest.message ?? "" });
        }
      } catch {
        // silent
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const switchProvider = (p: Provider) => {
    setProvider(p);
    setStatus(null);
    localStorage.setItem(STORAGE_KEY, p);
    onProviderChange?.(p);
  };

  const patch = (key: keyof Form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const buildPayload = () =>
    provider === "gemini"
      ? { gemini_api_key: form.gemini_api_key }
      : { crok_api_key: form.crok_api_key };

  const handleTest = async () => {
    setIsLoading(true);
    setStatus(null);
    try {
      const result = await testLlmConfig(buildPayload());
      setStatus({ ok: Boolean(result.success), message: result.message });
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    setStatus(null);
    try {
      const result = await saveLlmConfig(buildPayload());
      setStatus({ ok: Boolean(result.success ?? true), message: result.message ?? "Configuration enregistrée" });
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
          <KeyRound className="w-4 h-4 text-violet-700" />
        </div>
        <div>
          <div className="font-semibold text-slate-900">LLM Provider</div>
          <div className="text-xs text-slate-500">Clé API &amp; connexion</div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Provider toggle */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
          {(["gemini", "crok"] as Provider[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => switchProvider(p)}
              className={cn(
                "flex-1 py-1.5 text-sm font-semibold rounded-lg transition-all",
                provider === p
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {p === "gemini" ? "Gemini" : "Groq"}
            </button>
          ))}
        </div>

        {/* Gemini fields */}
        {provider === "gemini" && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Gemini API Key</label>
            <input
              type="password"
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 p-2.5 outline-none"
              value={form.gemini_api_key}
              onChange={(e) => patch("gemini_api_key", e.target.value)}
              placeholder="AIza…"
              disabled={isLoading}
              autoComplete="off"
            />
          </div>
        )}

        {/* Groq fields */}
        {provider === "crok" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-500">
              <span>🔗</span>
              <span>Connecté à <strong className="text-slate-700">api.groq.com</strong></span>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Groq API Key</label>
              <input
                type="password"
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 p-2.5 outline-none"
                value={form.crok_api_key}
                onChange={(e) => patch("crok_api_key", e.target.value)}
                placeholder="gsk_…"
                disabled={isLoading}
                autoComplete="off"
              />
            </div>
          </div>
        )}

        {/* Status banner */}
        {status && (
          <div
            role="status"
            className={cn(
              "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm",
              status.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            )}
          >
            {status.ok
              ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
              : <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600" />}
            <span>{status.message}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void handleTest()}
            className="flex-1 inline-flex items-center justify-center gap-2 border border-slate-200 bg-white px-3 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            {isLoading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <TestTube2 className="w-4 h-4" />}
            {isLoading ? "Test en cours…" : "Tester"}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void handleSave()}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-violet-600 text-white px-3 py-2 rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            <ShieldCheck className="w-4 h-4" />
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
