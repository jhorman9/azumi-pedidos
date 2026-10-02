declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string, options?: { timeout?: number });
    exec(sql: string): void;
    prepare(sql: string): {
      get(...params: (string | number | null)[]): Record<string, unknown> | undefined;
      all(...params: (string | number | null)[]): Record<string, unknown>[];
      run(...params: (string | number | null)[]): { lastInsertRowid: number | bigint; changes: number | bigint };
    };
    close(): void;
  }
}
