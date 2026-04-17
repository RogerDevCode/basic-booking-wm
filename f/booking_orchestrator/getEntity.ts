export function getEntity(entities: Record<string, string | null>, key: string): string | undefined {
  return entities[key] ?? undefined;
}
