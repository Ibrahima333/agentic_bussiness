export interface PipelineResultSummary {
  id: string;
  questionName: string;
  questionText: string;
  databaseName: string;
  schemaName: string;
  providerName: string;
  timestamp: number;
}

export interface ArtifactUrls {
  sql: string;
  csv: string;
  metadata: string;
  chart: string;
  report: string;
  logs: string;
}

export interface PipelineResult extends PipelineResultSummary {
  sql: string;
  csvData: Record<string, unknown>[];
  metadata: {
    question?: string;
    rows_returned: number;
    columns: Array<{ name: string; type: string }>;
    sql_file?: string;
    database?: string;
    schema?: string;
    execution_time_ms?: number;
    query_hash?: string;
  };
  report: string;
  logs: string;
  chartHtml: string;
  artifactUrls: ArtifactUrls;
}

export interface DashboardItem {
  id: string;
  questionName: string;
  questionText: string;
  chartHtml: string;
  database: string;
  schema: string;
  provider: string;
  pinnedAt: number;
  /** Largeur en colonnes (6 = demi, 12 = pleine largeur) */
  w: number;
}

export interface AppState {
  databases: string[];
  schemas: string[];
  providers: string[];
  selectedDatabase: string;
  selectedSchema: string;
  selectedProvider: string;
  overwriteExisting: boolean;
  history: PipelineResultSummary[];
  activeResultId: string | null;
  activeResult: PipelineResult | null;
  isLoading: boolean;
  isBootstrapping: boolean;
  errorMessage: string | null;
  /** Texte à insérer dans le champ de saisie (depuis l'explorateur de schéma) */
  insertText: string | null;
}
