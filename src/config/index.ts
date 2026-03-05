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
  // API LaCarotte
  lacarotte: {
    apiUrl: requireEnv("LACAROTTE_API_URL", "http://localhost:3200"),
    privateKey: requireEnv("LACAROTTE_PRIVATE_KEY", ""),
    defaultTenant: requireEnv("LACAROTTE_DEFAULT_TENANT", ".fr.la-carotte"),
    serverClientId: requireEnv("LACAROTTE_SERVER_CLIENT_ID", "lacarotte-mcp"),
  },

  // MongoDB
  mongodb: {
    uri: requireEnv("MONGODB_URI", "mongodb://localhost:27017"),
    dbName: requireEnv("MONGODB_DB_NAME", "lacarotte"),
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
    searchPerMinute: 30,
    transactionalPerMinute: 10,
    globalPerMinute: 60,
  },
} as const;

export type Config = typeof config;
export default config;
