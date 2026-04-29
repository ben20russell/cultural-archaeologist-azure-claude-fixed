declare module 'better-sqlite3' {
  type Statement = {
    run: (...params: unknown[]) => unknown;
    get: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => unknown[];
  };

  class Database {
    constructor(filename: string, options?: Record<string, unknown>);
    pragma(command: string): unknown;
    exec(sql: string): this;
    prepare(sql: string): Statement;
  }

  export default Database;
}
