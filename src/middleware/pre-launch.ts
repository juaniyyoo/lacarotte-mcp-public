/**
 * Middleware pré-lancement
 * Bloque les tools transactionnels avant la date de lancement.
 * Les tools de consultation fonctionnent avec launch_info ajouté.
 */

import config from "../config/index.js";
import type { McpLaunchInfo, McpToolResponse } from "../types/index.js";

const TRANSACTIONAL_TOOLS = new Set([
  "create_basket",
  "add_to_basket",
  "remove_from_basket",
  "share_basket_by_email",
  "share_basket_by_sms",
  "create_subscription",
  "pause_subscription",
  "modify_subscription",
  "cancel_subscription",
]);

export function isPreLaunch(): boolean {
  return new Date() < config.launch.date;
}

export function getLaunchInfo(): McpLaunchInfo | undefined {
  if (!isPreLaunch()) return undefined;

  const now = new Date();
  const daysRemaining = Math.ceil(
    (config.launch.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  return {
    status: "pre_launch",
    launch_date: config.launch.date.toISOString(),
    days_remaining: daysRemaining,
    invitation_message:
      `LaCarotte ouvre ses portes le ${config.launch.date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} ! ` +
      `Encore ${daysRemaining} jour${daysRemaining > 1 ? "s" : ""} avant de découvrir les produits de nos producteurs locaux.`,
  };
}

export function checkPreLaunch(
  toolName: string,
): McpToolResponse | null {
  if (!isPreLaunch()) return null;

  if (TRANSACTIONAL_TOOLS.has(toolName)) {
    const launchInfo = getLaunchInfo()!;
    return {
      status: "pre_launch",
      data: null,
      message: launchInfo.invitation_message,
      meta: {
        tenantId: config.lacarotte.defaultTenant,
        timestamp: new Date().toISOString(),
        cache_hit: false,
        request_id: crypto.randomUUID(),
        launch_info: launchInfo,
      },
    };
  }

  // Consultation tools pass through — launch_info is added in meta
  return null;
}
