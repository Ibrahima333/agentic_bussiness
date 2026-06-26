import React, { useState } from "react";
import { TrendingUp, TrendingDown, Minus, RefreshCw, X, Database } from "lucide-react";
import { cn } from "../lib/utils";
import { KpiItem } from "../types";
import { formatKpiValue, computeDelta } from "../lib/kpi";
import { refreshKpi, unpinUserKpi, pinUserKpi } from "../lib/api";

interface Props {
  item: KpiItem;
  onUpdate: (items: KpiItem[]) => void;
}

export function KpiCard({ item, onUpdate }: Props) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const delta = computeDelta(item.rawValue, item.previousValue);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const data = await refreshKpi(item.questionName);
      if (!data.values || Object.keys(data.values).length === 0) {
        setError("Aucun résultat retourné");
        return;
      }
      const raw = data.values[item.columnName] ?? Object.values(data.values)[0];
      const { formatted, numeric } = formatKpiValue(raw);
      const updated = await pinUserKpi({
        ...item,
        previousValue: item.rawValue,
        rawValue: numeric,
        value: formatted,
        lastUpdated: Date.now(),
      });
      onUpdate(updated.kpis as KpiItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du refresh");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRemove = async () => {
    const data = await unpinUserKpi(item.id);
    onUpdate(data.kpis as KpiItem[]);
  };

  const lastUpdatedLabel = new Date(item.lastUpdated).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-col gap-3 hover:shadow-md transition-shadow relative group">

      {/* Actions — visibles au survol */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => void handleRefresh()}
          disabled={isRefreshing}
          className="p-1.5 rounded text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
          title="Rafraîchir"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
        </button>
        <button
          onClick={handleRemove}
          className="p-1.5 rounded text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
          title="Supprimer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Question */}
      <p className="text-xs text-zinc-500 leading-relaxed pr-14 line-clamp-2" title={item.questionText}>
        {item.questionText}
      </p>

      {/* Valeur principale */}
      <div className="flex items-end gap-3">
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-0.5">
            {item.columnName}
          </p>
          <p className="text-3xl font-bold text-zinc-900 leading-none">
            {item.value}
          </p>
        </div>

        {/* Delta */}
        {delta !== null && (
          <div className={cn(
            "flex items-center gap-1 text-sm font-semibold px-2 py-1 rounded-lg mb-0.5",
            delta > 0
              ? "text-emerald-700 bg-emerald-50"
              : delta < 0
              ? "text-rose-700 bg-rose-50"
              : "text-zinc-500 bg-zinc-100"
          )}>
            {delta > 0
              ? <TrendingUp className="w-3.5 h-3.5" />
              : delta < 0
              ? <TrendingDown className="w-3.5 h-3.5" />
              : <Minus className="w-3.5 h-3.5" />}
            {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
          </div>
        )}
      </div>

      {/* Erreur */}
      {error && (
        <p className="text-[11px] text-rose-600 bg-rose-50 rounded px-2 py-1">{error}</p>
      )}

      {/* Pied : base + horodatage */}
      <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
        <div className="flex items-center gap-1 text-[10px] text-zinc-400">
          <Database className="w-3 h-3" />
          {item.database}
        </div>
        <p className="text-[10px] text-zinc-400">{lastUpdatedLabel}</p>
      </div>
    </div>
  );
}
