import postgres from 'postgres';

declare module 'postgres' {
  /**
   * DRY: Common interface for query results returned as raw values (tuples).
   * Prevents duplication across Sql, ReservedSql, and TransactionSql interfaces.
   */
  interface ValuesQuery {
    /**
     * Executes a query and returns rows as arrays of values (tuples).
     * @param template Template string literal
     * @param parameters Query parameters
     */
    values<T extends readonly unknown[]>(
      template: TemplateStringsArray,
      ...parameters: readonly unknown[]
    ): Promise<T>;

    /**
     * Executes a query string and returns rows as arrays of values (tuples).
     * @param query Raw SQL query string
     * @param parameters Optional query parameters
     */
    values<T extends readonly unknown[]>(
      query: string,
      parameters?: readonly unknown[]
    ): Promise<T>;
  }

  // ============================================================================
  // TYPE AUGMENTATIONS — postgres.js values<T> type correction
  // ============================================================================
  // Corrects return types so that tx.values<[string, number][]> returns 
  // Promise<[string, number][]> instead of the library's default (T | undefined)[][].
  // ============================================================================

  interface Sql<TTypes extends Record<string, unknown> = {}> extends ValuesQuery {}

  interface ReservedSql<TTypes extends Record<string, unknown> = {}> extends ValuesQuery {}

  interface TransactionSql<TTypes extends Record<string, unknown> = {}> extends ValuesQuery {
    /**
     * Main query execution signature for transactions.
     */
    <T extends readonly (object | undefined)[] = Row[]>(
      template: TemplateStringsArray,
      ...parameters: readonly unknown[]
    ): PendingQuery<T>;
  }
}
