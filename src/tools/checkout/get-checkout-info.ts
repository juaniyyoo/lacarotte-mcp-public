/**
 * Tool MCP : get_checkout_info
 * Informations de checkout pour un panier (lecture seule)
 *
 * QUAND L'UTILISER : le client demande un récapitulatif avant paiement,
 *   ou veut connaître le total de son panier.
 * CE QUE C'EST : récapitulatif du panier avec options de livraison et URL de paiement.
 * CE QUE CE N'EST PAS : une action de paiement. Ne déclenche aucune transaction.
 */

import { getLaCarotteClient, LaCarotteApiError } from "../../services/lacarotte-client.js";
import { GetCheckoutInfoInputSchema } from "../../schemas/catalog.js";
import { checkPreLaunch, getLaunchInfo } from "../../middleware/pre-launch.js";
import { checkRateLimit } from "../../middleware/rate-limiter.js";
import { logAnalyticsEvent } from "../../middleware/analytics-logger.js";
import { getDb } from "../../db/client.js";
import config from "../../config/index.js";
import type {
  McpToolResponse,
  CheckoutInfoOutput,
} from "../../types/index.js";

const TOOL_NAME = "get_checkout_info";

export async function getCheckoutInfo(
  rawInput: unknown,
): Promise<McpToolResponse<CheckoutInfoOutput>> {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  // Rate limit
  const rateLimited = await checkRateLimit(TOOL_NAME);
  if (rateLimited) return rateLimited as McpToolResponse<CheckoutInfoOutput>;

  // Pre-launch
  const preLaunch = checkPreLaunch(TOOL_NAME);
  if (preLaunch) return preLaunch as McpToolResponse<CheckoutInfoOutput>;

  // Validate input
  const parsed = GetCheckoutInfoInputSchema.safeParse(rawInput);
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
    // First check in MCP baskets (local management)
    const db = getDb();
    const mcpBasket = await db
      .collection("mcpBaskets")
      .findOne({ _id: input.basket_id as any, tenantId });

    if (!mcpBasket) {
      // Try LaCarotte API cart/command
      try {
        const client = getLaCarotteClient();
        const command = await client.getCommand(input.basket_id, tenantId);

        const items = (command.items || []).map((item) => ({
          product_id: item.productId,
          product_name: item.productId, // Would need product lookup for name
          quantity: item.quantity,
          unit_price_eur: item.price ?? 0,
          total_eur: (item.price ?? 0) * item.quantity,
        }));

        const subtotal = items.reduce((sum, item) => sum + item.total_eur, 0);

        return {
          status: "success",
          data: {
            basket_id: input.basket_id,
            items,
            subtotal_eur: subtotal,
            delivery_options: [],
            app_checkout_url: `https://shop.la-carotte.fr/cart/payment?commandId=${input.basket_id}`,
          },
          message: `Votre panier contient ${items.length} article${items.length > 1 ? "s" : ""} pour un total de ${subtotal.toFixed(2)} €. Finalisez votre commande sur l'application LaCarotte.`,
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
          message:
            "Ce panier n'existe pas ou a expiré. Créez un nouveau panier pour commencer vos courses.",
          meta: {
            tenantId,
            timestamp: new Date().toISOString(),
            cache_hit: false,
            request_id: requestId,
          },
        };
      }
    }

    // MCP basket found
    const basket = mcpBasket as unknown as {
      _id: string;
      items: Array<{
        productId: string;
        productName: string;
        quantity: number;
        priceAtCreation: number;
        unit: string;
      }>;
      totalEur: number;
      status: string;
    };

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

    const items = basket.items.map((item) => ({
      product_id: item.productId,
      product_name: item.productName,
      quantity: item.quantity,
      unit_price_eur: item.priceAtCreation,
      total_eur: item.priceAtCreation * item.quantity,
    }));

    const subtotal = items.reduce((sum, item) => sum + item.total_eur, 0);

    // Fetch delivery options
    let deliveryOptions: CheckoutInfoOutput["delivery_options"] = [];
    try {
      const client = getLaCarotteClient();
      const places = await client.getPlaces(undefined, tenantId);
      deliveryOptions = places.slice(0, 5).map((place) => ({
        place_id: place._id || place.id || "",
        name: place.name,
        type: place.type || "retrait",
        address: place.address,
        city: place.city,
      }));
    } catch {
      // Delivery options are best-effort
    }

    await logAnalyticsEvent(
      TOOL_NAME,
      "checkout_info",
      { basket_id: input.basket_id, items_count: items.length, subtotal },
      Date.now() - startTime,
      tenantId,
    );

    return {
      status: "success",
      data: {
        basket_id: input.basket_id,
        items,
        subtotal_eur: Math.round(subtotal * 100) / 100,
        delivery_options: deliveryOptions,
        app_checkout_url: `https://shop.la-carotte.fr/cart/payment?basketId=${input.basket_id}`,
      },
      message: `Votre panier contient ${items.length} article${items.length > 1 ? "s" : ""} pour un total de ${subtotal.toFixed(2)} €. Pour finaliser votre commande, rendez-vous sur l'application LaCarotte.`,
      meta: {
        tenantId,
        timestamp: new Date().toISOString(),
        cache_hit: false,
        request_id: requestId,
        launch_info: getLaunchInfo(),
      },
    };
  } catch (error) {
    const message =
      error instanceof LaCarotteApiError
        ? "Impossible de récupérer les informations du panier."
        : "Une erreur est survenue.";

    return {
      status: "error",
      data: null,
      message,
      meta: {
        tenantId,
        timestamp: new Date().toISOString(),
        cache_hit: false,
        request_id: requestId,
      },
    };
  }
}
