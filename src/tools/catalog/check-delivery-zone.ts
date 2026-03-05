/**
 * Tool MCP : check_delivery_zone
 * Vérification de la zone de livraison / disponibilité de points de retrait
 *
 * QUAND L'UTILISER : le client demande si on livre chez lui, ou quels sont
 *   les points de retrait disponibles.
 * CE QUE C'EST : vérification des zones couvertes et points de retrait.
 * CE QUE CE N'EST PAS : une planification de livraison, ni une commande.
 */

import { getLaCarotteClient, LaCarotteApiError } from "../../services/lacarotte-client.js";
import { CheckDeliveryZoneInputSchema } from "../../schemas/catalog.js";
import { checkPreLaunch, getLaunchInfo } from "../../middleware/pre-launch.js";
import { checkRateLimit } from "../../middleware/rate-limiter.js";
import { logAnalyticsEvent } from "../../middleware/analytics-logger.js";
import config from "../../config/index.js";
import { getTenantConfig } from "../../config/tenants.js";
import type {
  McpToolResponse,
  CheckDeliveryZoneOutput,
  DeliveryOption,
} from "../../types/index.js";

const TOOL_NAME = "check_delivery_zone";

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

export async function checkDeliveryZone(
  rawInput: unknown,
): Promise<McpToolResponse<CheckDeliveryZoneOutput>> {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  // Rate limit
  const rateLimited = await checkRateLimit(TOOL_NAME);
  if (rateLimited) return rateLimited as McpToolResponse<CheckDeliveryZoneOutput>;

  // Pre-launch
  const preLaunch = checkPreLaunch(TOOL_NAME);
  if (preLaunch) return preLaunch as McpToolResponse<CheckDeliveryZoneOutput>;

  // Validate input
  const parsed = CheckDeliveryZoneInputSchema.safeParse(rawInput);
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

  if (!input.postal_code && !input.city) {
    return {
      status: "error",
      data: null,
      message:
        "Veuillez indiquer un code postal ou une ville pour vérifier la zone de livraison.",
      meta: {
        tenantId,
        timestamp: new Date().toISOString(),
        cache_hit: false,
        request_id: requestId,
      },
    };
  }

  try {
    const client = getLaCarotteClient();

    // Fetch ALL places (API doesn't support query param filtering)
    const allPlaces = await client.getPlaces(undefined, tenantId);

    // Client-side filtering by postal_code and city
    const places = allPlaces.filter((place) => {
      const placePostalCode = place.postalCode ?? "";
      const placeCity = place.city ?? "";
      if (input.postal_code && input.city) {
        return (
          placePostalCode.includes(input.postal_code) &&
          placeCity.toLowerCase().includes(input.city.toLowerCase())
        );
      }
      if (input.postal_code) {
        return placePostalCode.includes(input.postal_code);
      }
      if (input.city) {
        return placeCity.toLowerCase().includes(input.city.toLowerCase());
      }
      return true;
    });

    // Get tenant center for distance calculation
    let tenantCoords: { lat: number; lng: number } | undefined;
    let deliveryRadius = 30;
    try {
      const tenantConfig = getTenantConfig(tenantId);
      tenantCoords = tenantConfig.coordinates;
      deliveryRadius = tenantConfig.deliveryRadiusKm;
    } catch {
      // Unknown tenant
    }

    // Map places to delivery options
    const options: DeliveryOption[] = places.map((place) => {
      let distanceKm: number | undefined;
      if (tenantCoords && place.coordinates) {
        distanceKm = haversineKm(
          tenantCoords.lat,
          tenantCoords.lng,
          place.coordinates.lat,
          place.coordinates.lng,
        );
      }
      return {
        place_id: place._id || place.id || "",
        name: place.name,
        type: place.type || "retrait",
        address: place.address,
        city: place.city,
        distance_km: distanceKm,
      };
    });

    const inZone = options.length > 0;

    if (inZone) {
      await logAnalyticsEvent(
        TOOL_NAME,
        "check_zone",
        { input, in_zone: true, options_count: options.length },
        Date.now() - startTime,
        tenantId,
      );

      return {
        status: "success",
        data: {
          in_zone: true,
          options: options.sort(
            (a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity),
          ),
        },
        message: `Bonne nouvelle ! ${options.length} point${options.length > 1 ? "s" : ""} de retrait disponible${options.length > 1 ? "s" : ""} près de chez vous.`,
        meta: {
          tenantId,
          timestamp: new Date().toISOString(),
          cache_hit: false,
          request_id: requestId,
          launch_info: getLaunchInfo(),
        },
      };
    }

    // Out of zone — find nearest places
    let nearestPlaces: DeliveryOption[] = [];
    try {
      const allPlaces = await client.getPlaces({}, tenantId);
      nearestPlaces = allPlaces
        .map((place) => {
          let distanceKm: number | undefined;
          if (tenantCoords && place.coordinates) {
            distanceKm = haversineKm(
              tenantCoords.lat,
              tenantCoords.lng,
              place.coordinates.lat,
              place.coordinates.lng,
            );
          }
          return {
            place_id: place._id || place.id || "",
            name: place.name,
            type: place.type || "retrait",
            address: place.address,
            city: place.city,
            distance_km: distanceKm,
          };
        })
        .sort(
          (a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity),
        )
        .slice(0, 3);
    } catch {
      // Best effort
    }

    const location = input.city || input.postal_code || "votre zone";

    await logAnalyticsEvent(
      TOOL_NAME,
      "check_zone",
      { input, in_zone: false },
      Date.now() - startTime,
      tenantId,
    );

    return {
      status: "out_of_zone",
      data: {
        in_zone: false,
        options: [],
        nearest_places: nearestPlaces,
      },
      message: `Nous ne livrons pas encore à ${location}. Nous opérons actuellement dans un rayon de ${deliveryRadius} km. Voici les points de retrait les plus proches.`,
      meta: {
        tenantId,
        timestamp: new Date().toISOString(),
        cache_hit: false,
        request_id: requestId,
        launch_info: getLaunchInfo(),
      },
      suggestions: [
        "Voir les points de retrait les plus proches",
        "Demander à être informé quand la zone sera étendue",
      ],
    };
  } catch (error) {
    const message =
      error instanceof LaCarotteApiError
        ? "Impossible de vérifier la zone de livraison actuellement."
        : "Une erreur est survenue lors de la vérification.";

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
      },
    };
  }
}
