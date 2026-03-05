/**
 * Tool MCP : add_to_basket
 * Ajout d'un produit au panier avec vérification de stock
 *
 * TRANSACTIONNEL — bloqué en pré-lancement.
 */

import { getLaCarotteClient } from "../../services/lacarotte-client.js";
import { AddToBasketInputSchema } from "../../schemas/cart.js";
import { checkPreLaunch, getLaunchInfo } from "../../middleware/pre-launch.js";
import { checkRateLimit } from "../../middleware/rate-limiter.js";
import { logAnalyticsEvent } from "../../middleware/analytics-logger.js";
import { getDb } from "../../db/client.js";
import config from "../../config/index.js";
import type { McpToolResponse } from "../../types/index.js";

const TOOL_NAME = "add_to_basket";

interface AddToBasketOutput {
  basket_id: string;
  added_product: {
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price_eur: number;
  };
  basket_total_eur: number;
  items_count: number;
}

export async function addToBasket(
  rawInput: unknown,
): Promise<McpToolResponse<AddToBasketOutput>> {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  // Rate limit
  const rateLimited = await checkRateLimit(TOOL_NAME);
  if (rateLimited) return rateLimited as McpToolResponse<AddToBasketOutput>;

  // Pre-launch — TRANSACTIONAL
  const preLaunch = checkPreLaunch(TOOL_NAME);
  if (preLaunch) return preLaunch as McpToolResponse<AddToBasketOutput>;

  // Validate input
  const parsed = AddToBasketInputSchema.safeParse(rawInput);
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
    const client = getLaCarotteClient();

    // Find basket
    const basket = await db
      .collection("mcpBaskets")
      .findOne({ _id: input.basket_id as any, tenantId });

    if (!basket) {
      return {
        status: "error",
        data: null,
        message: "Panier introuvable. Créez un nouveau panier d'abord.",
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
        message:
          basket.status === "ordered"
            ? "Ce panier a déjà été commandé."
            : "Ce panier a expiré. Créez un nouveau panier.",
        meta: {
          tenantId,
          timestamp: new Date().toISOString(),
          cache_hit: false,
          request_id: requestId,
        },
      };
    }

    // Fetch product info
    const product = await client.getProduct(input.product_id, tenantId);

    if (product.available === false || (product.stock !== undefined && product.stock <= 0)) {
      return {
        status: "out_of_stock",
        data: null,
        message: `${product.name} est actuellement en rupture de stock. Voulez-vous être alerté de son retour ?`,
        meta: {
          tenantId,
          timestamp: new Date().toISOString(),
          cache_hit: false,
          request_id: requestId,
        },
        suggestions: [
          "Demander une alerte stock",
          "Chercher un produit similaire",
        ],
      };
    }

    // Add item to basket
    const now = new Date();
    const price = product.referenceUnitGrossPrice ?? 0;
    const newItem = {
      productId: input.product_id,
      productName: product.name,
      producerName: null,
      partnerId: product.partnerId || null,
      quantity: input.quantity,
      priceAtCreation: price,
      unit: product.referenceUnit ?? "unité",
      addedBy: input.added_by ?? "Client",
      addedAt: now,
    };

    // Check if product already exists in basket — update quantity
    const items = basket.items as Array<{ productId: string; quantity: number; priceAtCreation: number }>;
    const existingIdx = items.findIndex(
      (item: { productId: string }) => item.productId === input.product_id,
    );

    if (existingIdx >= 0) {
      items[existingIdx].quantity += input.quantity;
    } else {
      items.push(newItem as typeof items[number]);
    }

    const totalEur = items.reduce(
      (sum: number, item: { priceAtCreation: number; quantity: number }) =>
        sum + item.priceAtCreation * item.quantity,
      0,
    );

    await db.collection("mcpBaskets").updateOne(
      { _id: input.basket_id as any },
      {
        $set: {
          items,
          totalEur: Math.round(totalEur * 100) / 100,
          updatedAt: now,
        },
      },
    );

    await logAnalyticsEvent(
      TOOL_NAME,
      "add_to_basket",
      {
        basket_id: input.basket_id,
        product_id: input.product_id,
        quantity: input.quantity,
      },
      Date.now() - startTime,
      tenantId,
    );

    return {
      status: "success",
      data: {
        basket_id: input.basket_id,
        added_product: {
          product_id: input.product_id,
          product_name: product.name,
          quantity: input.quantity,
          unit_price_eur: price,
        },
        basket_total_eur: Math.round(totalEur * 100) / 100,
        items_count: items.length,
      },
      message: `${product.name} ajouté au panier (${input.quantity} × ${price.toFixed(2)} €). Total : ${totalEur.toFixed(2)} €. Stock indicatif — disponibilité confirmée au moment du paiement.`,
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
      message: "Impossible d'ajouter le produit au panier. Veuillez réessayer.",
      meta: {
        tenantId,
        timestamp: new Date().toISOString(),
        cache_hit: false,
        request_id: requestId,
      },
    };
  }
}
