/**
 * Test MCP tools via SSE transport
 * Properly keeps SSE connection open while sending POST requests 
 */
import http from "http";

const BASE = "http://localhost:3001";

class McpSseClient {
  constructor() {
    this.sessionId = null;
    this.responseHandlers = new Map();
    this.sseRequest = null;
    this.buffer = "";
    this.currentEvent = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.sseRequest = http.get(`${BASE}/sse`, (res) => {
        res.setEncoding("utf8");
        res.on("data", (chunk) => this._handleSseChunk(chunk, resolve));
        res.on("end", () => console.log("[SSE] Connection closed"));
        res.on("error", (e) => console.error("[SSE] Error:", e.message));
      });
      this.sseRequest.on("error", reject);
      setTimeout(() => reject(new Error("SSE connect timeout")), 5000);
    });
  }

  _handleSseChunk(chunk, connectResolve) {
    this.buffer += chunk;
    const parts = this.buffer.split("\n\n");
    this.buffer = parts.pop(); // keep incomplete part

    for (const part of parts) {
      const lines = part.split("\n");
      let eventType = "message";
      let data = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) eventType = line.slice(7).trim();
        else if (line.startsWith("data: ")) data = line.slice(6).trim();
      }

      if (eventType === "endpoint" && data) {
        const url = new URL(data, BASE);
        this.sessionId = url.searchParams.get("sessionId");
        console.log(`[SSE] Session: ${this.sessionId}`);
        if (connectResolve) connectResolve(this.sessionId);
      } else if (eventType === "message" && data) {
        try {
          const msg = JSON.parse(data);
          if (msg.id && this.responseHandlers.has(msg.id)) {
            this.responseHandlers.get(msg.id)(msg);
            this.responseHandlers.delete(msg.id);
          }
        } catch (e) {
          console.error("[SSE] Parse error:", e.message, data.substring(0, 100));
        }
      }
    }
  }

  async send(method, params, id) {
    const body = JSON.stringify({ jsonrpc: "2.0", id: id || undefined, method, params });
    return new Promise((resolve, reject) => {
      const req = http.request(`${BASE}/messages?sessionId=${this.sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      }, (res) => {
        let out = "";
        res.on("data", (c) => (out += c));
        res.on("end", () => resolve({ status: res.statusCode, body: out }));
      });
      req.on("error", reject);
      req.end(body);
    });
  }

  async callMethod(method, params, timeoutMs = 15000) {
    const id = Math.floor(Math.random() * 1e9);
    return new Promise((resolve, reject) => {
      this.responseHandlers.set(id, resolve);
      this.send(method, params, id).catch(reject);
      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error(`Timeout after ${timeoutMs}ms for ${method}`));
        }
      }, timeoutMs);
    });
  }

  async initialize() {
    const result = await this.callMethod("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "mcp-test", version: "1.0" },
    });
    await this.send("notifications/initialized", {});
    return result;
  }

  async callTool(name, args = {}) {
    return this.callMethod("tools/call", { name, arguments: args });
  }

  async readResource(uri) {
    return this.callMethod("resources/read", { uri });
  }

  close() {
    if (this.sseRequest) this.sseRequest.destroy();
  }
}

function parseToolResult(response) {
  const text = response?.result?.content?.[0]?.text;
  if (!text) return null;
  return JSON.parse(text);
}

async function main() {
  const client = new McpSseClient();

  try {
    await client.connect();
    console.log("Connected to MCP server\n");

    const initResult = await client.initialize();
    console.log(`Server: ${initResult.result?.serverInfo?.name} v${initResult.result?.serverInfo?.version}`);
    console.log(`Tools: ${initResult.result?.capabilities?.tools ? "yes" : "no"}, Resources: ${initResult.result?.capabilities?.resources ? "yes" : "no"}\n`);

    // Test 1: List all products
    console.log("═══ Test 1: search_products (all) ═══");
    const d1 = parseToolResult(await client.callTool("search_products"));
    console.log(`  Status: ${d1?.status}`);
    console.log(`  Total: ${d1?.data?.total_results} products`);
    if (d1?.data?.products?.length > 0) {
      d1.data.products.forEach((p) => {
        const dist = p.producer?.distance_km ? ` [${p.producer.distance_km}km]` : "";
        console.log(`  • ${p.name} — ${p.price_eur}€/${p.unit} — ${p.producer?.name}${dist} — ${p.stock_status}`);
      });
    } else {
      console.log("  ⚠ NO PRODUCTS!");
      console.log(`  Message: ${d1?.message}`);
    }

    // Test 2: Search "carotte"
    console.log("\n═══ Test 2: search_products (query='carotte') ═══");
    const d2 = parseToolResult(await client.callTool("search_products", { query: "carotte" }));
    console.log(`  Status: ${d2?.status}, Results: ${d2?.data?.total_results}`);
    (d2?.data?.products || []).forEach((p) => {
      console.log(`  • ${p.name} (${p.price_eur}€)`);
    });
    if (d2?.data?.total_results === 0) console.log(`  Message: ${d2?.message}`);

    // Test 3: Search "bio"
    console.log("\n═══ Test 3: search_products (query='bio') ═══");
    const d3 = parseToolResult(await client.callTool("search_products", { query: "bio" }));
    console.log(`  Status: ${d3?.status}, Results: ${d3?.data?.total_results}`);
    (d3?.data?.products || []).forEach((p) => {
      console.log(`  • ${p.name} (${p.price_eur}€) — labels: ${(p.labels || []).join(", ") || "none"}`);
    });

    // Test 4: Delivery zone
    console.log("\n═══ Test 4: check_delivery_zone (86000 Poitiers) ═══");
    const d4 = parseToolResult(await client.callTool("check_delivery_zone", { postal_code: "86000", city: "Poitiers" }));
    console.log(`  Status: ${d4?.status}, In zone: ${d4?.data?.in_zone}`);
    console.log(`  Message: ${d4?.message}`);
    (d4?.data?.options || []).forEach((o) => console.log(`  📍 ${o.name} (${o.city}, ${o.distance_km}km)`));
    (d4?.data?.nearest_places || []).forEach((p) => console.log(`  ↗ Nearest: ${p.name} (${p.city})`));

    // Test 5: Store context
    console.log("\n═══ Test 5: resources/read (store-context) ═══");
    const r5 = await client.readResource("lacarotte://context/store");
    const contextText = r5?.result?.contents?.[0]?.text || "";
    console.log(`  Context: ${contextText.length} chars`);
    console.log(`  Preview: ${contextText.substring(0, 300)}...`);

    // Test 6: Cart (should be blocked by pre-launch)
    console.log("\n═══ Test 6: create_basket (pre-launch gating) ═══");
    const d6 = parseToolResult(await client.callTool("create_basket"));
    console.log(`  Status: ${d6?.status}`);
    console.log(`  Message: ${d6?.message?.substring(0, 150)}`);

    console.log("\n═══ All tests complete ═══");
  } catch (e) {
    console.error("Test error:", e.message);
  } finally {
    client.close();
    process.exit(0);
  }
}

main();
