declare module 'better-sqlite3' {
  export interface Statement<T = unknown> {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): T;
    all(...params: unknown[]): T[];
  }

  export default class Database {
    constructor(path: string, options?: Record<string, unknown>);
    pragma(statement: string): unknown;
    exec(sql: string): this;
    prepare<T = unknown>(sql: string): Statement<T>;
    close(): void;
  }
}
