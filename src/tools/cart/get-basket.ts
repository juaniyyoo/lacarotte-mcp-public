/**
 * Tool MCP : get_basket
 * Consultation d'un panier (par propriétaire ou partage)
 */

import { GetBasketInputSchema } from "../../schemas/cart.js";
import { checkRateLimit } from "../../middleware/rate-limiter.js";
import { getDb } from "../../db/client.js";
import { getLaunchInfo } from "../../middleware/pre-launch.js";
import config from "../../config/index.js";
import type { McpToolResponse } from "../../types/index.js";

const TOOL_NAME = "get_basket";

interface GetBasketOutput {
  basket_id: string;
  label?: string;
  status: string;
  items: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price_eur: number;
    total_eur: number;
    unit: string;
    added_by: string;
  }>;
  total_eur: number;
  items_count: number;
  share_url: string;
  expires_at: string;
  is_owner: boolean;
}

export async function getBasket(
  rawInput: unknown,
): Promise<McpToolResponse<GetBasketOutput>> {
  const requestId = crypto.randomUUID();

  const rateLimited = await checkRateLimit(TOOL_NAME);
  if (rateLimited) return rateLimited as McpToolResponse<GetBasketOutput>;

  const parsed = GetBasketInputSchema.safeParse(rawInput);
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

    // Find by basket ID + validate access
    type BasketDoc = {
      _id: string;
      tenantId: string;
      label?: string;
      status: string;
      items: Array<{
        productId: string;
        productName: string;
        quantity: number;
        priceAtCreation: number;
        unit: string;
        addedBy: string;
      }>;
      totalEur: number;
      shareToken: string;
      ownerToken: string;
      expiresAt: Date;
    };

    const basket = (await db
      .collection("mcpBaskets")
      .findOne({ _id: input.basket_id as any, tenantId })) as BasketDoc | null;

    if (!basket) {
      return {
        status: "error",
        data: null,
        message: "Panier introuvable ou expiré.",
        meta: {
          tenantId,
          timestamp: new Date().toISOString(),
          cache_hit: false,
          request_id: requestId,
        },
      };
    }

    // Verify access (owner or share token)
    const isOwner = input.owner_token === basket.ownerToken;
    const hasShareAccess = input.share_token === basket.shareToken;

    if (!isOwner && !hasShareAccess) {
      return {
        status: "error",
        data: null,
        message:
          "Accès refusé. Utilisez le lien de partage ou votre token propriétaire.",
        meta: {
          tenantId,
          timestamp: new Date().toISOString(),
          cache_hit: false,
          request_id: requestId,
        },
      };
    }

    const items = basket.items.map((item) => ({
      product_id: item.productId,
      product_name: item.productName,
      quantity: item.quantity,
      unit_price_eur: item.priceAtCreation,
      total_eur: Math.round(item.priceAtCreation * item.quantity * 100) / 100,
      unit: item.unit,
      added_by: item.addedBy,
    }));

    return {
      status: "success",
      data: {
        basket_id: basket._id,
        label: basket.label,
        status: basket.status,
        items,
        total_eur: basket.totalEur,
        items_count: items.length,
        share_url: `https://app.la-carotte.fr/shared-basket/${basket.shareToken}`,
        expires_at: basket.expiresAt.toISOString(),
        is_owner: isOwner,
      },
      message: `Panier${basket.label ? ` "${basket.label}"` : ""} — ${items.length} article${items.length > 1 ? "s" : ""}, total : ${basket.totalEur.toFixed(2)} €`,
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
      message: "Impossible de récupérer le panier.",
      meta: {
        tenantId,
        timestamp: new Date().toISOString(),
        cache_hit: false,
        request_id: requestId,
      },
    };
  }
}
