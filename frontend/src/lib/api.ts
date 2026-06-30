import type { PipelineResult, PipelineResultSummary } from "../types";
import { clearAuth, getToken } from "./auth";

function buildUrl(path: string): string {
  const base = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;
  return base ? `${base}${path}` : path;
}

// Messages d'erreur HTTP en francais
const HTTP_ERRORS: Record<number, string> = {
  400: "Requete invalide",
  401: "Session expirée — veuillez vous reconnecter",
  403: "Acces refuse",
  404: "Ressource introuvable",
  422: "Donnees invalides envoyees au serveur",
  429: "Trop de requetes - reessayez dans quelques secondes",
  500: "Erreur interne du serveur",
  502: "Le backend est inaccessible (502)",
  503: "Service temporairement indisponible",
  504: "Delai d'attente depasse (504)",
};

/** Requête authentifiée — ajoute automatiquement le JWT. */
export async function apiFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  let response: Response;

  try {
    response = await fetch(buildUrl(path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error("Impossible de joindre le serveur. Verifiez que le backend est demarre.");
  }

  // Token expiré → déconnexion automatique via événement (sans reload)
  if (response.status === 401) {
    clearAuth();
    window.dispatchEvent(new Event("auth:logout"));
    throw new Error("Session expirée");
  }

  if (!response.ok) {
    const bodyText = await response.text();
    let message = HTTP_ERRORS[response.status] ?? `Erreur ${response.status}`;
    if (bodyText?.trim()) {
      try {
        const payload = JSON.parse(bodyText);
        const detail = payload?.detail ?? payload?.message;
        if (detail) message = String(detail);
      } catch {
        if (bodyText.length < 200) message = bodyText;
      }
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** Alias pour la compatibilité interne (routes sans auth — login) */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, init);
}

export function buildArtifactUrl(path: string): string {
  return buildUrl(path);
}

export async function fetchConfig(databaseName?: string): Promise<{
  databases: string[];
  schemas: string[];
  providers: string[];
  selectedDatabase: string;
  selectedSchema: string;
  selectedProvider: string;
}> {
  const query = databaseName
    ? `?databaseName=${encodeURIComponent(databaseName)}`
    : "";
  return request(`/api/config${query}`);
}

export async function fetchDbConfig(): Promise<{
  config: {
    db_type: string;
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    schema: string;
    extra?: Record<string, unknown>;
  };
  lastTest?: { success?: boolean; message?: string } | null;
  supportedTypes?: string[];
}> {
  return request("/api/db-config");
}

export async function testDbConfig(payload: {
  db_type: string;
  host: string;
  port: number | string;
  user: string;
  password: string;
  database: string;
  schema: string;
  extra?: Record<string, unknown>;
}): Promise<{ success: boolean; message: string }> {
  return request("/api/db-config/test", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function saveDbConfig(payload: {
  db_type: string;
  host: string;
  port: number | string;
  user: string;
  password: string;
  database: string;
  schema: string;
  extra?: Record<string, unknown>;
}): Promise<{ config: any; lastTest?: any } > {
  return request("/api/db-config/save", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function connectDbConfig(payload: {
  db_type: string;
  host: string;
  port: number | string;
  user: string;
  password: string;
  database: string;
  schema: string;
  extra?: Record<string, unknown>;
}): Promise<{ config: any; lastTest?: any; connection?: any }> {
  return request("/api/db-config/connect", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function refreshKpi(questionName: string): Promise<{
  columns: string[];
  values: Record<string, unknown>;
  rowCount: number;
}> {
  return request(`/api/kpi/refresh/${encodeURIComponent(questionName)}`, {
    method: "POST",
  });
}

export async function fetchHistory(): Promise<PipelineResultSummary[]> {
  const payload = await request<{ history: PipelineResultSummary[] }>(
    "/api/results"
  );
  return payload.history;
}

export async function fetchResult(questionName: string): Promise<PipelineResult> {
  return request(`/api/results/${encodeURIComponent(questionName)}`);
}

export async function clearHistory(): Promise<void> {
  await request("/api/history", { method: "DELETE" });
}

export async function runPipeline(payload: {
  questionText: string;
  artifactName: string;
  databaseName: string;
  schemaName: string;
  providerName: string;
  overwriteExisting: boolean;
}): Promise<PipelineResult> {
  return request("/api/pipeline/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── KPIs (MySQL par user) ─────────────────────────────────────────────────────

export async function fetchUserKpis(): Promise<{ kpis: any[] }> {
  return request("/api/user/kpis");
}

export async function pinUserKpi(kpi: any): Promise<{ kpis: any[] }> {
  return request("/api/user/kpis", { method: "POST", body: JSON.stringify(kpi) });
}

export async function unpinUserKpi(kpiId: string): Promise<{ kpis: any[] }> {
  return request(`/api/user/kpis/${encodeURIComponent(kpiId)}`, { method: "DELETE" });
}

// ── Dashboard (MySQL par user) ────────────────────────────────────────────────

export async function fetchUserDashboard(): Promise<{ dashboard: any[] }> {
  return request("/api/user/dashboard");
}

export async function pinUserChart(item: any): Promise<{ dashboard: any[] }> {
  return request("/api/user/dashboard", { method: "POST", body: JSON.stringify(item) });
}

export async function unpinUserChart(chartId: string): Promise<{ dashboard: any[] }> {
  return request(`/api/user/dashboard/${encodeURIComponent(chartId)}`, { method: "DELETE" });
}

export async function fetchLlmConfig(): Promise<{
  config?: { gemini_api_key?: string; groq_api_key?: string; groq_api_url?: string };
  lastTest?: { success?: boolean; message?: string } | null;
  availableProviders?: string[];
  isAdmin?: boolean;
}> {
  return request("/api/llm-config");
}

export async function testLlmConfig(payload: {
  gemini_api_key?: string;
  groq_api_key?: string;
  groq_api_url?: string;
}): Promise<{ success: boolean; message: string; lastTest?: any }> {
  return request("/api/llm-config/test", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function saveLlmConfig(payload: {
  gemini_api_key?: string;
  groq_api_key?: string;
  groq_api_url?: string;
}): Promise<{ success?: boolean; message?: string; config?: any; lastTest?: any }> {
  return request("/api/llm-config/save", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}



