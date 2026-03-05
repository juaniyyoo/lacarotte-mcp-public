/**
 * Tests unitaires — Phase 1 : search_products
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SearchProductsInputSchema } from "../../src/schemas/catalog.js";

describe("SearchProductsInputSchema", () => {
  it("T01 — accepts valid search query", () => {
    const result = SearchProductsInputSchema.safeParse({ query: "tomates" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("tomates");
      expect(result.data.page).toBe(1);
      expect(result.data.per_page).toBe(10);
      expect(result.data.sort_by).toBe("pertinence");
    }
  });

  it("T02 — accepts empty search (browse mode)", () => {
    const result = SearchProductsInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("T03 — accepts category filter", () => {
    const result = SearchProductsInputSchema.safeParse({
      category: "fromages",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe("fromages");
    }
  });

  it("T04 — accepts price max filter", () => {
    const result = SearchProductsInputSchema.safeParse({
      price_max_eur: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.price_max_eur).toBe(5);
    }
  });

  it("T05 — accepts producer filter", () => {
    const result = SearchProductsInputSchema.safeParse({
      producer: "Moreau",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.producer).toBe("Moreau");
    }
  });

  it("T06 — accepts label filter", () => {
    const result = SearchProductsInputSchema.safeParse({ label: "bio" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.label).toBe("bio");
    }
  });

  it("T07 — accepts all sort options", () => {
    const sortOptions = [
      "pertinence",
      "prix_asc",
      "prix_desc",
      "distance",
      "fraicheur",
    ];
    for (const sort of sortOptions) {
      const result = SearchProductsInputSchema.safeParse({ sort_by: sort });
      expect(result.success).toBe(true);
    }
  });

  it("T08 — accepts pagination", () => {
    const result = SearchProductsInputSchema.safeParse({
      query: "légumes",
      page: 2,
      per_page: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.per_page).toBe(5);
    }
  });

  it("rejects negative price", () => {
    const result = SearchProductsInputSchema.safeParse({
      price_max_eur: -5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects per_page > 20", () => {
    const result = SearchProductsInputSchema.safeParse({
      per_page: 50,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid sort option", () => {
    const result = SearchProductsInputSchema.safeParse({
      sort_by: "invalid",
    });
    expect(result.success).toBe(false);
  });
});
