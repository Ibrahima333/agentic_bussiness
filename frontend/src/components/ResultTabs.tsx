import React, { useEffect, useState } from "react";
import { PipelineResult } from "../types";
import { Code2, Table, Database, BarChart3, FileText, Terminal, Download, FileDown, Loader2, Pin, PinOff, ClipboardList } from "lucide-react";
import { cn } from "../lib/utils";
import Markdown from "react-markdown";
import { buildArtifactUrl, pinUserChart, unpinUserChart, pinUserKpi, unpinUserKpi } from "../lib/api";
import { exportReportToPdf } from "../lib/exportPdf";
import { getChatExportCount, clearChatExport } from "../lib/chatExport";
import { formatKpiValue } from "../lib/kpi";
import { TrendingUp } from "lucide-react";

interface ResultTabsProps {
  result: PipelineResult;
}

type TabType = "sql" | "results" | "metadata" | "chart" | "report" | "logs";

export function ResultTabs({ result }: ResultTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>("results");
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [chatExportCount, setChatExportCount] = useState(() => getChatExportCount());
  const [kpiPinned, setKpiPinned] = useState(false);

  // Détection automatique : résultat = 1 ligne × 1 colonne → candidat KPI
  const kpiCandidate = (() => {
    if (result.csvData.length !== 1) return null;
    const keys = Object.keys(result.csvData[0] || {});
    if (keys.length !== 1) return null;
    const col = keys[0];
    const { formatted, numeric } = formatKpiValue(result.csvData[0][col]);
    return { columnName: col, formatted, numeric };
  })();

  // Sync les états épinglé quand l'utilisateur change de résultat
  useEffect(() => {
    setPinned(false);
    setKpiPinned(false);
  }, [result.id]);

  const handlePin = async () => {
    if (pinned) {
      await unpinUserChart(result.id);
      setPinned(false);
    } else {
      await pinUserChart({
        id: result.id,
        questionName: result.questionName,
        questionText: result.questionText,
        chartUrl: result.artifactUrls.chart,
        pinnedAt: Date.now(),
      });
      setPinned(true);
    }
  };

  const handleDownload = (artifactPath: string) => {
    window.open(buildArtifactUrl(artifactPath), "_blank", "noopener,noreferrer");
  };

  // Synchronise le badge Chat quand l'utilisateur revient sur cet onglet
  useEffect(() => {
    const onFocus = () => setChatExportCount(getChatExportCount());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      await exportReportToPdf(result);
      // Vider la sélection Chat après export réussi
      clearChatExport();
      setChatExportCount(0);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "results", label: "Results", icon: <Table className="w-4 h-4" /> },
    { id: "sql", label: "SQL", icon: <Code2 className="w-4 h-4" /> },
    { id: "metadata", label: "Metadata", icon: <Database className="w-4 h-4" /> },
    { id: "chart", label: "Chart", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "report", label: "Report", icon: <FileText className="w-4 h-4" /> },
    { id: "logs", label: "Logs", icon: <Terminal className="w-4 h-4" /> },
  ];

  return (
    <div className="mt-4 bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Tab Header */}
      <div className="flex items-center gap-1 p-2 bg-stone-50 border-b border-stone-200 overflow-x-auto">
        {tabs.map((tab) => (
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
        {activeTab === "sql" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => handleDownload(result.artifactUrls.sql)}
                className="flex items-center gap-2 text-sm font-medium text-stone-600 bg-white border border-stone-200 px-3 py-1.5 rounded-xl hover:bg-stone-50 hover:text-stone-900 transition-colors shadow-sm"
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

        {activeTab === "results" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              {/* Bouton KPI — visible uniquement si résultat = 1 ligne × 1 colonne */}
              {kpiCandidate ? (
                <button
                  type="button"
                  onClick={async () => {
                    if (kpiPinned) {
                      await unpinUserKpi(result.id);
                      setKpiPinned(false);
                    } else {
                      await pinUserKpi({
                        id: result.id,
                        questionText: result.questionText,
                        questionName: result.questionName,
                        columnName: kpiCandidate.columnName,
                        value: kpiCandidate.formatted,
                        rawValue: kpiCandidate.numeric,
                        database: result.databaseName,
                        schema: result.schemaName,
                        provider: result.providerName,
                        pinnedAt: Date.now(),
                        lastUpdated: Date.now(),
                      });
                      setKpiPinned(true);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-lg border transition-colors",
                    kpiPinned
                      ? "bg-amber-500 text-white border-amber-500 hover:bg-amber-600"
                      : "bg-white text-zinc-600 border-zinc-200 hover:border-amber-400 hover:text-amber-600"
                  )}
                >
                  <TrendingUp className="w-4 h-4" />
                  {kpiPinned ? "KPI épinglé ✓" : `Épingler comme KPI · ${kpiCandidate.formatted}`}
                </button>
              ) : <div />}

              <button
                type="button"
                onClick={() => handleDownload(result.artifactUrls.csv)}
                className="flex items-center gap-2 text-sm font-medium text-stone-600 bg-white border border-stone-200 px-3 py-1.5 rounded-xl hover:bg-stone-50 hover:text-stone-900 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" /> Download CSV
              </button>
            </div>
            {result.csvData.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center text-sm text-stone-500">
                No rows returned for this query.
              </div>
            ) : (
            <div className="border border-stone-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-stone-600">
                  <thead className="text-xs text-stone-700 uppercase bg-stone-50 border-b border-stone-200">
                    <tr>
                      {Object.keys(result.csvData[0] || {}).map((key) => (
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

        {activeTab === "metadata" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-stone-900">Raw Metadata</h3>
                <button
                  type="button"
                  onClick={() => handleDownload(result.artifactUrls.metadata)}
                  className="flex items-center gap-2 text-sm font-medium text-stone-600 bg-white border border-stone-200 px-3 py-1.5 rounded-xl hover:bg-stone-50 hover:text-stone-900 transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" /> JSON
                </button>
              </div>
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 overflow-x-auto">
                <pre className="text-sm text-stone-700 font-mono">
                  <code>{JSON.stringify(result.metadata, null, 2)}</code>
                </pre>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-stone-900 mb-4">Summary</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
                    <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Rows</p>
                    <p className="text-2xl font-bold text-stone-900">{result.metadata.rows_returned}</p>
                  </div>
                  <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
                    <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Columns</p>
                    <p className="text-2xl font-bold text-stone-900">{result.metadata.columns?.length ?? 0}</p>
                  </div>
                  <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm col-span-2">
                    <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Execution Time</p>
                    <p className="text-2xl font-bold text-stone-900">{result.metadata.execution_time_ms ?? 0} <span className="text-sm font-normal text-stone-500">ms</span></p>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900 mb-3">Schema</h3>
                <div className="border border-stone-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm text-left text-stone-600">
                    <thead className="text-xs text-stone-700 uppercase bg-stone-50 border-b border-stone-200">
                      <tr>
                        <th className="px-4 py-2 font-semibold">Column</th>
                        <th className="px-4 py-2 font-semibold">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result.metadata.columns ?? []).map((col, i) => (
                        <tr key={i} className="bg-white border-b border-stone-100 last:border-0">
                          <td className="px-4 py-2 font-medium text-stone-900">{col.name}</td>
                          <td className="px-4 py-2 font-mono text-xs text-orange-600 bg-orange-50 rounded inline-block mt-1.5 mb-1.5 ml-4">{col.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "chart" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handlePin}
                className={cn(
                  "flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-lg border transition-colors",
                  pinned
                    ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
                    : "bg-white text-zinc-600 border-zinc-200 hover:border-indigo-400 hover:text-indigo-600"
                )}
              >
                {pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                {pinned ? "Épinglé ✓" : "Épingler au tableau de bord"}
              </button>
              <button
                type="button"
                onClick={() => handleDownload(result.artifactUrls.chart)}
                className="flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
              >
                <Download className="w-4 h-4" /> HTML
              </button>
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
                <div className="text-sm text-stone-500">No chart was generated for this run.</div>
              )}
            </div>
          </div>
        )}

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

        {activeTab === "logs" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => handleDownload(result.artifactUrls.logs)}
                className="flex items-center gap-2 text-sm font-medium text-stone-600 bg-white border border-stone-200 px-3 py-1.5 rounded-xl hover:bg-stone-50 hover:text-stone-900 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" /> Download Logs
              </button>
            </div>
            <div className="bg-stone-950 rounded-xl p-4 overflow-x-auto">
              <pre className="text-sm text-stone-400 font-mono leading-relaxed">
                <code>{result.logs}</code>
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
