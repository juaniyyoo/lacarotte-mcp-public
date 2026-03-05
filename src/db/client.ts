/**
 * Client MongoDB pour les collections MCP
 * Cohérent avec lacarotte-db
 */

import { MongoClient, type Db } from "mongodb";
import config from "../config/index.js";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDb(): Promise<Db> {
  if (db) return db;

  client = new MongoClient(config.mongodb.uri);
  await client.connect();
  db = client.db(config.mongodb.dbName);

  // Create indexes for MCP collections
  await ensureIndexes(db);

  console.log(`[MCP DB] Connected to MongoDB: ${config.mongodb.dbName}`);
  return db;
}

export function getDb(): Db {
  if (!db) {
    throw new Error("Database not connected. Call connectDb() first.");
  }
  return db;
}

export async function disconnectDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log("[MCP DB] Disconnected from MongoDB");
  }
}

async function ensureIndexes(database: Db): Promise<void> {
  // mcpAnalyticsEvents
  const analyticsCollection = database.collection("mcpAnalyticsEvents");
  await analyticsCollection.createIndex(
    { tenantId: 1, createdAt: -1 },
    { background: true },
  );
  await analyticsCollection.createIndex(
    { eventType: 1, createdAt: -1 },
    { background: true },
  );
  await analyticsCollection.createIndex(
    { tenantId: 1, eventType: 1, createdAt: -1 },
    { background: true },
  );
  // TTL: 24 months
  await analyticsCollection.createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: 63072000, background: true },
  );

  // mcpBaskets
  const basketsCollection = database.collection("mcpBaskets");
  await basketsCollection.createIndex(
    { tenantId: 1, status: 1 },
    { background: true },
  );
  await basketsCollection.createIndex(
    { shareToken: 1 },
    { unique: true, background: true },
  );
  await basketsCollection.createIndex(
    { ownerToken: 1 },
    { unique: true, background: true },
  );
  await basketsCollection.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, background: true },
  );

  // mcpStockAlerts
  const alertsCollection = database.collection("mcpStockAlerts");
  await alertsCollection.createIndex(
    { tenantId: 1, productId: 1, status: 1 },
    { background: true },
  );

  // mcpClientPreferences
  const prefsCollection = database.collection("mcpClientPreferences");
  await prefsCollection.createIndex(
    { tenantId: 1, userId: 1 },
    { unique: true, background: true },
  );

  // mcpBasketShares
  const sharesCollection = database.collection("mcpBasketShares");
  await sharesCollection.createIndex(
    { tenantId: 1, basketId: 1, recipient: 1 },
    { unique: true, background: true },
  );

  // mcpSubscriptions
  const subsCollection = database.collection("mcpSubscriptions");
  await subsCollection.createIndex(
    { tenantId: 1, userId: 1 },
    { background: true },
  );
  await subsCollection.createIndex(
    { status: 1, nextGenerationAt: 1 },
    { background: true },
  );

  console.log("[MCP DB] Indexes ensured");
}
