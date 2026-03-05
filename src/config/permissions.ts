/**
 * Mapping des permissions LaCarotte pour le profil serveur MCP
 */

export const MCP_SERVER_PERMISSIONS = [
  // Catalogue (lecture seule)
  "fr.la-carotte.productCatalog.product.getAll",
  "fr.la-carotte.productCatalog.product.get",

  // Partenaires (lecture seule)
  "fr.la-carotte.partnerRegistery.partner.getAll",
  "fr.la-carotte.partnerRegistery.partner.get",

  // Mises en vente (lecture)
  "fr.la-carotte.partnerRegistery.putforsale.getAll",

  // Commandes (création + lecture pour checkout)
  "fr.la-carotte.commandRegistery.command.getAll",
  "fr.la-carotte.commandRegistery.command.get",
  "fr.la-carotte.commandRegistery.command.post",
  "fr.la-carotte.commandRegistery.command.put",

  // Paiements (création intent)
  "fr.la-carotte.paymentRegistery.payment.post",
  "fr.la-carotte.paymentRegistery.payment.get",

  // Analytics (lecture)
  "fr.la-carotte.analytics.revenue.getAll",
  "fr.la-carotte.analytics.orders.getAll",
  "fr.la-carotte.analytics.users.getAll",
  "fr.la-carotte.analytics.baskets.getAll",
  "fr.la-carotte.analytics.categories.getAll",

  // Référentiels (lecture)
  "fr.la-carotte.normesReferential.referenceunit.getAll",
] as const;

export const MCP_SERVER_BUSINESS_PROCESSES = [
  "COMMAND_PRODUCT_LISTING",
  "PRODUCT_MANAGEMENT",
  "COMMAND_MANAGEMENT",
  "PAYMENT_PROCESSING",
  "PARTNER_MANAGEMENT",
  "PARTNER_PRODUCT_MANAGEMENT",
  "CART_MANAGEMENT",
  "DELIVERY_MANAGEMENT",
  "LABEL_MANAGEMENT",
  "REFERENCE_DATA_MANAGEMENT",
  "AUDIT_TRACKING",
] as const;

export type BusinessProcess = typeof MCP_SERVER_BUSINESS_PROCESSES[number];
