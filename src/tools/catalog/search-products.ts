/**
 * Tool MCP : search_products
 * Recherche enrichie dans le catalogue LaCarotte
 *
 * QUAND L'UTILISER : l'utilisateur cherche des produits, mentionne une catégorie,
 *   un producteur, ou demande ce qui est disponible.
 * CE QUE C'EST : recherche dans le catalogue avec enrichissement sémantique.
 * CE QUE CE N'EST PAS : une vérification de stock précise, ni une commande.
 */

import { getLaCarotteClient, LaCarotteApiError } from "../../services/lacarotte-client.js";
import { getContractMaps } from "../../services/contract-cache.js";
import { getCategoryMaps } from "../../services/category-cache.js";
import { SearchProductsInputSchema } from "../../schemas/catalog.js";
import { checkPreLaunch, getLaunchInfo } from "../../middleware/pre-launch.js";
import { checkRateLimit } from "../../middleware/rate-limiter.js";
import { logAnalyticsEvent } from "../../middleware/analytics-logger.js";
import config from "../../config/index.js";
import { getTenantConfig } from "../../config/tenants.js";
import type {
  McpToolResponse,
  SearchProductsOutput,
  SearchProductResult,
  LaCarotteProduct,
  LaCarottePartner,
} from "../../types/index.js";

const TOOL_NAME = "search_products";
const STOCK_NOTE = "Stock indicatif — disponibilité confirmée au moment du paiement.";

// Simple in-memory cache for partner info
const partnerCache = new Map<
  string,
  { data: LaCarottePartner; expiresAt: number }
>();

// Simple in-memory cache for labels
let labelsCache: { data: Array<{ _id: string; name: string }>; expiresAt: number } | null = null;

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

async function getPartnerCached(partnerId: string, tenantId?: string): Promise<LaCarottePartner | null> {
  const now = Date.now();
  const cached = partnerCache.get(partnerId);
  if (cached && now < cached.expiresAt) {
    return cached.data;
  }

  try {
    const client = getLaCarotteClient();
    const partner = await client.getPartner(partnerId, tenantId);
    partnerCache.set(partnerId, {
      data: partner,
      expiresAt: now + config.cache.partnerInfoTtl * 1000,
    });
    return partner;
  } catch {
    return null;
  }
}

async function getLabelsCached(tenantId?: string): Promise<Array<{ _id: string; name: string }>> {
  const now = Date.now();
  if (labelsCache && now < labelsCache.expiresAt) {
    return labelsCache.data;
  }

  try {
    const client = getLaCarotteClient();
    const labels = await client.getLabels(tenantId);
    labelsCache = {
      data: labels.map((l) => ({ _id: l._id, name: l.name })),
      expiresAt: now + config.cache.labelsTtl * 1000,
    };
    return labelsCache.data;
  } catch {
    return [];
  }
}

function inferStockStatus(
  product: LaCarotteProduct,
): "available" | "low_stock" | "out_of_stock" {
  if (product.available === false) return "out_of_stock";
  if (product.stock !== undefined) {
    if (product.stock <= 0) return "out_of_stock";
    if (product.stock <= 3) return "low_stock";
  }
  return "available";
}

export async function searchProducts(
  rawInput: unknown,
): Promise<McpToolResponse<SearchProductsOutput>> {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  // Rate limit check
  const rateLimited = await checkRateLimit(TOOL_NAME);
  if (rateLimited) return rateLimited as McpToolResponse<SearchProductsOutput>;

  // Pre-launch check
  const preLaunch = checkPreLaunch(TOOL_NAME);
  if (preLaunch) return preLaunch as McpToolResponse<SearchProductsOutput>;

  // Validate input
  const parsed = SearchProductsInputSchema.safeParse(rawInput);
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
        launch_info: getLaunchInfo(),
      },
    };
  }

  const input = parsed.data;
  const tenantId = input.tenant_id ?? config.lacarotte.defaultTenant;

  try {
    const client = getLaCarotteClient();

    // Fetch ALL products from LaCarotte API (API doesn't support server-side filtering)
    const allProducts = await client.getProducts(undefined, tenantId);

    // Client-side filtering (non-producer filters first)
    let filtered = allProducts;

    if (input.query) {
      const q = input.query.toLowerCase();
      filtered = filtered.filter((p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
      );
    }

    if (input.category) {
      const cat = input.category.toLowerCase();
      // Charge les maps de catégories pour filtrer sur les vrais noms
      const categoryMaps = await getCategoryMaps(tenantId).catch(() => new Map());
      filtered = filtered.filter((p) => {
        const typeId = p.productType?.id;
        if (typeId) {
          const info = categoryMaps.get(typeId);
          if (info) {
            return info.allNames.some((n: string) => n.toLowerCase().includes(cat));
          }
        }
        // Fallback sur les champs legacy si présents
        return (
          (p.categoryId || "").toLowerCase().includes(cat) ||
          (p.category || "").toLowerCase().includes(cat)
        );
      });
    }

    if (input.label) {
      const lbl = input.label.toLowerCase();
      filtered = filtered.filter((p) => {
        const productLabels = (p.labels ?? []) as string[];
        return productLabels.some((l) => l.toLowerCase().includes(lbl));
      });
    }

    if (input.price_max_eur) {
      filtered = filtered.filter((p) => {
        const price = p.referenceUnitGrossPrice ?? 0;
        return price <= input.price_max_eur!;
      });
    }

    // Fetch labels for enrichment
    const labels = await getLabelsCached(tenantId);
    const labelMap = new Map(labels.map((l) => [l._id, l.name]));

    // Get tenant config for distance calculation
    let tenantCoords: { lat: number; lng: number } | undefined;
    try {
      const tenantConfig = getTenantConfig(tenantId);
      tenantCoords = tenantConfig.coordinates;
    } catch {
      // Unknown tenant — skip distance
    }

    // Build product→partner map via contracts
    // Lien réel : Product → Contract (conditions[].productId) → Partner (Contract.partnerId)
    // Note: contracts use logical ids (e.g. 'prod-miel-500g'), not MongoDB ObjectIds
    const [{ productToPartner }, categoryMaps] = await Promise.all([
      getContractMaps(tenantId),
      getCategoryMaps(tenantId).catch(() => new Map()),
    ]);

    // Enrich ALL filtered products with partner info
    const uniquePartnerIds = [...new Set(
      filtered.map((p) => productToPartner.get(p.id || p._id || "")).filter(Boolean) as string[],
    )];
    const partnerPromises = uniquePartnerIds.map((pid) =>
      getPartnerCached(pid, tenantId),
    );
    const partners = await Promise.all(partnerPromises);
    const partnerMap = new Map<string, LaCarottePartner>();
    partners.forEach((p, i) => {
      if (p) partnerMap.set(uniquePartnerIds[i], p);
    });

    // Filter by producer name (uses enriched partner data for accurate matching)
    if (input.producer) {
      const producerLower = input.producer.toLowerCase();
      filtered = filtered.filter((p) => {
        const partnerId = productToPartner.get(p.id || p._id || "");
        if (!partnerId) return false;
        const partner = partnerMap.get(partnerId);
        if (!partner) return false;
        const name = (partner.name || partner.companyName || partner.commercialName || "").toLowerCase();
        return name.includes(producerLower);
      });
    }

    // Pagination (after all filters applied)
    const totalResults = filtered.length;
    const totalPages = Math.ceil(totalResults / input.per_page) || 1;
    const start = (input.page - 1) * input.per_page;
    const paginatedProducts = filtered.slice(start, start + input.per_page);

    if (totalResults === 0) {
      await logAnalyticsEvent(TOOL_NAME, "search", { input, results: 0 }, Date.now() - startTime, tenantId);

      return {
        status: "empty",
        data: { products: [], total_results: 0, page: input.page, total_pages: 0 },
        message: input.query
          ? `Aucun produit trouvé pour "${input.query}". Essayez avec d'autres termes ou explorez nos catégories.`
          : "Aucun produit trouvé avec ces critères.",
        meta: {
          tenantId,
          timestamp: new Date().toISOString(),
          cache_hit: false,
          request_id: requestId,
          launch_info: getLaunchInfo(),
        },
        suggestions: [
          "Essayez une recherche plus large",
          "Consultez les catégories disponibles",
          "Demandez les produits de saison",
        ],
      };
    }

    // Map to output format
    const enriched: SearchProductResult[] = paginatedProducts.map((product) => {
      const partnerId = productToPartner.get(product.id || product._id || "");
      const partner = partnerId ? partnerMap.get(partnerId) : null;

      let distanceKm: number | undefined;
      if (tenantCoords && partner?.coordinates) {
        distanceKm = haversineKm(
          tenantCoords.lat,
          tenantCoords.lng,
          partner.coordinates.lat,
          partner.coordinates.lng,
        );
      }

      const productLabels = (product.labels || [])
        .map((lid) => labelMap.get(lid) ?? lid)
        .filter(Boolean) as string[];

      const typeId = product.productType?.id;
      const catInfo = typeId ? categoryMaps.get(typeId) : undefined;
      const categoryDisplay = catInfo
        ? catInfo.categoryNames[0] ?? catInfo.typeName
        : (product.category || product.categoryId || "Non catégorisé");
      const typeDisplay = catInfo?.typeName ?? product.productType?.id ?? undefined;

      return {
        id: product.id || product._id || "",
        name: product.name,
        description: product.description,
        category: categoryDisplay,
        product_type: typeDisplay ? { name: typeDisplay } : undefined,
        producer: {
          id: partner?._id || partner?.id || partnerId || "",
          name: partner?.name || partner?.companyName || (partner as any)?.commercialName || "Producteur local",
          locality: partner?.city || partner?.locality,
          distance_km: distanceKm,
          certifications: (partner?.certifications || partner?.labels || []) as string[],
        },
        price_eur: product.referenceUnitGrossPrice ?? 0,
        vat_pct: product.VAT ?? 5.5,
        unit: product.referenceUnit ?? "unité",
        stock_status: inferStockStatus(product),
        stock_note: STOCK_NOTE,
        labels: productLabels,
        allergens: product.allergens,
        ingredients: product.ingredients,
        image_url: product.photos?.[0]?.url,
      };
    });

    // Sort
    const sorted = sortProducts(enriched, input.sort_by);

    await logAnalyticsEvent(
      TOOL_NAME,
      "search",
      { input, results: totalResults },
      Date.now() - startTime,
      tenantId,
    );

    return {
      status: "success",
      data: {
        products: sorted,
        total_results: totalResults,
        page: input.page,
        total_pages: totalPages,
      },
      message: `${totalResults} produit${totalResults > 1 ? "s" : ""} trouvé${totalResults > 1 ? "s" : ""}.`,
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
        ? "Le service est temporairement indisponible. Veuillez réessayer dans quelques instants."
        : "Une erreur inattendue s'est produite lors de la recherche.";

    await logAnalyticsEvent(
      TOOL_NAME,
      "tool_error",
      { input, error: String(error) },
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

function sortProducts(
  products: SearchProductResult[],
  sortBy: string,
): SearchProductResult[] {
  switch (sortBy) {
    case "prix_asc":
      return [...products].sort((a, b) => a.price_eur - b.price_eur);
    case "prix_desc":
      return [...products].sort((a, b) => b.price_eur - a.price_eur);
    case "distance":
      return [...products].sort(
        (a, b) =>
          (a.producer.distance_km ?? Infinity) -
          (b.producer.distance_km ?? Infinity),
      );
    case "pertinence":
    default:
      // Available products first, then by stock status
      return [...products].sort((a, b) => {
        const stockOrder = { available: 0, low_stock: 1, out_of_stock: 2 };
        return stockOrder[a.stock_status] - stockOrder[b.stock_status];
      });
  }
}
