import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pin, X, Maximize2, Minimize2, BarChart2, GripVertical, TrendingUp } from "lucide-react";
import { DashboardItem, KpiItem } from "../types";
import { getDashboard, saveDashboard, unpinChart } from "../lib/dashboard";
import { getKpis } from "../lib/kpi";
import { buildArtifactUrl } from "../lib/api";
import { KpiCard } from "./KpiCard";
import { cn } from "../lib/utils";

export function Dashboard() {
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [kpis, setKpis] = useState<KpiItem[]>([]);
  const dragId = useRef<string | null>(null);
  const dragOver = useRef<string | null>(null);

  useEffect(() => {
    setItems(getDashboard());
    setKpis(getKpis());
  }, []);

  /* ── Drag & Drop reorder ─────────────────────────────── */
  const onDragStart = (id: string) => { dragId.current = id; };
  const onDragEnter = (id: string) => { dragOver.current = id; };
  const onDragEnd   = () => {
    if (!dragId.current || !dragOver.current || dragId.current === dragOver.current) return;
    const arr = [...items];
    const from = arr.findIndex(i => i.id === dragId.current);
    const to   = arr.findIndex(i => i.id === dragOver.current);
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    saveDashboard(arr);
    setItems(arr);
    dragId.current = null;
    dragOver.current = null;
  };

  /* ── Actions ─────────────────────────────────────────── */
  const handleRemove = useCallback((id: string) => {
    setItems(unpinChart(id));
  }, []);

  const handleToggleSize = useCallback((id: string) => {
    const next = getDashboard().map(item =>
      item.id === id ? { ...item, w: item.w === 6 ? 12 : 6 } : item
    );
    saveDashboard(next);
    setItems(next);
  }, []);

  /* ── Empty state ─────────────────────────────────────── */
  if (items.length === 0 && kpis.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
        <div className="w-16 h-16 rounded-2xl border-2 border-zinc-200 flex items-center justify-center mx-auto mb-6">
          <BarChart2 className="w-7 h-7 text-zinc-300" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 mb-2">Tableau de bord vide</h2>
        <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
          Épinglez des graphiques ou des KPIs depuis vos analyses.
        </p>
        <div className="mt-5 flex flex-col gap-2 items-center">
          <div className="flex items-center gap-2 text-xs text-zinc-400 border border-zinc-200 rounded-lg px-4 py-2">
            <Pin className="w-3.5 h-3.5" />
            Bouton "Épingler" dans l'onglet Chart
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400 border border-zinc-200 rounded-lg px-4 py-2">
            <TrendingUp className="w-3.5 h-3.5" />
            Bouton "Épingler comme KPI" dans l'onglet Results (1 valeur)
          </div>
        </div>
      </div>
    );
  }

  /* ── Dashboard grid ──────────────────────────────────── */
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">Tableau de bord</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {kpis.length > 0 && `${kpis.length} KPI${kpis.length > 1 ? "s" : ""} · `}
            {items.length} graphique{items.length > 1 ? "s" : ""} · Glissez pour réorganiser
          </p>
        </div>
      </div>

      {/* ── Section KPIs ───────────────────────────────────── */}
      {kpis.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-zinc-700">KPIs</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {kpis.map(kpi => (
              <KpiCard key={kpi.id} item={kpi} onUpdate={setKpis} />
            ))}
          </div>
        </div>
      )}

      {/* ── Graphiques ─────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-zinc-700">Graphiques</h3>
        </div>
      )}

      {/* Grille 12 colonnes */}
      <div className="grid grid-cols-12 gap-3 auto-rows-auto">
        {items.map(item => (
          <div
            key={item.id}
            draggable
            onDragStart={() => onDragStart(item.id)}
            onDragEnter={() => onDragEnter(item.id)}
            onDragEnd={onDragEnd}
            onDragOver={e => e.preventDefault()}
            className={cn(
              "bg-white border border-zinc-200 rounded-xl overflow-hidden flex flex-col transition-shadow hover:shadow-md",
              item.w === 12 ? "col-span-12" : "col-span-12 md:col-span-6"
            )}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-100 bg-zinc-50 shrink-0">
              <span className="cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-500">
                <GripVertical className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-zinc-800 truncate">{item.questionText}</p>
                <p className="text-[10px] text-zinc-400 font-mono">{item.database}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => handleToggleSize(item.id)}
                  className="p-1.5 rounded text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                  title={item.w === 6 ? "Pleine largeur" : "Demi largeur"}
                >
                  {item.w === 6
                    ? <Maximize2 className="w-3.5 h-3.5" />
                    : <Minimize2 className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => handleRemove(item.id)}
                  className="p-1.5 rounded text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                  title="Retirer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Graphique Plotly — chargé via URL pour ne pas saturer localStorage */}
            <div className="h-80">
              {item.chartUrl ? (
                <iframe
                  title={`dash-${item.id}`}
                  src={buildArtifactUrl(item.chartUrl)}
                  sandbox="allow-scripts allow-same-origin"
                  className="w-full h-full border-0"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400">
                  Aucun graphique
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
