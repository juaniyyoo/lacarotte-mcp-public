/**
 * Tool MCP : list_partners
 * Liste les producteurs en ligne avec leurs produits et phrases
 *
 * QUAND L'UTILISER : l'utilisateur veut connaître les producteurs, leurs produits disponibles,
 *   leurs phrases de présentation.
 * CE QUE C'EST : liste enrichie des partenaires avec leurs produits liés.
 * CE QUE CE N'EST PAS : une fiche produit détaillée (utiliser get_product).
 */

import { getLaCarotteClient, LaCarotteApiError } from "../../services/lacarotte-client.js";
import { getContractMaps } from "../../services/contract-cache.js";
import { ListPartnersInputSchema } from "../../schemas/catalog.js";
import { checkPreLaunch, getLaunchInfo } from "../../middleware/pre-launch.js";
import { checkRateLimit } from "../../middleware/rate-limiter.js";
import { logAnalyticsEvent } from "../../middleware/analytics-logger.js";
import config from "../../config/index.js";
import type { McpToolResponse, ListPartnersOutput } from "../../types/index.js";

const TOOL_NAME = "list_partners";

export async function listPartners(
  rawInput: unknown,
): Promise<McpToolResponse<ListPartnersOutput>> {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  const rateLimited = await checkRateLimit(TOOL_NAME);
  if (rateLimited) return rateLimited as McpToolResponse<ListPartnersOutput>;

  const preLaunch = checkPreLaunch(TOOL_NAME);
  if (preLaunch) return preLaunch as McpToolResponse<ListPartnersOutput>;

  const parsed = ListPartnersInputSchema.safeParse(rawInput);
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

    // Fetch partners and contract maps in parallel
    // Liens : Product → Contract (conditions[].productId) → Partner (Contract.partnerId)
    const [allPartners, { partnerToProducts }] = await Promise.all([
      client.getPartners(undefined, tenantId),
      getContractMaps(tenantId),
    ]);

    // Only keep non-deleted partners
    const activePartners = allPartners.filter(
      (p) => !(p as any).deleted,
    );

    // Map to output — only partners that have at least one product in contracts
    const result = activePartners
      .filter((p) => {
        const pid = p._id || p.id || "";
        return (partnerToProducts.get(pid)?.length ?? 0) > 0;
      })
      .map((p) => {
        const pid = p._id || p.id || "";
        const name = p.name || p.companyName || (p as any).commercialName || "Producteur local";

        // Contact firstname: look for contacts[0] or users[0] with a firstname field
        const contacts = (p as any).contacts as Array<{ personId?: string; firstname?: string; role?: string }> | undefined;
        const contactFirstname: string | undefined = contacts?.[0]?.firstname;

        return {
          id: pid,
          name,
          contact_firstname: contactFirstname,
          why_this_job: p.whyThisJob,
          why_carotte: p.whyCarotte,
          product_ids: partnerToProducts.get(pid) ?? [],
        };
      });

    await logAnalyticsEvent(
      TOOL_NAME,
      "list_partners",
      { count: result.length },
      Date.now() - startTime,
      tenantId,
    );

    return {
      status: result.length > 0 ? "success" : "empty",
      data: {
        partners: result,
        total: result.length,
      },
      message:
        result.length > 0
          ? `${result.length} producteur${result.length > 1 ? "s" : ""} en ligne sur LaCarotte.`
          : "Aucun producteur disponible actuellement.",
      meta: {
        tenantId,
        timestamp: new Date().toISOString(),
        cache_hit: false,
        request_id: requestId,
        launch_info: getLaunchInfo(),
      },
    };
  } catch (error) {
    await logAnalyticsEvent(
      TOOL_NAME,
      "tool_error",
      { error: String(error) },
      Date.now() - startTime,
      tenantId,
    );

    return {
      status: "error",
      data: null,
      message: "Impossible de récupérer la liste des producteurs. Veuillez réessayer.",
      meta: {
        tenantId,
        timestamp: new Date().toISOString(),
        cache_hit: false,
        request_id: requestId,
      },
    };
  }
}
