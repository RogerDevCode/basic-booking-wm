// Gate: if callback_data exists, skip parser (router will handle it directly)
// Windmill evaluates skip_if expr; if true, this module and all downstream
// modules that depend on its output are skipped.
export async function main(): Promise<[Error | null, { has_callback: boolean } | null]> {
  return [null, { has_callback: false }];
}
