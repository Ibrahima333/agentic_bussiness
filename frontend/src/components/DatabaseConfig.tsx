import React, { useEffect, useMemo, useState } from "react";
import { Database, KeyRound, PlugZap } from "lucide-react";

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
  const [isLoading, setIsLoading] = useState(false);
  const [supportedTypes, setSupportedTypes] = useState<string[]>(["postgresql", "mysql"]);

  const [form, setForm] = useState<DbConfigPayload>({
    db_type: "postgresql",
    host: "localhost",
    port: 5432,
    user: "postgres",
    password: "",
    database: "",
    schema: "public",
  });

  const [status, setStatus] = useState<{ kind: "success" | "error" | "info"; message: string } | null>(null);
  const [lastTest, setLastTest] = useState<{ success?: boolean; message?: string } | null>(null);

  const passwordIsEmpty = useMemo(() => !form.password || form.password.length === 0, [form.password]);

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
            db_type: (cfg.db_type as DbType) ?? "postgresql",
            host: cfg.host ?? "localhost",
            port: cfg.port ?? (cfg.db_type === "mysql" ? 3306 : 5432),
            user: cfg.user ?? "",
            password: "",
            database: cfg.database ?? "",
            schema: cfg.schema ?? "public",
            extra: cfg.extra ?? {},
          });
        }
        setLastTest(resp.lastTest ?? null);
        if (resp.supportedTypes && resp.supportedTypes.length) {
          setSupportedTypes(resp.supportedTypes);
        }
      } catch (e) {
        if (cancelled) return;
        setStatus({ kind: "error", message: e instanceof Error ? e.message : "Unable to load DB config" });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api]);

  const update = (patch: Partial<DbConfigPayload>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const normalizePort = (v: string) => {
    const parsed = Number(v);
    if (Number.isNaN(parsed)) return v;
    return parsed;
  };

  const handleTestAndConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStatus(null);

    const payload: DbConfigPayload = {
      ...form,
      port: form.port,
      password: form.password ?? "",
    };

    try {
      // Étape 1 : tester la connexion
      const testResult = await api.testDbConfig(payload);
      const ok = Boolean(testResult?.success);

      if (!ok) {
        setLastTest({ success: false, message: testResult?.message ?? "Test failed" });
        setStatus({ kind: "error", message: testResult?.message ?? "Connexion échouée" });
        return;
      }

      // Étape 2 : sauvegarder et connecter
      const connectResult = await api.connectDbConfig(payload);
      const connected = Boolean(connectResult?.connection?.success ?? connectResult?.success ?? true);

      setLastTest({ success: connected, message: connectResult?.message ?? (connected ? "Connecté ✓" : "Connexion échouée") });
      setStatus({
        kind: connected ? "success" : "error",
        message: connectResult?.connection?.message ?? connectResult?.message ?? (connected ? "Connecté avec succès ✓" : "Connexion échouée"),
      });

      if (connected) {
        onAfterConnect();
      }
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Erreur de connexion" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
            <Database className="w-4 h-4 text-blue-700" />
          </div>
          <div>
            <div className="font-semibold text-slate-900">Database Connection</div>
            <div className="text-xs text-slate-500">Runtime config for MySQL/PostgreSQL</div>
          </div>
        </div>
        <div className="text-xs text-slate-500">
          {lastTest?.message ? (
            <span className={lastTest?.success ? "text-emerald-700" : "text-rose-700"}>{lastTest?.message}</span>
          ) : null}
        </div>
      </div>

      <div className="p-4">
        <form onSubmit={handleTestAndConnect} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-2">
                <PlugZap className="w-3.5 h-3.5 text-slate-400" /> Type
              </label>
              <select
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 p-2.5 outline-none"
                value={String(form.db_type)}
                onChange={(e) => {
                  const next = e.target.value;
                  update({
                    db_type: next,
                    port: next === "mysql" ? 3306 : 5432,
                    schema: form.schema || "public",
                  });
                }}
                disabled={isLoading}
              >
                {supportedTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-2">
                <KeyRound className="w-3.5 h-3.5 text-slate-400" /> Schema
              </label>
              <input
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 p-2.5 outline-none"
                value={form.schema}
                onChange={(e) => update({ schema: e.target.value })}
                placeholder="public"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Host</label>
              <input
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 p-2.5 outline-none"
                value={form.host}
                onChange={(e) => update({ host: e.target.value })}
                placeholder="localhost"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Port</label>
              <input
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 p-2.5 outline-none"
                value={String(form.port)}
                onChange={(e) => update({ port: normalizePort(e.target.value) })}
                placeholder={form.db_type === "mysql" ? "3306" : "5432"}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">User</label>
              <input
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 p-2.5 outline-none"
                value={form.user}
                onChange={(e) => update({ user: e.target.value })}
                placeholder={form.db_type === "mysql" ? "root" : "postgres"}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Database</label>
              <input
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 p-2.5 outline-none"
                value={form.database}
                onChange={(e) => update({ database: e.target.value })}
                placeholder="your_database"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-600">Password</label>
              <input
                type="password"
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 p-2.5 outline-none"
                value={form.password}
                onChange={(e) => update({ password: e.target.value })}
                placeholder="••••••••"
                disabled={isLoading}
              />
              <div className="text-[11px] text-slate-500 mt-1">Le mot de passe n’est jamais pré-rempli.</div>
            </div>
          </div>

          {status ? (
            <div
              className={
                status.kind === "success"
                  ? "rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 px-4 py-3 text-sm shadow-sm"
                  : status.kind === "error"
                    ? "rounded-xl border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 text-sm shadow-sm"
                    : "rounded-xl border border-blue-200 bg-blue-50 text-blue-800 px-4 py-3 text-sm shadow-sm"
              }
              role="status"
            >
              {status.message}
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isLoading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Connexion…</>
                : <><PlugZap className="w-4 h-4" /> Tester &amp; Connecter</>}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

