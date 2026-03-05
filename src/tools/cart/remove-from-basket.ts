/**
 * Tool MCP : remove_from_basket
 * Retrait d'un produit du panier
 *
 * TRANSACTIONNEL — bloqué en pré-lancement.
 */

import { RemoveFromBasketInputSchema } from "../../schemas/cart.js";
import { checkPreLaunch, getLaunchInfo } from "../../middleware/pre-launch.js";
import { checkRateLimit } from "../../middleware/rate-limiter.js";
import { logAnalyticsEvent } from "../../middleware/analytics-logger.js";
import { getDb } from "../../db/client.js";
import config from "../../config/index.js";
import type { McpToolResponse } from "../../types/index.js";

const TOOL_NAME = "remove_from_basket";

interface RemoveFromBasketOutput {
  basket_id: string;
  removed_product_id: string;
  basket_total_eur: number;
  items_count: number;
}

export async function removeFromBasket(
  rawInput: unknown,
): Promise<McpToolResponse<RemoveFromBasketOutput>> {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  const rateLimited = await checkRateLimit(TOOL_NAME);
  if (rateLimited) return rateLimited as McpToolResponse<RemoveFromBasketOutput>;

  const preLaunch = checkPreLaunch(TOOL_NAME);
  if (preLaunch) return preLaunch as McpToolResponse<RemoveFromBasketOutput>;

  const parsed = RemoveFromBasketInputSchema.safeParse(rawInput);
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

    type BasketDoc = {
      _id: string;
      status: string;
      ownerToken: string;
      items: Array<{
        productId: string;
        productName: string;
        quantity: number;
        priceAtCreation: number;
      }>;
    };

    const basket = (await db
      .collection("mcpBaskets")
      .findOne({ _id: input.basket_id as any, tenantId })) as BasketDoc | null;

    if (!basket) {
      return {
        status: "error",
        data: null,
        message: "Panier introuvable.",
        meta: {
          tenantId,
          timestamp: new Date().toISOString(),
          cache_hit: false,
          request_id: requestId,
        },
      };
    }

    // Verify ownership
    if (basket.ownerToken !== input.owner_token) {
      return {
        status: "error",
        data: null,
        message:
          "Seul le propriétaire du panier peut retirer des produits.",
        meta: {
          tenantId,
          timestamp: new Date().toISOString(),
          cache_hit: false,
          request_id: requestId,
        },
      };
    }

    if (basket.status !== "draft") {
      return {
        status: "error",
        data: null,
        message: "Ce panier ne peut plus être modifié.",
        meta: {
          tenantId,
          timestamp: new Date().toISOString(),
          cache_hit: false,
          request_id: requestId,
        },
      };
    }

    // Remove item
    const newItems = basket.items.filter(
      (item) => item.productId !== input.product_id,
    );

    if (newItems.length === basket.items.length) {
      return {
        status: "error",
        data: null,
        message: "Ce produit n'est pas dans le panier.",
        meta: {
          tenantId,
          timestamp: new Date().toISOString(),
          cache_hit: false,
          request_id: requestId,
        },
      };
    }

    const totalEur = newItems.reduce(
      (sum, item) => sum + item.priceAtCreation * item.quantity,
      0,
    );

    await db.collection("mcpBaskets").updateOne(
      { _id: input.basket_id as any },
      {
        $set: {
          items: newItems,
          totalEur: Math.round(totalEur * 100) / 100,
          updatedAt: new Date(),
        },
      },
    );

    await logAnalyticsEvent(
      TOOL_NAME,
      "remove_from_basket",
      { basket_id: input.basket_id, product_id: input.product_id },
      Date.now() - startTime,
      tenantId,
    );

    return {
      status: "success",
      data: {
        basket_id: input.basket_id,
        removed_product_id: input.product_id,
        basket_total_eur: Math.round(totalEur * 100) / 100,
        items_count: newItems.length,
      },
      message: `Produit retiré du panier. ${newItems.length > 0 ? `Nouveau total : ${totalEur.toFixed(2)} €` : "Le panier est maintenant vide."}`,
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
      message: "Impossible de retirer le produit. Veuillez réessayer.",
      meta: {
        tenantId,
        timestamp: new Date().toISOString(),
        cache_hit: false,
        request_id: requestId,
      },
    };
  }
}
