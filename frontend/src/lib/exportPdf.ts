/**
 * Export du rapport en PDF — AskData
 *
 * Stratégie :
 * 1. Création d'une iframe temporaire cachée avec le HTML Plotly (result.chartHtml)
 *    → permet la capture même si l'onglet Chart n'est pas actif dans l'UI
 * 2. Attente du chargement de Plotly dans l'iframe (avec timeout 10s)
 * 3. Capture PNG via Plotly.toImage()
 * 4. Génération d'une page HTML stylée avec en-tête, métriques, graphique et insights
 * 5. Ouverture dans une nouvelle fenêtre + window.print() automatique
 */

import { PipelineResult } from "../types";
import { buildArtifactUrl, fetchUserKpis } from "./api";
import { getChatExport, ChatExportMessage } from "./chatExport";
import { KpiItem } from "../types";

/** Convertit le markdown basique en HTML lisible à l'impression */
function mdToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

/**
 * Capture le graphique Plotly en créant une iframe temporaire cachée.
 * Fonctionne quel que soit l'onglet actif dans l'UI.
 * Retourne une image PNG en base64, ou null si la capture échoue.
 */
async function captureChart(chartHtml: string): Promise<string | null> {
  if (!chartHtml) return null;

  return new Promise((resolve) => {
    // Iframe hors écran, dimensionnée pour que Plotly rende correctement
    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;width:900px;height:500px;opacity:0;pointer-events:none;";
    // allow-same-origin est indispensable pour que la page parent
    // puisse accéder à iframe.contentWindow.Plotly après le chargement
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
    document.body.appendChild(iframe);

    const cleanup = () => {
      try { document.body.removeChild(iframe); } catch { /* déjà supprimé */ }
    };

    // Timeout global : 12 secondes max
    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 12_000);

    iframe.onload = async () => {
      const iWin = iframe.contentWindow as any;

      // Attendre que Plotly soit disponible dans l'iframe (max 5s)
      let tries = 0;
      while (!iWin?.Plotly && tries < 50) {
        await new Promise<void>(r => setTimeout(r, 100));
        tries++;
      }

      if (!iWin?.Plotly) {
        clearTimeout(timeout);
        cleanup();
        resolve(null);
        return;
      }

      // Attendre un cycle de rendu supplémentaire
      await new Promise<void>(r => setTimeout(r, 300));

      const plotDiv = iframe.contentDocument?.querySelector(".js-plotly-plot");
      if (!plotDiv) {
        clearTimeout(timeout);
        cleanup();
        resolve(null);
        return;
      }

      try {
        const imgUrl: string = await iWin.Plotly.toImage(plotDiv, {
          format: "png",
          width: 800,
          height: 420,
        });
        clearTimeout(timeout);
        cleanup();
        resolve(imgUrl);
      } catch {
        clearTimeout(timeout);
        cleanup();
        resolve(null);
      }
    };

    // Injecter le HTML Plotly dans l'iframe
    iframe.srcdoc = chartHtml;
  });
}

/** Génère le HTML des KPIs épinglés pour l'inclure dans le PDF */
function renderKpis(kpis: KpiItem[]): string {
  if (kpis.length === 0) return "";
  const cards = kpis.map(k => {
    const delta = k.rawValue !== null && k.previousValue !== null && k.previousValue !== 0
      ? ((k.rawValue - k.previousValue) / Math.abs(k.previousValue)) * 100
      : null;
    const deltaHtml = delta !== null
      ? `<div class="kpi-delta ${delta >= 0 ? "kpi-up" : "kpi-down"}">${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)}%</div>`
      : "";
    return `
      <div class="kpi-card">
        <div class="kpi-label">${k.columnName}</div>
        <div class="kpi-value">${k.value}</div>
        ${deltaHtml}
        <div class="kpi-source">${k.questionText}</div>
      </div>`;
  }).join("");
  return `<section>
    <h2>KPIs épinglés</h2>
    <div class="kpi-grid">${cards}</div>
  </section>`;
}

/** Génère le HTML d'un échange Chat IA pour l'inclure dans le PDF */
function renderChatMessages(messages: ChatExportMessage[]): string {
  if (messages.length === 0) return "";
  const rows = messages.map(m => {
    const isUser = m.role === "user";
    const time = new Date(m.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return `
      <div class="chat-msg ${isUser ? "chat-user" : "chat-assistant"}">
        <div class="chat-meta">
          <span class="chat-role">${isUser ? "👤 Vous" : "🤖 Data Analyst IA"}</span>
          <span class="chat-time">${time}</span>
        </div>
        <div class="chat-bubble ${isUser ? "bubble-user" : "bubble-assistant"}">
          ${m.content.replace(/\n/g, "<br>")}
        </div>
      </div>`;
  }).join("");
  return `<section>
    <h2>Discussion IA</h2>
    <div class="chat-log">${rows}</div>
  </section>`;
}

/** Génère et ouvre la page d'impression du rapport complet */
export async function exportReportToPdf(result: PipelineResult): Promise<void> {
  const date = new Date().toLocaleDateString("fr-FR", { dateStyle: "long" });
  const meta = result.metadata;

  // Récupération des messages Chat IA sélectionnés
  const chatMessages = getChatExport();

  // Récupération des KPIs épinglés depuis le backend
  const kpisData = await fetchUserKpis().catch(() => ({ kpis: [] }));
  const kpis = kpisData.kpis as KpiItem[];

  // Capture du graphique via iframe temporaire cachée
  const chartImageUrl = await captureChart(result.chartHtml);

  // Fallback : URL directe de l'artefact si la capture a échoué
  const chartFallbackUrl = result.artifactUrls?.chart
    ? buildArtifactUrl(result.artifactUrls.chart)
    : null;

  const chartSection = chartImageUrl
    ? `<section>
        <h2>Visualisation</h2>
        <img class="chart-img" src="${chartImageUrl}" alt="Graphique de l'analyse" />
      </section>`
    : chartFallbackUrl
    ? `<section>
        <h2>Visualisation</h2>
        <p style="font-size:12px;color:#94a3b8;margin-bottom:8px;font-style:italic;">
          Aperçu interactif — imprimez depuis l'onglet Chart pour une meilleure qualité.
        </p>
        <iframe
          src="${chartFallbackUrl}"
          style="width:100%;height:420px;border:1px solid #e2e8f0;border-radius:8px;"
          sandbox="allow-scripts allow-same-origin"
        ></iframe>
      </section>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Rapport — ${result.questionName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      color: #1e293b; background: white;
      padding: 32px 40px; max-width: 900px; margin: 0 auto;
    }

    /* En-tête */
    .header { border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 28px; }
    .label  { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 6px; }
    .header h1 { font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 10px; }
    .meta   { display: flex; gap: 20px; font-size: 12px; color: #64748b; flex-wrap: wrap; }

    /* Métriques */
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 32px; }
    .metric  { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
    .metric-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: .06em; }
    .metric-value { font-size: 26px; font-weight: 700; color: #0f172a; }
    .metric-value span { font-size: 13px; font-weight: 400; color: #94a3b8; }

    /* Sections */
    section { margin-bottom: 32px; }
    section > h2 {
      font-size: 16px; font-weight: 700; color: #0f172a;
      margin-bottom: 14px; padding-bottom: 6px;
      border-bottom: 1px solid #e2e8f0;
    }

    /* Graphique : image statique, s'imprime parfaitement */
    .chart-img { width: 100%; border-radius: 8px; border: 1px solid #e2e8f0; }

    /* Insights markdown */
    .prose h1, .prose h2, .prose h3 { font-weight: 700; color: #0f172a; margin: 16px 0 6px; }
    .prose h1 { font-size: 16px; }
    .prose h2 { font-size: 15px; }
    .prose h3 { font-size: 14px; }
    .prose p  { margin: 8px 0; line-height: 1.7; font-size: 13px; color: #334155; }
    .prose ul { padding-left: 20px; margin: 8px 0; }
    .prose li { margin: 4px 0; font-size: 13px; color: #334155; line-height: 1.6; }
    .prose strong { font-weight: 600; color: #1e293b; }

    /* KPIs */
    .kpi-grid  { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .kpi-card  { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 14px; }
    .kpi-label { font-size: 10px; color: #92400e; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
    .kpi-value { font-size: 22px; font-weight: 700; color: #0f172a; }
    .kpi-delta { font-size: 11px; font-weight: 600; margin-top: 4px; }
    .kpi-up    { color: #16a34a; }
    .kpi-down  { color: #dc2626; }
    .kpi-source{ font-size: 10px; color: #94a3b8; margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* Discussion IA */
    .chat-log { display: flex; flex-direction: column; gap: 14px; }
    .chat-msg  { display: flex; flex-direction: column; gap: 4px; }
    .chat-meta { display: flex; justify-content: space-between; align-items: center; }
    .chat-role { font-size: 11px; font-weight: 600; color: #64748b; }
    .chat-time { font-size: 10px; color: #94a3b8; }
    .chat-bubble {
      font-size: 13px; line-height: 1.6; padding: 10px 14px;
      border-radius: 10px; max-width: 85%;
    }
    .bubble-user      { background: #1e293b; color: #f8fafc; align-self: flex-end; border-radius: 10px 2px 10px 10px; }
    .bubble-assistant { background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; align-self: flex-start; border-radius: 2px 10px 10px 10px; }
    .chat-user      { align-items: flex-end; }
    .chat-assistant { align-items: flex-start; }

    /* Pied de page */
    footer {
      margin-top: 40px; padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      font-size: 11px; color: #94a3b8;
      display: flex; justify-content: space-between;
    }

    @media print {
      body { padding: 20px 28px; }
      section { page-break-inside: avoid; }
      @page { margin: 1.5cm; size: A4; }
    }
  </style>
</head>
<body>

  <div class="header">
    <div class="label">Rapport d'analyse · AskData</div>
    <h1>${result.questionText}</h1>
    <div class="meta">
      <span>📅 ${date}</span>
      <span>🗄️ ${result.databaseName}${result.schemaName ? " · " + result.schemaName : ""}</span>
      <span>🤖 ${result.providerName}</span>
    </div>
  </div>

  <div class="metrics">
    <div class="metric">
      <div class="metric-label">Lignes retournées</div>
      <div class="metric-value">${meta.rows_returned ?? 0}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Colonnes</div>
      <div class="metric-value">${meta.columns?.length ?? 0}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Temps d'exécution</div>
      <div class="metric-value">${meta.execution_time_ms ?? 0}<span>ms</span></div>
    </div>
  </div>

  ${renderKpis(kpis)}

  ${chartSection}

  ${result.report ? `
  <section>
    <h2>Insights &amp; Actions</h2>
    <div class="prose"><p>${mdToHtml(result.report)}</p></div>
  </section>
  ` : ""}

  ${renderChatMessages(chatMessages)}

  <footer>
    <span>AskData — ${result.databaseName}</span>
    <span>${date}</span>
  </footer>

  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 500);
    });
  </script>

</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.addEventListener("afterprint", () => URL.revokeObjectURL(url));
  }
}
