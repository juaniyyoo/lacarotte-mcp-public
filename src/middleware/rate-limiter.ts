/**
 * Rate limiter middleware
 * Utilise Upstash Redis pour le rate limiting distribué
 */

import config from "../config/index.js";
import type { McpToolResponse } from "../types/index.js";

// In-memory fallback when Redis is not configured
const inMemoryStore = new Map<string, { count: number; resetAt: number }>();

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const TOOL_LIMITS: Record<string, RateLimitConfig> = {
  search_products: {
    maxRequests: config.rateLimiting.searchPerMinute,
    windowMs: 60_000,
  },
  check_stock: { maxRequests: 60, windowMs: 60_000 },
  check_delivery_zone: { maxRequests: 30, windowMs: 60_000 },
  get_checkout_info: { maxRequests: 20, windowMs: 60_000 },
  create_basket: {
    maxRequests: config.rateLimiting.transactionalPerMinute,
    windowMs: 60_000,
  },
  add_to_basket: {
    maxRequests: config.rateLimiting.transactionalPerMinute,
    windowMs: 60_000,
  },
  remove_from_basket: {
    maxRequests: config.rateLimiting.transactionalPerMinute,
    windowMs: 60_000,
  },
  default: {
    maxRequests: config.rateLimiting.globalPerMinute,
    windowMs: 60_000,
  },
};

function getLimit(toolName: string): RateLimitConfig {
  return TOOL_LIMITS[toolName] ?? TOOL_LIMITS.default;
}

export async function checkRateLimit(
  toolName: string,
  sessionId?: string,
): Promise<McpToolResponse | null> {
  const key = `rl:${toolName}:${sessionId ?? "global"}`;
  const limit = getLimit(toolName);
  const now = Date.now();

  // In-memory fallback
  const entry = inMemoryStore.get(key);

  if (!entry || now >= entry.resetAt) {
    inMemoryStore.set(key, { count: 1, resetAt: now + limit.windowMs });
    return null;
  }

  if (entry.count >= limit.maxRequests) {
    const retryAfterMs = entry.resetAt - now;
    return {
      status: "rate_limited",
      data: null,
      message: `Trop de requêtes. Veuillez réessayer dans ${Math.ceil(retryAfterMs / 1000)} secondes.`,
      meta: {
        tenantId: config.lacarotte.defaultTenant,
        timestamp: new Date().toISOString(),
        cache_hit: false,
        request_id: crypto.randomUUID(),
      },
    };
  }

  entry.count++;
  return null;
}
