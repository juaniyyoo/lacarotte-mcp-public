/**
 * Configuration centralisée — Variables d'environnement
 */

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  // API LaCarotte — supporte LACAROTTE_API_URL ou LA_CAROTTE_API_URL
  lacarotte: {
    apiUrl: process.env.LACAROTTE_API_URL ?? process.env.LA_CAROTTE_API_URL ?? "http://localhost:3200",
    privateKey: (() => {
      const val = process.env.LACAROTTE_PRIVATE_KEY ?? "";
      if (!val) return "";
      // Support base64-encoded PEM (même format que LA_CAROTTE_PRIVATE_KEY dans l'API)
      if (!val.startsWith("-----BEGIN")) {
        try { return Buffer.from(val, "base64").toString("utf8"); } catch { return val; }
      }
      return val;
    })(),
    defaultTenant: requireEnv("LACAROTTE_DEFAULT_TENANT", ".fr.la-carotte"),
    serverClientId: requireEnv("LACAROTTE_SERVER_CLIENT_ID", "lacarotte-mcp"),
  },

  // MongoDB — supporte MONGODB_URI direct ou variables LA_CAROTTE_DATABASE_*
  mongodb: {
    uri: process.env.MONGODB_URI ?? (() => {
      const address    = process.env.LA_CAROTTE_DATABASE_ADDRESS ?? "localhost";
      const port       = process.env.LA_CAROTTE_DATABASE_PORT ?? "27017";
      const user       = process.env.LA_CAROTTE_DATABASE_USER;
      const pass       = process.env.LA_CAROTTE_DATABASE_PASSWORD;
      const db         = process.env.LA_CAROTTE_DATABASE_NAME ?? "lacarotte";
      const replicaSet = process.env.LA_CAROTTE_DATABASE_REPLICA_SET;
      // Build host list: each host gets its own port
      const hosts = address.includes(',')
        ? address.split(',').map(h => `${h.trim()}:${port}`).join(',')
        : `${address}:${port}`;
      const rsParam = replicaSet ? `&replicaSet=${replicaSet}` : '';
      if (user && pass) {
        return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${hosts}/${db}?authSource=admin${rsParam}`;
      }
      return `mongodb://${hosts}/${db}`;
    })(),
    dbName: process.env.MONGODB_DB_NAME ?? process.env.LA_CAROTTE_DATABASE_NAME ?? "lacarotte",
  },

  // Redis (Upstash)
  redis: {
    url: process.env.UPSTASH_REDIS_URL ?? "",
    token: process.env.UPSTASH_REDIS_TOKEN ?? "",
  },

  // Email (Brevo)
  email: {
    apiKey: process.env.BREVO_API_KEY ?? "",
    senderEmail: process.env.BREVO_SENDER_EMAIL ?? "bonjour@lacarotte.fr",
    senderName: process.env.BREVO_SENDER_NAME ?? "LaCarotte",
  },

  // SMS
  sms: {
    provider: process.env.SMS_PROVIDER ?? "ovh",
    apiKey: process.env.SMS_API_KEY ?? "",
    apiSecret: process.env.SMS_API_SECRET ?? "",
    sender: process.env.SMS_SENDER ?? "LaCarotte",
  },

  // Claude API
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  },

  // MCP Server
  server: {
    port: parseInt(process.env.MCP_SERVER_PORT ?? "3001", 10),
    transport: (process.env.MCP_TRANSPORT ?? "sse") as "sse" | "stdio",
    nodeEnv: process.env.NODE_ENV ?? "development",
  },

  // Pre-launch
  launch: {
    date: new Date(process.env.LAUNCH_DATE ?? "2026-03-21T08:00:00+01:00"),
  },

  // Cache TTLs (seconds)
  cache: {
    searchResultsTtl: 120,       // 2 minutes
    partnerInfoTtl: 600,         // 10 minutes
    labelsTtl: 3600,             // 1 hour
    categoriesTtl: 3600,         // 1 hour
    placesTtl: 1800,             // 30 minutes
    storeContextTtl: 900,        // 15 minutes
  },

  // Rate limiting defaults
  rateLimiting: {
    searchPerMinute: 10,
    transactionalPerMinute: 5,
    globalPerMinute: 20,
  },
} as const;

export type Config = typeof config;
export default config;
