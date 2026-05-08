/**
 * Tool MCP : get_product
 * Retourne toutes les informations d'un produit par son ID
 *
 * QUAND L'UTILISER : on connaît l'ID exact du produit et on veut ses détails complets.
 * CE QUE C'EST : fiche produit complète avec prix, unité, producteur, catégorie.
 * CE QUE CE N'EST PAS : une recherche. Utiliser search_products pour chercher.
 */

import { getLaCarotteClient, LaCarotteApiError } from "../../services/lacarotte-client.js";
import { getContractMaps } from "../../services/contract-cache.js";
import { getCategoryMaps } from "../../services/category-cache.js";
import { GetProductInputSchema } from "../../schemas/catalog.js";
import { checkPreLaunch, getLaunchInfo } from "../../middleware/pre-launch.js";
import { checkRateLimit } from "../../middleware/rate-limiter.js";
import { logAnalyticsEvent } from "../../middleware/analytics-logger.js";
import config from "../../config/index.js";
import type { McpToolResponse, GetProductOutput } from "../../types/index.js";

const TOOL_NAME = "get_product";

export async function getProduct(
  rawInput: unknown,
): Promise<McpToolResponse<GetProductOutput>> {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  const rateLimited = await checkRateLimit(TOOL_NAME);
  if (rateLimited) return rateLimited as McpToolResponse<GetProductOutput>;

  const preLaunch = checkPreLaunch(TOOL_NAME);
  if (preLaunch) return preLaunch as McpToolResponse<GetProductOutput>;

  const parsed = GetProductInputSchema.safeParse(rawInput);
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

    // Fetch product (fallback to list if direct fetch fails)
    let product;
    try {
      product = await client.getProduct(input.product_id, tenantId);
    } catch {
      product = null;
    }
    if (!product) {
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

    // Fetch partner info via contracts
    // Lien : Product → Contract (conditions[].productId) → Partner (Contract.partnerId)
    let partner: { id: string; name: string } | null = null;
    // Use logical id first (e.g. 'prod-miel-printemps-500g') — contracts use logical ids
    const productKey = product.id || product._id || "";
    // Fetch category info and partner info in parallel
    const [{ productToPartner }, categoryMaps] = await Promise.all([
      getContractMaps(tenantId),
      getCategoryMaps(tenantId).catch(() => new Map()),
    ]);

    try {
      const partnerId = productToPartner.get(productKey);
      if (partnerId) {
        try {
          const p = await client.getPartner(partnerId, tenantId);
          partner = {
            id: p._id || p.id || partnerId,
            name: p.name || p.companyName || (p as any).commercialName || "Producteur local",
          };
        } catch {
          partner = { id: partnerId, name: "Producteur local" };
        }
      }
    } catch {
      // contracts non accessibles — pas de partenaire
    }

    // Category enrichment
    const typeId = product.productType?.id;
    const catInfo = typeId ? categoryMaps.get(typeId) : undefined;
    const categoryDisplay = catInfo
      ? catInfo.categoryNames[0] ?? catInfo.typeName
      : (product.category || product.categoryId || "Non catégorisé");
    const typeDisplay = catInfo?.typeName ?? undefined;

    // Stock status
    let stockStatus: "available" | "low_stock" | "out_of_stock" = "available";
    if (product.available === false) {
      stockStatus = "out_of_stock";
    } else if (product.stock !== undefined) {
      if (product.stock <= 0) stockStatus = "out_of_stock";
      else if (product.stock <= 3) stockStatus = "low_stock";
    }

    await logAnalyticsEvent(
      TOOL_NAME,
      "get_product",
      { product_id: input.product_id },
      Date.now() - startTime,
      tenantId,
    );

    return {
      status: "success",
      data: {
        id: product.id || product._id || "",
        name: product.name,
        description: product.description,
        category: categoryDisplay,
        product_type: typeDisplay ? { name: typeDisplay } : undefined,
        partner,
        price_eur: product.referenceUnitGrossPrice ?? 0,
        vat_pct: product.VAT ?? 5.5,
        unit: product.referenceUnit ?? "unité",
        stock_status: stockStatus,
        labels: (product.labels || []) as string[],
        allergens: product.allergens,
        ingredients: product.ingredients,
        image_url: product.photos?.[0]?.url,
      },
      message: `Fiche produit : ${product.name}`,
      meta: {
        tenantId,
        timestamp: new Date().toISOString(),
        cache_hit: false,
        request_id: requestId,
      },
    };
  } catch (error) {
    const message =
      error instanceof LaCarotteApiError && error.statusCode === 404
        ? "Ce produit n'existe pas ou a été retiré du catalogue."
        : "Impossible de récupérer ce produit. Veuillez réessayer.";

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
      },
    };
  }
}
