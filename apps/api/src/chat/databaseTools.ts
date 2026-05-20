import type { AppDatabase } from "../db/database.js";
import { annotateSchema, type SchemaTable } from "./schemaContext.js";

export const READ_ONLY_QUERY_ERROR_MESSAGE = "Only SELECT or WITH queries are permitted.";
export const SENSITIVE_QUERY_ERROR_MESSAGE = "Queries may not access sensitive credential columns.";

const SENSITIVE_COLUMN_NAMES = new Set(["encrypted_credentials"]);

export function stripComments(sql: string): string {
  let state: 'NORMAL' | 'SINGLE_QUOTE' | 'DOUBLE_QUOTE' | 'BACKTICK' | 'BRACKET' | 'LINE_COMMENT' | 'BLOCK_COMMENT' = 'NORMAL';
  let result = '';
  let i = 0;
  const len = sql.length;

  while (i < len) {
    const char = sql[i]!;
    const nextChar = i + 1 < len ? sql[i + 1]! : '';

    if (state === 'NORMAL') {
      if (char === '-' && nextChar === '-') {
        state = 'LINE_COMMENT';
        result += ' ';
        i += 2;
      } else if (char === '/' && nextChar === '*') {
        state = 'BLOCK_COMMENT';
        result += ' ';
        i += 2;
      } else if (char === "'") {
        state = 'SINGLE_QUOTE';
        result += char;
        i++;
      } else if (char === '"') {
        state = 'DOUBLE_QUOTE';
        result += char;
        i++;
      } else if (char === '`') {
        state = 'BACKTICK';
        result += char;
        i++;
      } else if (char === '[') {
        state = 'BRACKET';
        result += char;
        i++;
      } else {
        result += char;
        i++;
      }
    } else if (state === 'SINGLE_QUOTE') {
      if (char === "'") {
        if (nextChar === "'") {
          result += "''";
          i += 2;
        } else {
          state = 'NORMAL';
          result += char;
          i++;
        }
      } else {
        result += char;
        i++;
      }
    } else if (state === 'DOUBLE_QUOTE') {
      if (char === '"') {
        if (nextChar === '"') {
          result += '""';
          i += 2;
        } else {
          state = 'NORMAL';
          result += char;
          i++;
        }
      } else {
        result += char;
        i++;
      }
    } else if (state === 'BACKTICK') {
      if (char === '`') {
        state = 'NORMAL';
        result += char;
        i++;
      } else {
        result += char;
        i++;
      }
    } else if (state === 'BRACKET') {
      if (char === ']') {
        state = 'NORMAL';
        result += char;
        i++;
      } else {
        result += char;
        i++;
      }
    } else if (state === 'LINE_COMMENT') {
      if (char === '\n' || char === '\r') {
        state = 'NORMAL';
        result += char;
        i++;
      } else {
        i++;
      }
    } else if (state === 'BLOCK_COMMENT') {
      if (char === '*' && nextChar === '/') {
        state = 'NORMAL';
        i += 2;
      } else {
        if (char === '\n' || char === '\r') {
          result += char;
        }
        i++;
      }
    }
  }

  return result;
}

export function isSafeReadOnlyQuery(sql: string): boolean {
  const stripped = stripComments(sql);
  const first = stripped.trim().toUpperCase().split(/\s+/)[0];
  return first === "SELECT" || first === "WITH";
}

function referencesSensitiveColumn(sql: string) {
  return /\bencrypted_credentials\b/i.test(sql);
}

function referencesSensitiveWildcard(sql: string) {
  return /\bmy_team_accounts\b/i.test(sql) && sql.includes("*");
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
  const stripped = stripComments(sql);

  if (!isSafeReadOnlyQuery(stripped)) {
    throw new Error(READ_ONLY_QUERY_ERROR_MESSAGE);
  }

  if (referencesSensitiveColumn(stripped) || referencesSensitiveWildcard(stripped)) {
    throw new Error(SENSITIVE_QUERY_ERROR_MESSAGE);
  }

  db.pragma("query_only = ON");
  try {
    const statement = db.prepare(stripped);
    if (hasSensitiveResultColumn(statement.columns())) {
      throw new Error(SENSITIVE_QUERY_ERROR_MESSAGE);
    }
    return statement.all();
  } finally {
    db.pragma("query_only = OFF");
  }
}

