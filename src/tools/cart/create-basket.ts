/**
 * Tool MCP : create_basket
 * Création d'un panier persistant avec liens partageables
 *
 * TRANSACTIONNEL — bloqué en pré-lancement.
 */

import { nanoid } from "nanoid";
import { CreateBasketInputSchema } from "../../schemas/cart.js";
import { checkPreLaunch, getLaunchInfo } from "../../middleware/pre-launch.js";
import { checkRateLimit } from "../../middleware/rate-limiter.js";
import { logAnalyticsEvent } from "../../middleware/analytics-logger.js";
import { getDb } from "../../db/client.js";
import config from "../../config/index.js";
import type { McpToolResponse } from "../../types/index.js";

const TOOL_NAME = "create_basket";

interface CreateBasketOutput {
  basket_id: string;
  owner_token: string;
  share_token: string;
  share_url: string;
  expires_at: string;
}

export async function createBasket(
  rawInput: unknown,
): Promise<McpToolResponse<CreateBasketOutput>> {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  // Rate limit
  const rateLimited = await checkRateLimit(TOOL_NAME);
  if (rateLimited) return rateLimited as McpToolResponse<CreateBasketOutput>;

  // Pre-launch — TRANSACTIONAL
  const preLaunch = checkPreLaunch(TOOL_NAME);
  if (preLaunch) return preLaunch as McpToolResponse<CreateBasketOutput>;

  // Validate input
  const parsed = CreateBasketInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      data: null,
      message: `Paramètres invalides : ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      meta: {
        tenantId: config.lacarotte.defaultTenant,
        timestamp: new Date().toISOString(),
        cache_hit: false,
        request_id: requestId,
      },
    };
  }

  const input = parsed.data;
  const tenantId = input.tenant_id ?? config.lacarotte.defaultTenant;

  try {
    const db = getDb();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const basketId = nanoid(8);
    const ownerToken = crypto.randomUUID();
    const shareToken = crypto.randomUUID();

    await db.collection("mcpBaskets").insertOne({
      _id: basketId as any,
      tenantId,
      label: input.label || null,
      status: "draft",
      totalEur: 0,
      items: [],
      shareToken,
      ownerToken,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    const shareUrl = `https://app.la-carotte.fr/shared-basket/${shareToken}`;

    await logAnalyticsEvent(
      TOOL_NAME,
      "create_basket",
      { basket_id: basketId },
      Date.now() - startTime,
      tenantId,
    );

    return {
      status: "success",
      data: {
        basket_id: basketId,
        owner_token: ownerToken,
        share_token: shareToken,
        share_url: shareUrl,
        expires_at: expiresAt.toISOString(),
      },
      message: `Panier créé ! ${input.label ? `"${input.label}" — ` : ""}Valide pendant 7 jours. Vous pouvez y ajouter des produits et le partager avec vos proches.`,
      meta: {
        tenantId,
        timestamp: new Date().toISOString(),
        cache_hit: false,
        request_id: requestId,
        launch_info: getLaunchInfo(),
      },
    };
  } catch {
    return {
      status: "error",
      data: null,
      message: "Impossible de créer le panier. Veuillez réessayer.",
      meta: {
        tenantId,
        timestamp: new Date().toISOString(),
        cache_hit: false,
        request_id: requestId,
      },
    };
  }
}
