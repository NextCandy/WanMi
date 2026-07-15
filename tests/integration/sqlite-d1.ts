import { DatabaseSync, type SQLInputValue } from "node:sqlite";

type Value = string | number | null | ArrayBuffer;

function sqliteValue(value: Value): SQLInputValue {
  return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
}

export function executeSql(databasePath: string, sql: string): void {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(sql);
  } finally {
    database.close();
  }
}

export function queryRows<T>(databasePath: string, sql: string, params: Value[] = []): T[] {
  const database = new DatabaseSync(databasePath);
  try {
    return database.prepare(sql).all(...params.map(sqliteValue)) as T[];
  } finally {
    database.close();
  }
}

export class SqliteD1Statement {
  constructor(
    private readonly databasePath: string,
    readonly sql: string,
    readonly params: Value[] = [],
  ) {}

  bind(...params: Value[]): SqliteD1Statement { return new SqliteD1Statement(this.databasePath, this.sql, params); }

  async all<T = Record<string, unknown>>() {
    const results = queryRows<T>(this.databasePath, this.sql, this.params);
    return { success: true, results, meta: { changes: 0, last_row_id: 0 } };
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = (await this.all<T>()).results[0] ?? null;
    return column && row ? (row as Record<string, unknown>)[column] as T : row;
  }

  async run<T = Record<string, unknown>>() {
    const database = new DatabaseSync(this.databasePath);
    try {
      const result = database.prepare(this.sql).run(...this.params.map(sqliteValue));
      return {
        success: true,
        results: [] as T[],
        meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
      };
    } finally {
      database.close();
    }
  }
}

export class SqliteD1Database {
  constructor(readonly databasePath: string) {}
  prepare(sql: string): SqliteD1Statement { return new SqliteD1Statement(this.databasePath, sql); }
  async batch(statements: SqliteD1Statement[]) {
    const results = [];
    for (const statement of statements) {
      results.push(/^\s*(SELECT|WITH|PRAGMA)/i.test(statement.sql) ? await statement.all() : await statement.run());
    }
    return results;
  }
}
