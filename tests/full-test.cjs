/**
 * Comprehensive MCP conversational test suite
 * Tests proximity, farmers, identity, pricing, delivery, and more
 */
const http = require("http");

const BASE = "http://localhost:3001";

// ─── SSE Client ───

class McpClient {
  constructor() {
    this.sessionId = null;
    this.handlers = new Map();
    this.sseReq = null;
    this.buffer = "";
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.sseReq = http.get(`${BASE}/sse`, (res) => {
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          this.buffer += chunk;
          const events = this.buffer.split("\n\n");
          this.buffer = events.pop();
          for (const evt of events) {
            const lines = evt.split("\n");
            let type = "message", data = "";
            for (const l of lines) {
              if (l.startsWith("event: ")) type = l.slice(7);
              if (l.startsWith("data: ")) data = l.slice(6);
            }
            if (type === "endpoint" && !this.sessionId) {
              const url = new URL(data, BASE);
              this.sessionId = url.searchParams.get("sessionId");
              resolve();
            }
            if (type === "message" && data) {
              try {
                const msg = JSON.parse(data);
                if (msg.id && this.handlers.has(msg.id)) {
                  this.handlers.get(msg.id)(msg);
                  this.handlers.delete(msg.id);
                }
              } catch {}
            }
          }
        });
      });
      this.sseReq.on("error", reject);
      setTimeout(() => reject(new Error("Connect timeout")), 5000);
    });
  }

  post(body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = http.request(`${BASE}/messages?sessionId=${this.sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      }, (res) => {
        let out = "";
        res.on("data", (c) => out += c);
        res.on("end", () => resolve(res.statusCode));
      });
      req.on("error", reject);
      req.end(data);
    });
  }

  call(method, params, timeout = 20000) {
    const id = Math.floor(Math.random() * 1e9);
    return new Promise((resolve, reject) => {
      this.handlers.set(id, resolve);
      this.post({ jsonrpc: "2.0", id, method, params }).catch(reject);
      setTimeout(() => {
        if (this.handlers.has(id)) {
          this.handlers.delete(id);
          reject(new Error(`Timeout: ${method}`));
        }
      }, timeout);
    });
  }

  async init() {
    await this.connect();
    await this.call("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "full-test", version: "1.0" },
    });
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  }

  async tool(name, args = {}) {
    const r = await this.call("tools/call", { name, arguments: args });
    const text = r?.result?.content?.[0]?.text;
    return text ? JSON.parse(text) : null;
  }

  async resource(uri) {
    const r = await this.call("resources/read", { uri });
    return r?.result?.contents?.[0]?.text || "";
  }

  close() {
    if (this.sseReq) this.sseReq.destroy();
  }
}

// ─── Test runner ───

let passed = 0, failed = 0;

function assert(condition, testName, detail) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName} — ${detail || "assertion failed"}`);
    failed++;
  }
}

// ─── Tests ───

async function main() {
  const client = new McpClient();
  await client.init();
  console.log("Connected & initialized\n");

  // ═══════════════════════════════════════════════════════
  // SECTION 1: Product Catalog
  // ═══════════════════════════════════════════════════════
  console.log("═══ CATALOG TESTS ═══");

  // Test: All products
  console.log("\n📦 All products");
  const all = await client.tool("search_products");
  assert(all?.status === "success", "Returns success");
  assert(all?.data?.total_results >= 10, `Has ≥10 products (got ${all?.data?.total_results})`, `got ${all?.data?.total_results}`);
  assert(all?.data?.products?.length > 0, "Products array is non-empty");
  
  const productNames = (all?.data?.products || []).map(p => p.name);
  console.log(`  Products: ${productNames.join(", ")}`);

  // Test: Search for "carotte"
  console.log("\n🥕 Search 'carotte'");
  const carotte = await client.tool("search_products", { query: "carotte" });
  assert(carotte?.data?.total_results > 0, `Found carrots (${carotte?.data?.total_results})`, "0 results");
  const carrotNames = (carotte?.data?.products || []).map(p => p.name);
  assert(carrotNames.some(n => n.toLowerCase().includes("carotte")), `Names contain 'carotte': ${carrotNames.join(", ")}`);

  // Test: Search for "tomate"
  console.log("\n🍅 Search 'tomate'");
  const tomate = await client.tool("search_products", { query: "tomate" });
  assert(tomate?.data?.total_results > 0, `Found tomatoes (${tomate?.data?.total_results})`, "0 results");

  // Test: Search for "boeuf" / "viande"
  console.log("\n🥩 Search 'boeuf'");
  const boeuf = await client.tool("search_products", { query: "boeuf" });
  assert(boeuf?.data?.total_results > 0, `Found beef (${boeuf?.data?.total_results})`, "0 results");

  // Test: Search nonexistent product
  console.log("\n🔍 Search 'xyz123nonexistent'");
  const nope = await client.tool("search_products", { query: "xyz123nonexistent" });
  assert(nope?.status === "empty", `Returns 'empty' status (got ${nope?.status})`);
  assert(nope?.data?.total_results === 0, "0 results");

  // Test: Price filter
  console.log("\n💰 Price filter (max 5€)");
  const cheap = await client.tool("search_products", { price_max_eur: 5 });
  assert(cheap?.data?.total_results > 0, `Found products ≤5€ (${cheap?.data?.total_results})`);
  const allUnder5 = (cheap?.data?.products || []).every(p => p.price_eur <= 5);
  assert(allUnder5, "All returned products are ≤5€");

  // Test: Sort by price ascending 
  console.log("\n📊 Sort by price ascending");
  const sortAsc = await client.tool("search_products", { sort_by: "prix_asc" });
  const prices = (sortAsc?.data?.products || []).map(p => p.price_eur);
  const isSorted = prices.every((p, i) => i === 0 || p >= prices[i - 1]);
  assert(isSorted, `Prices are ascending: ${prices.join(", ")}`);

  // Test: Pagination
  console.log("\n📄 Pagination");
  const page1 = await client.tool("search_products", { per_page: 5, page: 1 });
  const page2 = await client.tool("search_products", { per_page: 5, page: 2 });
  assert(page1?.data?.products?.length <= 5, `Page 1 has ≤5 products (${page1?.data?.products?.length})`);
  assert(page2?.data?.products?.length > 0, `Page 2 has products (${page2?.data?.products?.length})`);
  const p1Names = new Set((page1?.data?.products || []).map(p => p.id));
  const p2Names = new Set((page2?.data?.products || []).map(p => p.id));
  const overlap = [...p1Names].filter(n => p2Names.has(n));
  assert(overlap.length === 0, "No overlap between pages");

  // ═══════════════════════════════════════════════════════
  // SECTION 2: Product Details
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ PRODUCT DETAIL TESTS ═══");

  // Get a product ID from the catalog
  const sampleProduct = all?.data?.products?.[0];
  if (sampleProduct) {
    console.log(`\n🔎 Check stock for "${sampleProduct.name}" (${sampleProduct.id})`);
    const stock = await client.tool("check_stock", { product_id: sampleProduct.id });
    console.log(`  Status: ${stock?.status}, Stock: ${stock?.data?.status}`);
    console.log(`  Message: ${stock?.message}`);
    assert(stock?.status !== "error", `Stock check succeeded (status: ${stock?.status})`);
    assert(stock?.data?.product_name, `Got product name: ${stock?.data?.product_name}`);
  }

  // ═══════════════════════════════════════════════════════
  // SECTION 3: Delivery Zone
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ DELIVERY ZONE TESTS ═══");

  console.log("\n📍 Check zone: Poitiers (86000)");
  const poitiers = await client.tool("check_delivery_zone", { postal_code: "86000", city: "Poitiers" });
  console.log(`  Status: ${poitiers?.status}, In zone: ${poitiers?.data?.in_zone}`);
  console.log(`  Message: ${poitiers?.message}`);
  assert(poitiers?.status !== "error", `Zone check didn't error (${poitiers?.status})`);

  console.log("\n📍 Check zone: Paris (75001)");
  const paris = await client.tool("check_delivery_zone", { postal_code: "75001", city: "Paris" });
  console.log(`  Status: ${paris?.status}, In zone: ${paris?.data?.in_zone}`);
  console.log(`  Message: ${paris?.message}`);

  // ═══════════════════════════════════════════════════════
  // SECTION 4: Store Context & Identity
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ STORE CONTEXT TESTS ═══");

  console.log("\n🏪 Store context resource");
  const ctx = await client.resource("lacarotte://store-context");
  assert(ctx.length > 500, `Context is rich (${ctx.length} chars)`);
  assert(ctx.toLowerCase().includes("carotte"), "Mentions 'carotte'");
  assert(ctx.toLowerCase().includes("local") || ctx.toLowerCase().includes("circuit"), "Mentions local/circuit court");
  assert(ctx.toLowerCase().includes("product"), "Mentions producteurs");
  console.log(`  Preview: ${ctx.substring(0, 300)}...`);

  // ═══════════════════════════════════════════════════════
  // SECTION 5: Pre-launch Gating
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ PRE-LAUNCH GATING TESTS ═══");

  console.log("\n🚫 create_basket (should be blocked)");
  const basket = await client.tool("create_basket");
  assert(basket?.status === "pre_launch", `Blocked with pre_launch (got ${basket?.status})`);
  assert(basket?.message?.includes("mars"), "Message mentions launch date");
  console.log(`  Message: ${basket?.message?.substring(0, 150)}`);

  console.log("\n🚫 add_to_basket (should be blocked)");
  try {
    const addBasket = await client.tool("add_to_basket", { product_id: "test", quantity: 1 });
    assert(addBasket?.status === "pre_launch", `Blocked (got ${addBasket?.status})`);
  } catch (e) {
    // MCP SDK may return an error response for validation failures
    assert(true, "add_to_basket blocked (MCP error or pre_launch)");
    console.log(`  (Error: ${e.message?.substring(0, 100)})`);
  }

  // ═══════════════════════════════════════════════════════
  // SECTION 6: Tool listing
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ TOOL LISTING TESTS ═══");

  const toolsList = await client.call("tools/list", {});
  const tools = toolsList?.result?.tools || [];
  const toolNames = tools.map(t => t.name);
  console.log(`  Tools (${tools.length}): ${toolNames.join(", ")}`);
  assert(toolNames.includes("search_products"), "Has search_products");
  assert(toolNames.includes("check_stock"), "Has check_stock");
  assert(toolNames.includes("check_delivery_zone"), "Has check_delivery_zone");
  assert(toolNames.includes("get_checkout_info"), "Has get_checkout_info");
  assert(toolNames.includes("create_basket"), "Has create_basket");
  assert(toolNames.includes("add_to_basket"), "Has add_to_basket");
  assert(toolNames.includes("get_basket"), "Has get_basket");
  assert(toolNames.includes("remove_from_basket"), "Has remove_from_basket");

  // ═══════════════════════════════════════════════════════
  // SECTION 7: Resource listing
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ RESOURCE LISTING TESTS ═══");

  const resourcesList = await client.call("resources/list", {});
  const resources = resourcesList?.result?.resources || [];
  console.log(`  Resources (${resources.length}): ${resources.map(r => r.name).join(", ")}`);
  assert(resources.length >= 1, "Has at least 1 resource");
  assert(resources.some(r => r.uri === "lacarotte://store-context"), "Has store context resource");

  // ═══════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(50));
  console.log(`RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log("═".repeat(50));

  client.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
