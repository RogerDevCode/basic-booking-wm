import postgres from 'postgres';
declare module 'postgres' {
  // ============================================================================
  // TYPE AUGMENTATIONS — postgres.js values<T> type correction
  // ============================================================================
  // postgres.js tx.values<T[]>`` returns ValuesRowList<T[]> whose internal
  // mapped type yields (T[number] | undefined)[][] — making row[0] infer as
  // the whole tuple or undefined, not the first element.
  //
  // These augmented signatures correct the return type so that:
  //   tx.values<[string, number][]>`` returns Promise<[string, number][]>
  // which means rows.map(([a, b]) => ...) or rows.map(row => row[0]) works
  // without TS2322 errors.
  //
  // The T parameter should be the full row array type (e.g. [string, number][]);
  // This augmentation keeps that convention and returns T directly.
  // ============================================================================
  interface Sql<TTypes extends Record<string, unknown> = {}> {
    values<T extends readonly any[]>(template: TemplateStringsArray, ...parameters: any[]): Promise<T>;
    values<T extends readonly any[]>(query: string, parameters?: any[]): Promise<T>;
  }
  interface ReservedSql<TTypes extends Record<string, unknown> = {}> {
    values<T extends readonly any[]>(template: TemplateStringsArray, ...parameters: any[]): Promise<T>;
    values<T extends readonly any[]>(query: string, parameters?: any[]): Promise<T>;
  }
  interface TransactionSql<TTypes extends Record<string, unknown> = {}> {
    <T extends readonly (object | undefined)[] = Row[]>(template: TemplateStringsArray, ...parameters: readonly any[]): PendingQuery<T>;
    values<T extends readonly any[]>(template: TemplateStringsArray, ...parameters: any[]): Promise<T>;
    values<T extends readonly any[]>(query: string, parameters?: any[]): Promise<T>;
  }
}
