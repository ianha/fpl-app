import type { AppDatabase } from "../db/database.js";
import { annotateSchema, type SchemaTable } from "./schemaContext.js";

export const READ_ONLY_QUERY_ERROR_MESSAGE = "Only SELECT or WITH queries are permitted.";
export const SENSITIVE_QUERY_ERROR_MESSAGE = "Queries may not access sensitive credential columns.";

const SENSITIVE_COLUMN_NAMES = new Set(["encrypted_credentials"]);

export function isSafeReadOnlyQuery(sql: string): boolean {
  const first = sql.trim().toUpperCase().split(/\s+/)[0];
  return first === "SELECT" || first === "WITH";
}

function referencesSensitiveColumn(sql: string) {
  return /\bencrypted_credentials\b/i.test(sql);
}

function hasSensitiveResultColumn(columns: Array<{ name: string }>) {
  return columns.some((column) =>
    SENSITIVE_COLUMN_NAMES.has(column.name.toLowerCase()),
  );
}

function withoutSensitiveColumns<
  T extends { table: string; createSql: string; columns: Array<{ name: string }> },
>(table: T): T {
  if (table.table !== "my_team_accounts") {
    return table;
  }

  return {
    ...table,
    createSql: table.createSql.replace(
      /^\s*encrypted_credentials\s+TEXT\s+NOT\s+NULL,?\n?/im,
      "",
    ),
    columns: table.columns.filter(
      (column) => !SENSITIVE_COLUMN_NAMES.has(column.name.toLowerCase()),
    ),
  };
}

export function buildDatabaseSchema(db: AppDatabase) {
  const tables = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string; sql: string }[];

  const schema = tables.map((table) =>
    withoutSensitiveColumns({
      table: table.name,
      createSql: table.sql,
      columns: (db.prepare(`PRAGMA table_info(${table.name})`).all() as Array<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }>).map((column) => ({
        name: column.name,
        type: column.type,
        notNull: column.notnull === 1,
        defaultValue: column.dflt_value,
        primaryKey: column.pk > 0,
      })),
    }),
  ) satisfies SchemaTable[];

  return annotateSchema(schema);
}

export function executeReadOnlyQuery(db: AppDatabase, sql: string) {
  if (!isSafeReadOnlyQuery(sql)) {
    throw new Error(READ_ONLY_QUERY_ERROR_MESSAGE);
  }

  if (referencesSensitiveColumn(sql)) {
    throw new Error(SENSITIVE_QUERY_ERROR_MESSAGE);
  }

  db.pragma("query_only = ON");
  try {
    const statement = db.prepare(sql);
    if (hasSensitiveResultColumn(statement.columns())) {
      throw new Error(SENSITIVE_QUERY_ERROR_MESSAGE);
    }
    return statement.all();
  } finally {
    db.pragma("query_only = OFF");
  }
}
