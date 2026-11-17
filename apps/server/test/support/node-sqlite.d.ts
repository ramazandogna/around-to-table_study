/** The few parts of Node's built-in SQLite the test fakes use (no @types/node here). */
declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): {
      all(...params: never[]): unknown[];
      run(...params: never[]): { changes: number | bigint };
    };
  }
}
