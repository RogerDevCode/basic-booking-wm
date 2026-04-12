// Gate: skip booking orchestrator if router handled the message deterministically
// The orchestrator is only needed when AI Agent extracted booking intent
export async function main(): Promise<[Error | null, { skip: boolean } | null]> {
  return [null, { skip: false }];
}
