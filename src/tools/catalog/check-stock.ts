/**
 * Tool MCP : check_stock
 * Vérification du stock en temps réel pour un produit
 *
 * QUAND L'UTILISER : le client demande si un produit précis est en stock,
 *   ou veut connaître la quantité disponible.
 * CE QUE C'EST : vérification temps réel du stock.
 * CE QUE CE N'EST PAS : une recherche de produit, ni une réservation.
 */

import { getLaCarotteClient, LaCarotteApiError } from "../../services/lacarotte-client.js";
import { CheckStockInputSchema } from "../../schemas/catalog.js";
import { checkPreLaunch, getLaunchInfo } from "../../middleware/pre-launch.js";
import { checkRateLimit } from "../../middleware/rate-limiter.js";
import { logAnalyticsEvent } from "../../middleware/analytics-logger.js";
import config from "../../config/index.js";
import type { McpToolResponse, CheckStockOutput } from "../../types/index.js";

const TOOL_NAME = "check_stock";

export async function checkStock(
  rawInput: unknown,
): Promise<McpToolResponse<CheckStockOutput>> {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  // Rate limit
  const rateLimited = await checkRateLimit(TOOL_NAME);
  if (rateLimited) return rateLimited as McpToolResponse<CheckStockOutput>;

  // Pre-launch (consultation tool — passes through)
  const preLaunch = checkPreLaunch(TOOL_NAME);
  if (preLaunch) return preLaunch as McpToolResponse<CheckStockOutput>;

  // Validate input
  const parsed = CheckStockInputSchema.safeParse(rawInput);
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
    const client = getLaCarotteClient();

    // Fetch product info (API getProduct by ID may return null due to id/_id mismatch,
    // so fall back to fetching all products and finding by ID)
    let product;
    try {
      product = await client.getProduct(input.product_id, tenantId);
    } catch {
      product = null;
    }

    if (!product) {
      // Fallback: fetch all products and find by ID
      const allProducts = await client.getProducts(undefined, tenantId);
      product = allProducts.find(
        (p) => p._id === input.product_id || p.id === input.product_id,
      );
    }

    if (!product) {
      return {
        status: "error",
        data: null,
        message: "Ce produit n'existe pas ou a été retiré du catalogue.",
        meta: {
          tenantId,
          timestamp: new Date().toISOString(),
          cache_hit: false,
          request_id: requestId,
        },
      };
    }

    // Determine stock status
    let availableQuantity = 0;
    let status: "available" | "low_stock" | "out_of_stock" = "available";

    if (product.stock !== undefined) {
      availableQuantity = product.stock;
    } else if (product.available === false) {
      availableQuantity = 0;
    } else {
      // Try productionStocks endpoint
      try {
        const stocks = await client.getProductionStocks(
          { productId: input.product_id },
          tenantId,
        );
        if (stocks && stocks.length > 0) {
          availableQuantity = stocks.reduce(
            (sum, s) => sum + (s.quantity ?? 0),
            0,
          );
        }
      } catch {
        // If productionStocks not available, assume available
        availableQuantity = -1; // unknown
      }
    }

    if (availableQuantity === 0) {
      status = "out_of_stock";
    } else if (availableQuantity > 0 && availableQuantity <= 3) {
      status = "low_stock";
    } else {
      status = "available";
    }

    // Check if requested quantity exceeds available
    if (
      status !== "out_of_stock" &&
      availableQuantity > 0 &&
      input.quantity > availableQuantity
    ) {
      status = "out_of_stock";
    }

    // If out of stock, find alternatives
    let alternatives: CheckStockOutput["alternatives"] = undefined;
    if (status === "out_of_stock") {
      try {
        const category = product.category || product.categoryId;
        if (category) {
          const allProducts = await client.getProducts(undefined, tenantId);
          const catLower = category.toLowerCase();
          alternatives = allProducts
            .filter((p) =>
              p._id !== input.product_id &&
              p.available !== false &&
              ((p.category || p.categoryId || "").toLowerCase() === catLower)
            )
            .slice(0, 3)
            .map((p) => ({
              id: p._id || p.id || "",
              name: p.name,
              price_eur: p.referenceUnitGrossPrice ?? 0,
              producer_name: "Producteur local",
            }));
        }
      } catch {
        // Alternatives are best-effort
      }
    }

    const productName = product.name || "Produit";

    let message: string;
    switch (status) {
      case "available":
        message =
          availableQuantity > 0
            ? `${productName} est disponible (${availableQuantity} en stock). Stock indicatif — disponibilité confirmée au moment du paiement.`
            : `${productName} est disponible. Stock indicatif — disponibilité confirmée au moment du paiement.`;
        break;
      case "low_stock":
        message = `${productName} — stock limité (${availableQuantity} restant${availableQuantity > 1 ? "s" : ""}). Commandez vite ! Stock indicatif — disponibilité confirmée au moment du paiement.`;
        break;
      case "out_of_stock":
        message = `${productName} est actuellement en rupture de stock.${alternatives && alternatives.length > 0 ? " Voici quelques alternatives dans la même catégorie." : " Vous pouvez demander une alerte pour être prévenu de son retour."}`;
        break;
    }

    await logAnalyticsEvent(
      TOOL_NAME,
      "check_stock",
      { product_id: input.product_id, status, quantity: input.quantity },
      Date.now() - startTime,
      tenantId,
    );

    return {
      status: status === "out_of_stock" ? "out_of_stock" : "success",
      data: {
        product_id: input.product_id,
        product_name: productName,
        available_quantity: Math.max(0, availableQuantity),
        status,
        alternatives,
      },
      message,
      meta: {
        tenantId,
        timestamp: new Date().toISOString(),
        cache_hit: false,
        request_id: requestId,
        launch_info: getLaunchInfo(),
      },
      suggestions:
        status === "out_of_stock"
          ? [
              "Demander une alerte stock pour ce produit",
              "Chercher un produit similaire",
            ]
          : undefined,
    };
  } catch (error) {
    const message =
      error instanceof LaCarotteApiError && error.statusCode === 404
        ? "Ce produit n'existe pas ou a été retiré du catalogue."
        : "Impossible de vérifier le stock actuellement. Veuillez réessayer.";

    await logAnalyticsEvent(
      TOOL_NAME,
      "tool_error",
      { product_id: input.product_id, error: String(error) },
      Date.now() - startTime,
      tenantId,
    );

    return {
      status: "error",
      data: null,
      message,
      meta: {
        tenantId,
        timestamp: new Date().toISOString(),
        cache_hit: false,
        request_id: requestId,
        launch_info: getLaunchInfo(),
      },
    };
  }
}
