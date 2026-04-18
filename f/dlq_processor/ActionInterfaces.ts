import type postgres from 'postgres';

export interface ActionContext {
  tx: postgres.Sql;
  input: unknown;
}

export interface ActionHandler {
  handle(context: ActionContext): Promise<[Error | null, unknown]>;
}
