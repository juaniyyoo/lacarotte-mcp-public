// Conversational test — simulate casual user questions via MCP tools
// Tests: proximity, farmers, what is La Carotte, who created it, etc.
const BASE = "http://localhost:3001";

async function main() {
  // Connect SSE
  const sseResponse = await fetch(`${BASE}/sse`);
  const reader = sseResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let messagesUrl = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (buffer.includes("\n\n")) {
      for (const line of buffer.split("\n")) {
        if (line.startsWith("data: ")) messagesUrl = `${BASE}${line.slice(6)}`;
      }
      break;
    }
  }

  let reqId = 0;

  async function sendAndReceive(payload) {
    const postPromise = fetch(messagesUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let responseBuffer = "";
    const readPromise = new Promise(async (resolve) => {
      const timeout = setTimeout(() => resolve(null), 10000);
      while (true) {
        const { value, done } = await reader.read();
        if (done) { clearTimeout(timeout); resolve(null); break; }
        responseBuffer += decoder.decode(value, { stream: true });
        for (const event of responseBuffer.split("\n\n")) {
          const dataLine = event.split("\n").find((l) => l.startsWith("data: "));
          if (dataLine) {
            try {
              const data = JSON.parse(dataLine.slice(6));
              if (data.id === payload.id) { clearTimeout(timeout); resolve(data); return; }
            } catch {}
          }
        }
      }
    });
    await postPromise;
    return readPromise;
  }

  async function callTool(name, args, scenario) {
    reqId++;
    console.log(`\n${"─".repeat(60)}`);
    console.log(`🧑 "${scenario}"`);
    console.log(`   → ${name}(${JSON.stringify(args)})`);
    const result = await sendAndReceive({
      jsonrpc: "2.0", id: reqId, method: "tools/call",
      params: { name, arguments: args },
    });
    if (result?.result?.content) {
      for (const c of result.result.content) {
        try {
          const p = JSON.parse(c.text);
          console.log(`   Status: ${p.status}`);
          console.log(`   Message: ${p.message}`);
          if (p.data?.products?.length > 0) {
            console.log(`   📦 Products (${p.data.products.length}):`);
            for (const prod of p.data.products.slice(0, 5)) {
              console.log(`      • ${prod.name} — ${prod.price ?? "?"}€ [stock: ${prod.stock_status}] ${prod.producer_name ? `par ${prod.producer_name}` : ""} ${prod.distance_km ? `(${prod.distance_km}km)` : ""}`);
            }
          }
          if (p.data?.places?.length > 0) {
            console.log(`   📍 Places (${p.data.places.length}):`);
            for (const pl of p.data.places.slice(0, 5)) {
              console.log(`      • ${pl.name || pl.city || "?"} (${pl.postal_code || "?"}) ${pl.distance_km ? `— ${pl.distance_km}km` : ""}`);
            }
          }
          if (p.data?.delivery_info) {
            console.log(`   🚚 Delivery:`, JSON.stringify(p.data.delivery_info));
          }
          if (p.suggestions?.length > 0) {
            console.log(`   💡 ${p.suggestions.join(" | ")}`);
          }
          if (p.meta) {
            console.log(`   📊 Meta: total=${p.meta.total_results}, page=${p.meta.page}`);
          }
        } catch {
          console.log(`   Raw: ${c.text.slice(0, 500)}`);
        }
      }
    } else if (result?.error) {
      console.log(`   ❌ Error: ${JSON.stringify(result.error)}`);
    } else {
      console.log(`   ⏱️ Timeout`);
    }
  }

  async function readResource(uri, scenario) {
    reqId++;
    console.log(`\n${"─".repeat(60)}`);
    console.log(`🧑 "${scenario}"`);
    console.log(`   → Resource: ${uri}`);
    const result = await sendAndReceive({
      jsonrpc: "2.0", id: reqId, method: "resources/read",
      params: { uri },
    });
    if (result?.result?.contents) {
      for (const c of result.result.contents) {
        console.log(`   📝 (${(c.text||"").length} chars):`);
        console.log(`   ${(c.text||"").slice(0, 800).replace(/\n/g, "\n   ")}`);
      }
    } else if (result?.error) {
      console.log(`   ❌ Error: ${JSON.stringify(result.error)}`);
    } else {
      console.log(`   ⏱️ Timeout`);
    }
  }

  // Initialize
  await sendAndReceive({
    jsonrpc: "2.0", id: ++reqId, method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "convo-tester", version: "1.0.0" } }
  });
  await fetch(messagesUrl, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  console.log("✅ MCP session ready\n");
  console.log("═".repeat(60));
  console.log("  CONVERSATIONAL TESTS — La Carotte MCP Server");
  console.log("═".repeat(60));

  // ─── 1. STORE CONTEXT — "Who is La Carotte?" ───
  await readResource("lacarotte://store-context",
    "C'est quoi La Carotte ? Qui l'a créé ?");

  // ─── 2. PROXIMITY — "What's near me in Poitiers?" ───
  await callTool("check_delivery_zone", { postal_code: "86000", city: "Poitiers" },
    "Je suis à Poitiers (86000), vous livrez chez moi ?");

  // ─── 3. PROXIMITY — nearby villages ───
  await callTool("check_delivery_zone", { postal_code: "86360", city: "Chasseneuil-du-Poitou" },
    "Et Chasseneuil-du-Poitou (86360), c'est dans votre zone ?");

  // ─── 4. PROXIMITY — far away city ───
  await callTool("check_delivery_zone", { postal_code: "33000", city: "Bordeaux" },
    "Vous livrez à Bordeaux ?");

  // ─── 5. BROWSE PRODUCTS — "What do you sell?" ───
  await callTool("search_products", { per_page: 10 },
    "Montrez-moi ce que vous vendez");

  // ─── 6. SEARCH — "I want carrots" ───
  await callTool("search_products", { query: "carotte" },
    "Vous avez des carottes ?");

  // ─── 7. SEARCH — specific product type ───
  await callTool("search_products", { query: "conserve" },
    "Qu'est-ce que vous avez en conserve ?");

  // ─── 8. FARMERS — "Who are your producers?" ───
  await callTool("search_products", { per_page: 20 },
    "Quels sont vos producteurs ?");

  // ─── 9. SEARCH — local honey ───
  await callTool("search_products", { query: "miel" },
    "Vous avez du miel local ?");

  // ─── 10. SEARCH — seasonal fruits ───
  await callTool("search_products", { query: "fruit" },
    "Qu'est-ce que vous avez comme fruits de saison ?");

  // ─── 11. SEARCH — eggs ───
  await callTool("search_products", { query: "oeuf" },
    "Des oeufs de poules élevées en plein air ?");

  // ─── 12. PRICE — cheap stuff ───
  await callTool("search_products", { max_price: 3, per_page: 5 },
    "Qu'est-ce que je peux acheter à moins de 3€ ?");

  // ─── 13. PRICE — expensive stuff ───
  await callTool("search_products", { min_price: 10, per_page: 5 },
    "Vos produits premium au-dessus de 10€ ?");

  // ─── 14. STOCK — check specific product ───
  await callTool("check_stock", { product_id: "some-id", quantity: 1 },
    "Il reste des tomates en stock ?");

  // ─── 15. DELIVERY — very rural area ───
  await callTool("check_delivery_zone", { postal_code: "86800", city: "Saint-Julien-l'Ars" },
    "Saint-Julien-l'Ars (86800), c'est dans votre périmètre ?");

  // ─── 16. DELIVERY — Paris ───
  await callTool("check_delivery_zone", { postal_code: "75001", city: "Paris" },
    "Et Paris, un jour peut-être ?");

  // ─── 17. CART — try to order (pre-launch) ───
  await callTool("create_basket", { user_id: "curious-user", tenant_id: ".fr.la-carotte" },
    "Je veux commander, c'est possible ?");

  // ─── 18. CART — add to basket (pre-launch) ───
  await callTool("add_to_basket", { basket_id: "test", product_id: "test", quantity: 1 },
    "Ajoutez des carottes à mon panier");

  // ─── 19. CHECKOUT — try to checkout (pre-launch) ───
  await callTool("get_checkout_info", { basket_id: "test" },
    "Je veux voir mon récapitulatif de commande");

  console.log(`\n${"═".repeat(60)}`);
  console.log("🏁 All conversational tests complete!");
  console.log("═".repeat(60));
  process.exit(0);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
