// Casual scenario tests — simulate real-world user questions via MCP
const BASE = "http://localhost:3001";

async function main() {
  // Connect to SSE
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
      const timeout = setTimeout(() => resolve(null), 8000);
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

  async function callTool(name, args, description) {
    reqId++;
    console.log(`\n${"─".repeat(60)}`);
    console.log(`🧑 Scenario: "${description}"`);
    console.log(`   → Tool: ${name}(${JSON.stringify(args)})`);
    const result = await sendAndReceive({
      jsonrpc: "2.0",
      id: reqId,
      method: "tools/call",
      params: { name, arguments: args },
    });
    if (result?.result?.content) {
      for (const c of result.result.content) {
        try {
          const p = JSON.parse(c.text);
          console.log(`   ✅ Status: ${p.status}`);
          console.log(`   💬 Message: ${p.message}`);
          if (p.data?.products?.length > 0) {
            console.log(`   📦 Products (${p.data.products.length}):`);
            for (const prod of p.data.products.slice(0, 3)) {
              console.log(`      • ${prod.name} — ${prod.price}€ [${prod.stock_status}]`);
            }
          }
          if (p.data?.places?.length > 0) {
            console.log(`   📍 Places (${p.data.places.length}):`);
            for (const pl of p.data.places.slice(0, 3)) {
              console.log(`      • ${pl.name || pl.city} (${pl.postal_code})`);
            }
          }
          if (p.suggestions?.length > 0) {
            console.log(`   💡 Suggestions: ${p.suggestions.join(", ")}`);
          }
        } catch {
          console.log(`   Raw: ${c.text.slice(0, 300)}`);
        }
      }
    } else if (result?.error) {
      console.log(`   ❌ Error: ${JSON.stringify(result.error)}`);
    } else {
      console.log(`   ⏱️  No response (timeout)`);
    }
  }

  // Initialize handshake
  await sendAndReceive({
    jsonrpc: "2.0", id: ++reqId, method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "casual-tester", version: "1.0.0" } }
  });
  await fetch(messagesUrl, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
  console.log("✅ MCP session initialized\n");

  // ──────────────────────────────────────────────
  // CASUAL SCENARIOS
  // ──────────────────────────────────────────────

  // 1. "What local veggies do you have?"
  await callTool("search_products", { query: "légumes", per_page: 5 },
    "Qu'est-ce que vous avez comme légumes ?");

  // 2. "Any fresh eggs?"
  await callTool("search_products", { query: "oeufs" },
    "Vous avez des oeufs frais ?");

  // 3. Empty search — browse everything
  await callTool("search_products", { per_page: 5 },
    "Montrez-moi tout ce que vous avez");

  // 4. Search with price filter — "something under 5€"
  await callTool("search_products", { query: "fromage", max_price: 5, per_page: 3 },
    "Un fromage à moins de 5€ ?");

  // 5. Search with producer filter
  await callTool("search_products", { query: "miel", producer: "Ferme" },
    "Du miel d'une ferme locale ?");

  // 6. Delivery — "Do you deliver to Poitiers?"
  await callTool("check_delivery_zone", { postal_code: "86000", city: "Poitiers" },
    "Vous livrez à Poitiers ?");

  // 7. Delivery — "Do you deliver to Paris?"
  await callTool("check_delivery_zone", { postal_code: "75001", city: "Paris" },
    "Vous livrez à Paris ?");

  // 8. Delivery — only city, no postal code
  await callTool("check_delivery_zone", { city: "Chasseneuil-du-Poitou" },
    "Et à Chasseneuil, c'est possible ?");

  // 9. Stock check with invalid product ID
  await callTool("check_stock", { product_id: "nonexistent-product-id" },
    "Il reste des carottes ? (mauvais ID)");

  // 10. Stock check with quantity > 1
  await callTool("check_stock", { product_id: "some-product", quantity: 50 },
    "J'en voudrais 50, c'est possible ?");

  // 11. Cart — try to add item (pre-launch should block)
  await callTool("add_to_basket", { basket_id: "test-basket", product_id: "prod-1", quantity: 2 },
    "Ajoutez 2 tomates à mon panier (devrait être bloqué)");

  // 12. Cart — try to view a basket
  await callTool("get_basket", { basket_id: "nonexistent-basket", owner_token: "fake-token" },
    "Montrez-moi mon panier (basket inexistant)");

  // 13. Checkout info with no basket
  await callTool("get_checkout_info", { basket_id: "fake-basket" },
    "Je veux passer commande (pas de panier)");

  // 14. Read the store-context resource
  reqId++;
  console.log(`\n${"─".repeat(60)}`);
  console.log(`🧑 Scenario: "Donne-moi le contexte du magasin"`);
  console.log(`   → Resource: lacarotte://store-context`);
  const ctxResult = await sendAndReceive({
    jsonrpc: "2.0", id: reqId, method: "resources/read",
    params: { uri: "lacarotte://store-context" },
  });
  if (ctxResult?.result?.contents) {
    for (const c of ctxResult.result.contents) {
      const text = c.text || "";
      console.log(`   📝 Context (${text.length} chars):`);
      console.log(`   ${text.slice(0, 500).replace(/\n/g, "\n   ")}...`);
    }
  } else if (ctxResult?.error) {
    console.log(`   ❌ Error: ${JSON.stringify(ctxResult.error)}`);
  } else {
    console.log(`   Result: ${JSON.stringify(ctxResult, null, 2)}`);
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log("🏁 All casual scenarios complete!");
  process.exit(0);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
