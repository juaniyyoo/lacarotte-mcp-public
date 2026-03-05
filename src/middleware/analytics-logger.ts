/**
 * Analytics logger middleware
 * Trace chaque appel de tool dans mcpAnalyticsEvents
 */

import { getDb } from "../db/client.js";
import config from "../config/index.js";

export async function logAnalyticsEvent(
  toolName: string,
  eventType: string,
  payload: Record<string, unknown>,
  responseTimeMs: number,
  tenantId?: string,
  sessionFingerprint?: string,
): Promise<void> {
  try {
    const db = getDb();
    await db.collection("mcpAnalyticsEvents").insertOne({
      _id: crypto.randomUUID() as any,
      tenantId: tenantId ?? config.lacarotte.defaultTenant,
      eventType,
      toolName,
      sessionFingerprint,
      payload,
      responseTimeMs,
      createdAt: new Date(),
    });
  } catch {
    // Analytics logging should never break tool execution
    console.error("[MCP Analytics] Failed to log event");
  }
}
