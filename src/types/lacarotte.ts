/**
 * Types importés / miroir depuis lacarotte-toolkit
 * Ces types reflètent les structures existantes dans l'écosystème LaCarotte.
 */

// Re-export des types LaCarotte depuis le fichier principal
export type {
  LaCarotteProduct,
  LaCarottePartner,
  LaCarottePlace,
  LaCarotteLabel,
  LaCarotteProductionStock,
  LaCarotteCommand,
  LaCarotteCart,
  LaCarottePayment,
  LaCarotteCategory,
} from "./index.js";

// ═══════════════════════════════════════════
// Collections MCP (extension de la base LaCarotte)
// ═══════════════════════════════════════════

export interface McpBasket {
  _id: string;
  tenantId: string;
  sessionFingerprint?: string;
  userId?: string;
  label?: string;
  status: "draft" | "ordered" | "abandoned" | "expired";
  totalEur: number;
  items: McpBasketItem[];
  shareToken: string;
  ownerToken: string;
  expiresAt: Date;
  orderedAt?: Date;
  commandId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface McpBasketItem {
  productId: string;
  productName: string;
  producerName?: string;
  partnerId?: string;
  quantity: number;
  priceAtCreation: number;
  unit: string;
  addedBy: string;
  addedAt: Date;
}

export interface McpSubscription {
  _id: string;
  tenantId: string;
  userId: string;
  frequency: "weekly" | "biweekly" | "monthly";
  budgetEur?: number;
  budgetTolerancePct: number;
  preferredDay: string;
  products: McpSubscriptionProduct[];
  notificationChannel: "email" | "sms" | "whatsapp" | "both";
  notificationContact: string;
  status: "active" | "paused" | "cancelled";
  pausedUntil?: Date;
  nextGenerationAt: Date;
  lastGeneratedAt?: Date;
  totalGenerated: number;
  totalConfirmed: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface McpSubscriptionProduct {
  productId?: string;
  category?: string;
  priority: 1 | 2 | 3;
  maxQuantity: number;
  notes?: string;
}

export interface McpStockAlert {
  _id: string;
  tenantId: string;
  productId: string;
  productName: string;
  contactType: "email" | "sms";
  contactValue: string;
  consentAt: Date;
  consentSource: "agent" | "web";
  notifiedAt?: Date;
  status: "pending" | "notified" | "expired" | "cancelled";
  createdAt: Date;
}

export interface McpAnalyticsEvent {
  _id: string;
  tenantId: string;
  eventType: string;
  toolName: string;
  sessionFingerprint?: string;
  city?: string;
  payload: Record<string, unknown>;
  responseTimeMs: number;
  createdAt: Date;
}

export interface McpClientPreference {
  _id: string;
  tenantId: string;
  userId: string;
  favoriteCategories: string[];
  favoriteProducers: string[];
  dietaryRestrictions: string[];
  averageBudgetEur?: number;
  preferredDeliveryZone?: string;
  purchaseFrequencyDays?: number;
  lastOrderAt?: Date;
  totalOrders: number;
  totalSpentEur: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface McpBasketShare {
  _id: string;
  tenantId: string;
  basketId: string;
  channel: "email" | "sms";
  recipient: string;
  personalMessage?: string;
  consentAt: Date;
  sentAt?: Date;
  status: "sent" | "failed";
  costEur?: number;
  createdAt: Date;
}
