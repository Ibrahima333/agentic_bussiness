import React, { useEffect, useMemo, useState } from "react";
import { Database, PlugZap, ChevronDown, ChevronUp, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "../lib/utils";

type DbType = "postgresql" | "mysql";

export type DbConfigPayload = {
  db_type: DbType | string;
  host: string;
  port: number | string;
  user: string;
  password: string;
  database: string;
  schema: string;
  extra?: Record<string, unknown>;
};

type Api = {
  fetchDbConfig: () => Promise<{
    config: Omit<DbConfigPayload, "extra"> & { extra?: Record<string, unknown> };
    lastTest?: { success?: boolean; message?: string } | null;
    supportedTypes?: string[];
  }>;
  testDbConfig: (payload: DbConfigPayload) => Promise<{ success: boolean; message: string }>;
  saveDbConfig: (payload: DbConfigPayload) => Promise<any>;
  connectDbConfig: (payload: DbConfigPayload) => Promise<any>;
};

type Props = {
  api: Api;
  onAfterConnect: () => void;
};

export default function DatabaseConfig({ api, onAfterConnect }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [supportedTypes, setSupportedTypes] = useState<string[]>(["postgresql", "mysql"]);
  const [connected, setConnected] = useState<boolean | null>(null);

  const [form, setForm] = useState<DbConfigPayload>({
    db_type: "mysql",
    host: "host.docker.internal",
    port: 3306,
    user: "root",
    password: "",
    database: "",
    schema: "public",
  });

  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const resp = await api.fetchDbConfig();
        if (cancelled) return;
        const cfg = resp.config;
        if (cfg) {
          setForm({
            db_type: cfg.db_type ?? "mysql",
            host: cfg.host ?? "localhost",
            port: cfg.port ?? 3306,
            user: cfg.user ?? "",
            password: "",
            database: cfg.database ?? "",
            schema: cfg.schema ?? "public",
            extra: cfg.extra ?? {},
          });
        }
        if (resp.supportedTypes?.length) setSupportedTypes(resp.supportedTypes);
        if (resp.lastTest) {
          const ok = Boolean(resp.lastTest.success);
          setConnected(ok);
          setStatus({ ok, message: resp.lastTest.message ?? "" });
          if (ok) setIsOpen(false); // replié si déjà connecté
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [api]);

  const update = (patch: Partial<DbConfigPayload>) => setForm(prev => ({ ...prev, ...patch }));

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStatus(null);
    const payload = { ...form, password: form.password ?? "" };
    try {
      const test = await api.testDbConfig(payload);
      if (!test.success) {
        setConnected(false);
        setStatus({ ok: false, message: test.message ?? "Connexion échouée" });
        return;
      }
      const connectResult = await api.connectDbConfig(payload);
      // Vérifier explicitement le succès dans le corps de la réponse
      // (l'endpoint retourne toujours HTTP 200, même en cas d'échec de sauvegarde)
      const saveOk = connectResult?.connection?.success !== false;
      if (!saveOk) {
        const saveMsg = connectResult?.connection?.message ?? "Erreur lors de la sauvegarde de la configuration";
        setConnected(false);
        setStatus({ ok: false, message: saveMsg });
        return;
      }
      setConnected(true);
      setStatus({ ok: true, message: `Connecté à ${form.database} ✓` });
      setIsOpen(false);
      onAfterConnect();
    } catch (err) {
      setConnected(false);
      setStatus({ ok: false, message: err instanceof Error ? err.message : "Erreur de connexion" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 border-zinc-700 overflow-hidden">
      {/* Header cliquable */}
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className="w-full p-4 flex items-center gap-3 hover:bg-zinc-700/50 transition-colors text-left"
      >
        <div className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border",
          connected === true ? "bg-emerald-50 border-emerald-100" :
          connected === false ? "bg-rose-50 border-rose-100" :
          "bg-zinc-700 border-zinc-600"
        )}>
          <Database className={cn("w-4 h-4",
            connected === true ? "text-emerald-700" :
            connected === false ? "text-rose-700" :
            "text-indigo-400"
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-zinc-100 text-sm">Base de données</div>
          <div className="text-xs text-zinc-400 truncate">
            {connected === true
              ? `${form.db_type} · ${form.host} · ${form.database}`
              : connected === false
              ? "Connexion échouée"
              : "Non configurée"}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {connected === true && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          {connected === false && <XCircle className="w-4 h-4 text-rose-500" />}
          {isOpen ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </div>
      </button>

      {/* Formulaire repliable */}
      {isOpen && (
        <div className="border-t border-zinc-700/60 p-4">
          <form onSubmit={handleConnect} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400">Type</label>
                <select
                  className="w-full bg-zinc-900/60 border border-zinc-700 text-zinc-100 text-sm rounded-xl p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  value={String(form.db_type)}
                  onChange={e => update({ db_type: e.target.value, port: e.target.value === "mysql" ? 3306 : 5432 })}
                  disabled={isLoading}
                >
                  {supportedTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400">Port</label>
                <input
                  className="w-full bg-zinc-900/60 border border-zinc-700 text-zinc-100 text-sm rounded-xl p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  value={String(form.port)}
                  onChange={e => update({ port: Number(e.target.value) || e.target.value })}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400">Host</label>
                <input
                  className="w-full bg-zinc-900/60 border border-zinc-700 text-zinc-100 text-sm rounded-xl p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.host}
                  onChange={e => update({ host: e.target.value })}
                  placeholder="host.docker.internal"
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400">Base</label>
                <input
                  className="w-full bg-zinc-900/60 border border-zinc-700 text-zinc-100 text-sm rounded-xl p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.database}
                  onChange={e => update({ database: e.target.value })}
                  placeholder="ma_base"
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400">Utilisateur</label>
                <input
                  className="w-full bg-zinc-900/60 border border-zinc-700 text-zinc-100 text-sm rounded-xl p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.user}
                  onChange={e => update({ user: e.target.value })}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400">Mot de passe</label>
                <input
                  type="password"
                  className="w-full bg-zinc-900/60 border border-zinc-700 text-zinc-100 text-sm rounded-xl p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.password}
                  onChange={e => update({ password: e.target.value })}
                  placeholder="••••••••"
                  disabled={isLoading}
                />
              </div>
            </div>

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
              type="submit"
              disabled={isLoading || !form.database}
              className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-md text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isLoading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Connexion…</>
                : <><PlugZap className="w-4 h-4" />Connecter</>}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
