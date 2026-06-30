/**
 * Utilitaires KPI — formatage et calcul delta.
 * Le stockage/CRUD est géré via le backend (/api/user/kpis).
 */
import { KpiItem } from "../types";

/** Formate un nombre brut pour l'affichage (séparateurs milliers, décimales) */
export function formatKpiValue(raw: unknown): { formatted: string; numeric: number | null } {
  if (raw === null || raw === undefined || raw === "") {
    return { formatted: "—", numeric: null };
  }
  const n = Number(raw);
  if (isNaN(n)) {
    return { formatted: String(raw), numeric: null };
  }
  const formatted = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(n);
  return { formatted, numeric: n };
}

/** Calcule le delta % entre deux valeurs */
export function computeDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
