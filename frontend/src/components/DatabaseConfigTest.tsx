import React from "react";
import DatabaseConfig from "./DatabaseConfig";
import type { DbConfigPayload } from "./DatabaseConfig";

// Tests rapides au runtime (sans framework de test).
// Vérifie que le composant peut s’afficher et que le câblage des props compile.

export default function DatabaseConfigTestHarness() {
  const api = {
    fetchDbConfig: async () => ({
      config: {
        db_type: "postgresql",
        host: "localhost",
        port: 5432,
        user: "postgres",
        password: "********",
        database: "mydb",
        schema: "public",
        extra: {},
      },
      lastTest: { success: true, message: "ok" },
      supportedTypes: ["postgresql", "mysql"],
    }),
    testDbConfig: async (_payload: DbConfigPayload) => ({ success: true, message: "Connection successful" }),
    saveDbConfig: async (_payload: DbConfigPayload) => ({ success: true }),
    connectDbConfig: async (_payload: DbConfigPayload) => ({ success: true, connection: { success: true, message: "Connected" }, lastTest: { success: true, message: "Connected" }, config: {} }),
  };

  return <DatabaseConfig api={api} onAfterConnect={() => void 0} />;
}

