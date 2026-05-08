/**
 * Types MCP LaCarotte — Contrat de réponse universel et types métier
 */

// ═══════════════════════════════════════════
// Contrat de réponse universel MCP
// ═══════════════════════════════════════════

export type McpToolStatus =
  | "success"
  | "empty"
  | "out_of_stock"
  | "out_of_zone"
  | "error"
  | "rate_limited"
  | "pre_launch"
  | "confirmation_required";

export interface McpLaunchInfo {
  status: "pre_launch";
  launch_date: string;
  days_remaining: number;
  invitation_message: string;
}

export interface McpToolMeta {
  tenantId: string;
  timestamp: string;
  cache_hit: boolean;
  request_id: string;
  launch_info?: McpLaunchInfo;
}

export interface McpToolResponse<T = unknown> {
  status: McpToolStatus;
  data: T | null;
  message: string;
  meta: McpToolMeta;
  suggestions?: string[];
}

// ═══════════════════════════════════════════
// Types LaCarotte API (miroir simplifié)
// ═══════════════════════════════════════════

export interface LaCarotteProduct {
  _id: string;
  id?: string;
  tenantId: string;
  name: string;
  description?: string;
  categoryId?: string;
  category?: string;
  partnerId?: string;
  referenceUnitGrossPrice?: number;
  VAT?: number;
  referenceUnit?: string;
  labels?: string[];
  allergens?: string[];
  ingredients?: string[];
  photos?: Array<{ base64?: string; url?: string }>;
  stock?: number;
  available?: boolean;
  [key: string]: unknown;
}

export interface LaCarottePartner {
  _id: string;
  id?: string;
  tenantId: string;
  name?: string;
  companyName?: string;
  commercialName?: string;
  description?: string;
  locality?: string;
  city?: string;
  postalCode?: string;
  coordinates?: { lat: number; lng: number };
  certifications?: string[];
  labels?: string[];
  /** Phrase du producteur : pourquoi il a choisi ce métier */
  whyThisJob?: string;
  /** Phrase du producteur : pourquoi il travaille avec La Carotte */
  whyCarotte?: string;
  [key: string]: unknown;
}

export interface LaCarottePlace {
  _id: string;
  id?: string;
  tenantId: string;
  name: string;
  type?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  coordinates?: { lat: number; lng: number };
  [key: string]: unknown;
}

export interface LaCarotteLabel {
  _id: string;
  id?: string;
  tenantId: string;
  name: string;
  description?: string;
  [key: string]: unknown;
}

export interface LaCarotteProductionStock {
  _id: string;
  productId: string;
  partnerId?: string;
  quantity?: number;
  available?: boolean;
  [key: string]: unknown;
}

export interface LaCarotteCommand {
  _id: string;
  id?: string;
  tenantId: string;
  status?: string;
  items?: Array<{
    productId: string;
    quantity: number;
    price?: number;
    [key: string]: unknown;
  }>;
  totalAmount?: number;
  [key: string]: unknown;
}

export interface LaCarotteCart {
  _id: string;
  id?: string;
  tenantId: string;
  items?: Array<{
    productId: string;
    quantity: number;
    price?: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface LaCarottePayment {
  _id: string;
  commandId: string;
  status?: string;
  paymentUrl?: string;
  [key: string]: unknown;
}

export interface LaCarotteCategory {
  _id: string;
  id?: string;
  name: string;
  [key: string]: unknown;
}

// ═══════════════════════════════════════════
// Types de sortie des tools MCP
// ═══════════════════════════════════════════

export interface SearchProductResult {
  id: string;
  name: string;
  description?: string;
  category: string;
  producer: {
    id: string;
    name: string;
    locality?: string;
    distance_km?: number;
    certifications: string[];
  };
  price_eur: number;
  vat_pct: number;
  unit: string;
  stock_status: "available" | "low_stock" | "out_of_stock";
  stock_note: string;
  labels: string[];
  allergens?: string[];
  ingredients?: string[];
  image_url?: string;
}

export interface SearchProductsOutput {
  products: SearchProductResult[];
  total_results: number;
  page: number;
  total_pages: number;
}

export interface CheckStockOutput {
  product_id: string;
  product_name: string;
  price_eur: number;
  unit: string;
  available_quantity: number;
  status: "available" | "low_stock" | "out_of_stock";
  alternatives?: Array<{
    id: string;
    name: string;
    price_eur: number;
    producer_name: string;
  }>;
}

export interface GetProductOutput {
  id: string;
  name: string;
  description?: string;
  category: string;
  partner: {
    id: string;
    name: string;
  } | null;
  price_eur: number;
  vat_pct: number;
  unit: string;
  stock_status: "available" | "low_stock" | "out_of_stock";
  labels: string[];
  allergens?: string[];
  ingredients?: string[];
  image_url?: string;
}

export interface ListPartnerResult {
  id: string;
  name: string;
  contact_firstname?: string;
  why_this_job?: string;
  why_carotte?: string;
  product_ids: string[];
}

export interface ListPartnersOutput {
  partners: ListPartnerResult[];
  total: number;
}

export interface DeliveryOption {
  place_id: string;
  name: string;
  type: string;
  address?: string;
  city?: string;
  distance_km?: number;
}

export interface CheckDeliveryZoneOutput {
  in_zone: boolean;
  options: DeliveryOption[];
  nearest_places?: DeliveryOption[];
}

export interface CheckoutInfoOutput {
  basket_id: string;
  items: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price_eur: number;
    total_eur: number;
  }>;
  subtotal_eur: number;
  delivery_options: DeliveryOption[];
  payment_url?: string;
  app_checkout_url: string;
}
