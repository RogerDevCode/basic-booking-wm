export interface ActionContext {
  tx: any;  // Replace with actual type
  input: any;
}

export interface ActionHandler {
  handle(context: ActionContext): Promise<[Error | null, unknown | null]>;
}
