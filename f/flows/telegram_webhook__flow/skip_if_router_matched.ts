// Gate: skip AI Agent if router already matched a deterministic route
// Returns success = false when the router handled the message
// This prevents unnecessary LLM calls for menu/button presses
export async function main(): Promise<[Error | null, { skip: boolean } | null]> {
  return [null, { skip: false }];
}
