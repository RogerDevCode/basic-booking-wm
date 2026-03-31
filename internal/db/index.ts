import postgres from "postgres";

export const getDbPool = () => {
  // En Windmill, la BD puede venir por recurso o por env local.
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }
  
  // Singleton para no agotar pool en hot starts de bun
  const globalAny = global as any;
  if (!globalAny.__dbPool) {
    globalAny.__dbPool = postgres(connectionString, {
        max: 5,
        idle_timeout: 30, // seconds
        connect_timeout: 5,
    });
  }
  
  return globalAny.__dbPool as postgres.Sql<{}>;
};
