import React, { useEffect, useState } from "react";
import { PipelineResult } from "../types";
import { Code2, Table, BarChart3, FileText, Download, FileDown, Loader2,
         Pin, PinOff, ClipboardList, TrendingUp, CheckCircle2 } from "lucide-react";
import { cn } from "../lib/utils";
import Markdown from "react-markdown";
import { buildArtifactUrl, pinUserChart, unpinUserChart, pinUserKpi, unpinUserKpi } from "../lib/api";
import { exportReportToPdf } from "../lib/exportPdf";
import { getChatExportCount, clearChatExport } from "../lib/chatExport";
import { formatKpiValue } from "../lib/kpi";

interface ResultTabsProps {
  result: PipelineResult;
}

type TabType = "results" | "sql" | "chart" | "kpis" | "report";

/** Calcule les métriques (total, moy, min, max) pour chaque colonne numérique */
function computeKpiMetrics(rows: Record<string, unknown>[]) {
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  const metrics: {
    column: string;
    total: number | null;
    avg: number | null;
    min: number | null;
    max: number | null;
  }[] = [];

  for (const col of cols) {
    const nums = rows
      .map(r => Number(r[col]))
      .filter(n => !isNaN(n) && isFinite(n));

    if (nums.length === 0) continue;

    const total = nums.reduce((a, b) => a + b, 0);
    metrics.push({
      column: col,
      total,
      avg:  total / nums.length,
      min:  Math.min(...nums),
      max:  Math.max(...nums),
    });
  }
  return metrics;
}

export function ResultTabs({ result }: ResultTabsProps) {
  const [activeTab, setActiveTab]       = useState<TabType>("results");
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pinned, setPinned]             = useState(false);
  const [isPinning, setIsPinning]       = useState(false);
  const [pinError, setPinError]         = useState<string | null>(null);
  const [chatExportCount, setChatExportCount] = useState(() => getChatExportCount());
  // kpiPinned : map de "colonne__metric" → boolean
  const [pinnedKpis, setPinnedKpis]     = useState<Record<string, boolean>>({});

  const kpiMetrics = computeKpiMetrics(result.csvData);

  useEffect(() => {
    setPinned(false);
    setPinnedKpis({});
  }, [result.id]);

  const handlePinChart = async () => {
    setIsPinning(true);
    setPinError(null);
    try {
      if (pinned) {
        await unpinUserChart(result.id);
        setPinned(false);
      } else {
        const chartUrl = result.artifactUrls?.chart ?? "";
        await pinUserChart({
          id:           result.id.slice(0, 200),
          questionName: result.questionName,
          questionText: result.questionText,
          chartUrl,
          pinnedAt:     Date.now(),
        });
        setPinned(true);
      }
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "Erreur lors de l'épinglage");
    } finally {
      setIsPinning(false);
    }
  };

  const handlePinKpi = async (
    column: string,
    metric: "total" | "avg" | "min" | "max",
    value: number
  ) => {
    const key = `${column}__${metric}`;
    const { formatted } = formatKpiValue(value);
    const metricLabels = { total: "Total", avg: "Moyenne", min: "Minimum", max: "Maximum" };
    const kpiId = `${result.id}__${column}__${metric}`;

    if (pinnedKpis[key]) {
      await unpinUserKpi(kpiId);
      setPinnedKpis(p => ({ ...p, [key]: false }));
    } else {
      await pinUserKpi({
        id: kpiId,
        questionText: `${metricLabels[metric]} de ${column} — ${result.questionText}`,
        questionName: result.questionName,
        columnName:   `${metricLabels[metric]} · ${column}`,
        value:        formatted,
        rawValue:     value,
        database:     result.databaseName,
        schema:       result.schemaName,
        provider:     result.providerName,
        pinnedAt:     Date.now(),
        lastUpdated:  Date.now(),
      });
      setPinnedKpis(p => ({ ...p, [key]: true }));
    }
  };

  const handleDownload = (artifactPath: string) => {
    window.open(buildArtifactUrl(artifactPath), "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    const onFocus = () => setChatExportCount(getChatExportCount());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      await exportReportToPdf(result);
      clearChatExport();
      setChatExportCount(0);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "results", label: "Results",  icon: <Table    className="w-4 h-4" /> },
    { id: "sql",     label: "SQL",      icon: <Code2    className="w-4 h-4" /> },
    { id: "chart",   label: "Chart",    icon: <BarChart3 className="w-4 h-4" /> },
    { id: "kpis",    label: "KPIs",     icon: <TrendingUp className="w-4 h-4" /> },
    { id: "report",  label: "Report",   icon: <FileText  className="w-4 h-4" /> },
  ];

  return (
    <div className="mt-4 bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Tab Header */}
      <div className="flex items-center gap-1 p-2 bg-stone-50 border-b border-stone-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
              activeTab === tab.id
                ? "bg-white text-orange-700 shadow-sm border border-stone-200/60"
                : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 border border-transparent"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-6">

        {/* ── Results ───────────────────────────────────────── */}
        {activeTab === "results" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => handleDownload(result.artifactUrls.csv)}
                className="flex items-center gap-2 text-sm font-medium text-stone-600 bg-white border border-stone-200 px-3 py-1.5 rounded-xl hover:bg-stone-50 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" /> Download CSV
              </button>
            </div>
            {result.csvData.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center text-sm text-stone-500">
                Aucune ligne retournée.
              </div>
            ) : (
              <div className="border border-stone-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-stone-600">
                    <thead className="text-xs text-stone-700 uppercase bg-stone-50 border-b border-stone-200">
                      <tr>
                        {Object.keys(result.csvData[0] || {}).map(key => (
                          <th key={key} className="px-6 py-3 font-semibold">{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.csvData.map((row, i) => (
                        <tr key={i} className="bg-white border-b border-stone-100 last:border-0 hover:bg-stone-50 transition-colors">
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="px-6 py-4 whitespace-nowrap">
                              {val === null || val === undefined ? "—" : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SQL ───────────────────────────────────────────── */}
        {activeTab === "sql" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => handleDownload(result.artifactUrls.sql)}
                className="flex items-center gap-2 text-sm font-medium text-stone-600 bg-white border border-stone-200 px-3 py-1.5 rounded-xl hover:bg-stone-50 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" /> Download SQL
              </button>
            </div>
            <div className="bg-stone-950 rounded-xl p-4 overflow-x-auto">
              <pre className="text-sm text-stone-50 font-mono leading-relaxed">
                <code>{result.sql}</code>
              </pre>
            </div>
          </div>
        )}

        {/* ── Chart ─────────────────────────────────────────── */}
        {activeTab === "chart" && (
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => void handlePinChart()}
                disabled={isPinning}
                className={cn(
                  "flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-60",
                  pinned
                    ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
                    : "bg-white text-zinc-600 border-zinc-200 hover:border-indigo-400 hover:text-indigo-600"
                )}
              >
                {isPinning
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                {isPinning ? "Épinglage…" : pinned ? "Épinglé ✓" : "Épingler au tableau de bord"}
              </button>
              <button
                type="button"
                onClick={() => handleDownload(result.artifactUrls.chart)}
                className="flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
              >
                <Download className="w-4 h-4" /> HTML
              </button>
            </div>
            {pinError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">{pinError}</p>
            )}
            </div>
            <div className="bg-white border border-stone-200 rounded-xl p-6 h-[500px] flex items-center justify-center shadow-sm">
              {result.chartHtml ? (
                <iframe
                  title={`${result.questionName}-chart`}
                  srcDoc={result.chartHtml}
                  sandbox="allow-scripts"
                  className="h-full w-full rounded-xl border border-stone-200"
                />
              ) : (
                <div className="text-sm text-stone-500">Aucun graphique généré.</div>
              )}
            </div>
          </div>
        )}

        {/* ── KPIs ──────────────────────────────────────────── */}
        {activeTab === "kpis" && (
          <div className="space-y-6">
            {kpiMetrics.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-6 py-12 text-center">
                <TrendingUp className="w-8 h-8 text-stone-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-stone-500">Aucune colonne numérique détectée</p>
                <p className="text-xs text-stone-400 mt-1">Les KPIs sont calculés automatiquement sur les colonnes numériques du résultat.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-stone-500">
                  {kpiMetrics.length} colonne{kpiMetrics.length > 1 ? "s" : ""} numérique{kpiMetrics.length > 1 ? "s" : ""} détectée{kpiMetrics.length > 1 ? "s" : ""} ·
                  {" "}{result.csvData.length} ligne{result.csvData.length > 1 ? "s" : ""}. Cliquez <Pin className="w-3 h-3 inline" /> pour épingler dans le dashboard.
                </p>

                {kpiMetrics.map(m => (
                  <div key={m.column} className="border border-stone-200 rounded-xl overflow-hidden">
                    {/* En-tête colonne */}
                    <div className="bg-stone-50 border-b border-stone-200 px-4 py-2.5 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-bold text-stone-800">{m.column}</span>
                    </div>

                    {/* Grille métriques */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-stone-100">
                      {(
                        [
                          { key: "total", label: "Total",   value: m.total },
                          { key: "avg",   label: "Moyenne", value: m.avg   },
                          { key: "min",   label: "Minimum", value: m.min   },
                          { key: "max",   label: "Maximum", value: m.max   },
                        ] as { key: "total"|"avg"|"min"|"max"; label: string; value: number | null }[]
                      ).map(({ key, label, value }) => {
                        if (value === null) return null;
                        const { formatted } = formatKpiValue(value);
                        const pinKey = `${m.column}__${key}`;
                        const isPinned = pinnedKpis[pinKey];

                        return (
                          <div key={key} className="p-4 flex flex-col gap-2 group relative">
                            <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">{label}</span>
                            <span className="text-2xl font-bold text-stone-900">{formatted}</span>
                            <button
                              type="button"
                              onClick={() => void handlePinKpi(m.column, key, value)}
                              className={cn(
                                "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border transition-colors w-fit",
                                isPinned
                                  ? "bg-amber-500 text-white border-amber-500"
                                  : "bg-white text-stone-400 border-stone-200 hover:text-amber-600 hover:border-amber-300"
                              )}
                            >
                              {isPinned
                                ? <><CheckCircle2 className="w-3 h-3" /> Épinglé</>
                                : <><Pin className="w-3 h-3" /> Épingler</>}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ── Report ────────────────────────────────────────── */}
        {activeTab === "report" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-700">Insights &amp; Actions</h3>
              <div className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={() => void handleExportPdf()}
                  disabled={isExportingPdf}
                  className="relative flex items-center gap-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 px-4 py-2 rounded-xl transition-colors shadow-sm"
                >
                  {isExportingPdf
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Capture…</>
                    : <><FileDown className="w-4 h-4" />Télécharger PDF</>}
                  {chatExportCount > 0 && !isExportingPdf && (
                    <span className="absolute -top-2 -right-2 w-5 h-5 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {chatExportCount}
                    </span>
                  )}
                </button>
                {chatExportCount > 0 && !isExportingPdf && (
                  <p className="text-[11px] text-indigo-600 flex items-center gap-1">
                    <ClipboardList className="w-3 h-3" />
                    {chatExportCount} extrait{chatExportCount > 1 ? "s" : ""} Chat IA inclus
                  </p>
                )}
              </div>
            </div>
            <div className="prose prose-slate max-w-none bg-white border border-stone-200 rounded-xl p-8 shadow-sm">
              <Markdown>{result.report}</Markdown>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
