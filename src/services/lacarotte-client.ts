/**
 * Client HTTP vers l'API LaCarotte
 * Authentification server-to-server via JWT RSA
 */

import jwt from "jsonwebtoken";
import config from "../config/index.js";
import type {
  LaCarotteProduct,
  LaCarottePartner,
  LaCarottePlace,
  LaCarotteLabel,
  LaCarotteProductionStock,
  LaCarotteContract,
  LaCarotteCommand,
  LaCarotteCart,
  LaCarottePayment,
  LaCarotteCategory,
  LaCarotteProductCategory,
  LaCarotteProductType,
} from "../types/index.js";

export class LaCarotteApiError extends Error {
  constructor(
    public statusCode: number,
    public errorBody: unknown,
  ) {
    super(`LaCarotte API error ${statusCode}: ${JSON.stringify(errorBody)}`);
    this.name = "LaCarotteApiError";
  }
}

interface RequestOptions {
  businessProcess: string;
  action?: string;
  tenantId?: string;
  body?: unknown;
  query?: Record<string, string>;
}

export class LaCarotteClient {
  private apiUrl: string;
  private privateKey: string;
  private tenantId: string;
  private clientId: string;

  constructor() {
    this.apiUrl = config.lacarotte.apiUrl;
    this.privateKey = config.lacarotte.privateKey;
    this.tenantId = config.lacarotte.defaultTenant;
    this.clientId = config.lacarotte.serverClientId;
  }

  /** Génère un JWT server-to-server signé RSA */
  private generateServerToken(tenantId?: string): string {
    // If no private key configured, return a placeholder for dev
    if (!this.privateKey) {
      return jwt.sign(
        {
          clientId: this.clientId,
          type: "server",
          tenantId: tenantId || this.tenantId,
        },
        "dev-secret",
        { algorithm: "HS256", expiresIn: "1h" },
      );
    }

    return jwt.sign(
      {
        clientId: this.clientId,
        type: "server",
        tenantId: tenantId || this.tenantId,
      },
      this.privateKey,
      { algorithm: "RS256", expiresIn: "1h" },
    );
  }

  /** Appel API LaCarotte avec contexte métier complet */
  async request<T>(
    method: string,
    path: string,
    options: RequestOptions,
  ): Promise<T> {
    const tenant = options.tenantId || this.tenantId;

    const url = new URL(path, this.apiUrl);
    if (options.query) {
      Object.entries(options.query).forEach(([k, v]) =>
        url.searchParams.set(k, v),
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "LC-Tenant": tenant,
      "LC-Business_process": options.businessProcess,
    };

    // Only add Authorization header if we have a proper RSA private key
    if (this.privateKey) {
      const token = this.generateServerToken(tenant);
      headers["Authorization"] = `Bearer ${token}`;
    }

    if (options.action) {
      headers["LC-Action"] = options.action;
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error(`[MCP API] ${method} ${url.toString()} → ${response.status}`, error);
      throw new LaCarotteApiError(response.status, error);
    }

    return response.json() as T;
  }

  // ─── Raccourcis typés ───

  async getProducts(
    query?: Record<string, string>,
    tenantId?: string,
  ): Promise<LaCarotteProduct[]> {
    return this.request<LaCarotteProduct[]>("GET", "/api/products", {
      businessProcess: "COMMAND_PRODUCT_LISTING",
      query,
      tenantId,
    });
  }

  async getProduct(
    id: string,
    tenantId?: string,
  ): Promise<LaCarotteProduct> {
    return this.request<LaCarotteProduct>("GET", `/api/products/${id}`, {
      businessProcess: "PRODUCT_MANAGEMENT",
      action: "RETRIEVE",
      tenantId,
    });
  }

  async getPartners(
    query?: Record<string, string>,
    tenantId?: string,
  ): Promise<LaCarottePartner[]> {
    return this.request<LaCarottePartner[]>("GET", "/api/partners", {
      businessProcess: "PARTNER_MANAGEMENT",
      action: "LIST",
      query,
      tenantId,
    });
  }

  async getPartner(
    id: string,
    tenantId?: string,
  ): Promise<LaCarottePartner> {
    return this.request<LaCarottePartner>("GET", `/api/partners/${id}`, {
      businessProcess: "PARTNER_MANAGEMENT",
      action: "RETRIEVE",
      tenantId,
    });
  }

  async getPlaces(
    query?: Record<string, string>,
    tenantId?: string,
  ): Promise<LaCarottePlace[]> {
    return this.request<LaCarottePlace[]>("GET", "/api/places", {
      businessProcess: "DELIVERY_MANAGEMENT",
      action: "LIST",
      query,
      tenantId,
    });
  }

  async getLabels(tenantId?: string): Promise<LaCarotteLabel[]> {
    return this.request<LaCarotteLabel[]>("GET", "/api/labels", {
      businessProcess: "LABEL_MANAGEMENT",
      action: "LIST",
      tenantId,
    });
  }

  async getCategories(tenantId?: string): Promise<LaCarotteProductCategory[]> {
    return this.request<LaCarotteProductCategory[]>("GET", "/api/productCategories", {
      businessProcess: "COMMAND_PRODUCT_LISTING",
      action: "LIST",
      tenantId,
    });
  }

  async getProductTypes(tenantId?: string): Promise<LaCarotteProductType[]> {
    return this.request<LaCarotteProductType[]>("GET", "/api/productTypes", {
      businessProcess: "COMMAND_PRODUCT_LISTING",
      action: "LIST",
      tenantId,
    });
  }

  async getContracts(
    query?: Record<string, string>,
    tenantId?: string,
  ): Promise<LaCarotteContract[]> {
    return this.request<LaCarotteContract[]>("GET", "/api/contracts", {
      businessProcess: "CONTRACT_MANAGEMENT",
      action: "LIST",
      query,
      tenantId,
    });
  }

  async getPartnerProducts(
    query?: Record<string, string>,
    tenantId?: string,
  ): Promise<Array<{ id: string; partnerId: string; name?: string }>> {
    return this.request<Array<{ id: string; partnerId: string; name?: string }>>(
      "GET",
      "/api/partnerProducts",
      {
        businessProcess: "PARTNER_PRODUCT_MANAGEMENT",
        action: "LIST",
        query,
        tenantId,
      },
    );
  }

  async getProductionStocks(
    query?: Record<string, string>,
    tenantId?: string,
  ): Promise<LaCarotteProductionStock[]> {
    return this.request<LaCarotteProductionStock[]>(
      "GET",
      "/api/productionStocks",
      {
        businessProcess: "PARTNER_PRODUCT_MANAGEMENT",
        action: "LIST",
        query,
        tenantId,
      },
    );
  }

  async createCommand(
    body: unknown,
    tenantId?: string,
  ): Promise<LaCarotteCommand> {
    return this.request<LaCarotteCommand>("POST", "/api/commands", {
      businessProcess: "COMMAND_MANAGEMENT",
      action: "CREATE",
      body,
      tenantId,
    });
  }

  async getCommand(
    id: string,
    tenantId?: string,
  ): Promise<LaCarotteCommand> {
    return this.request<LaCarotteCommand>("GET", `/api/commands/${id}`, {
      businessProcess: "COMMAND_MANAGEMENT",
      action: "RETRIEVE",
      tenantId,
    });
  }

  async createPaymentIntent(
    commandId: string,
    tenantId?: string,
  ): Promise<LaCarottePayment> {
    return this.request<LaCarottePayment>("PUT", `/api/commands/${commandId}`, {
      businessProcess: "COMMAND_MANAGEMENT",
      action: "PAYMENT_INTENT",
      query: { action: "PAYMENT_INTENT" },
      tenantId,
    });
  }

  async getAnalytics(
    type: "revenue" | "orders" | "users" | "baskets" | "categories",
    params: { startDate: string; endDate: string; groupBy?: string },
    tenantId?: string,
  ): Promise<unknown> {
    return this.request<unknown>("GET", `/api/analytics/${type}`, {
      businessProcess: "AUDIT_TRACKING",
      query: params as Record<string, string>,
      tenantId,
    });
  }

  async getCart(id: string, tenantId?: string): Promise<LaCarotteCart> {
    return this.request<LaCarotteCart>("GET", `/api/carts/${id}`, {
      businessProcess: "CART_MANAGEMENT",
      action: "RETRIEVE",
      tenantId,
    });
  }

  async createCart(body: unknown, tenantId?: string): Promise<LaCarotteCart> {
    return this.request<LaCarotteCart>("POST", "/api/carts", {
      businessProcess: "CART_MANAGEMENT",
      action: "CREATE",
      body,
      tenantId,
    });
  }

  async updateCart(
    id: string,
    body: unknown,
    tenantId?: string,
  ): Promise<LaCarotteCart> {
    return this.request<LaCarotteCart>("PUT", `/api/carts/${id}`, {
      businessProcess: "CART_MANAGEMENT",
      action: "UPDATE",
      body,
      tenantId,
    });
  }
}

// Singleton instance
let clientInstance: LaCarotteClient | null = null;

export function getLaCarotteClient(): LaCarotteClient {
  if (!clientInstance) {
    clientInstance = new LaCarotteClient();
  }
  return clientInstance;
}
