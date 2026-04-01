import postgres from "postgres";

interface CustomGlobal {
  __dbPool?: postgres.Sql<Record<string, never>>;
}

export const getDatabasePool = (): postgres.Sql<Record<string, never>> => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }
  
  const globalAny = global as unknown as CustomGlobal;
  
  if (!globalAny.__dbPool) {
    globalAny.__dbPool = postgres(connectionString, {
        max: 5,
        idle_timeout: 30, // seconds
        connect_timeout: 5,
    });
  }
  
  return globalAny.__dbPool;
};
