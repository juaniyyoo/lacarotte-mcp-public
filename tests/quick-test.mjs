// Quick test — does the MCP server return actual products from the API?
const BASE = "http://localhost:3001";

async function main() {
  const sse = await fetch(`${BASE}/sse`);
  const reader = sse.body.getReader();
  const dec = new TextDecoder();
  let buf = "", url = "";
  while (true) {
    const { value } = await reader.read();
    buf += dec.decode(value, { stream: true });
    if (buf.includes("\n\n")) {
      for (const l of buf.split("\n"))
        if (l.startsWith("data: ")) url = BASE + l.slice(6);
      break;
    }
  }

  let id = 0;
  async function rpc(payload) {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return new Promise(async (resolve) => {
      const t = setTimeout(() => resolve(null), 10000);
      let b = "";
      while (true) {
        const { value } = await reader.read();
        b += dec.decode(value, { stream: true });
        for (const ev of b.split("\n\n")) {
          const dl = ev.split("\n").find((l) => l.startsWith("data: "));
          if (dl) {
            try {
              const j = JSON.parse(dl.slice(6));
              if (j.id === payload.id) {
                clearTimeout(t);
                resolve(j);
                return;
              }
            } catch {}
          }
        }
      }
    });
  }

  // Initialize
  await rpc({
    jsonrpc: "2.0",
    id: ++id,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "quick-test", version: "1.0.0" },
    },
  });
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });

  console.log("=== Testing search_products (all products) ===");
  const r1 = await rpc({
    jsonrpc: "2.0",
    id: ++id,
    method: "tools/call",
    params: { name: "search_products", arguments: { per_page: 20 } },
  });
  printResult(r1);

  console.log("\n=== Testing search_products (query='carotte') ===");
  const r2 = await rpc({
    jsonrpc: "2.0",
    id: ++id,
    method: "tools/call",
    params: { name: "search_products", arguments: { query: "carotte" } },
  });
  printResult(r2);

  console.log("\n=== Testing check_delivery_zone (86000 Poitiers) ===");
  const r3 = await rpc({
    jsonrpc: "2.0",
    id: ++id,
    method: "tools/call",
    params: { name: "check_delivery_zone", arguments: { postal_code: "86000", city: "Poitiers" } },
  });
  printResult(r3);

  process.exit(0);
}

function printResult(r) {
  if (!r?.result?.content?.[0]?.text) {
    console.log("  No content:", JSON.stringify(r));
    return;
  }
  try {
    const p = JSON.parse(r.result.content[0].text);
    console.log(`  Status: ${p.status}`);
    console.log(`  Message: ${p.message}`);
    if (p.data?.products) {
      console.log(`  Products: ${p.data.products.length}`);
      for (const x of p.data.products.slice(0, 8)) {
        console.log(
          `    - ${x.name} | ${x.price ?? "?"}€ | stock: ${x.stock_status} | ${x.producer_name || ""} | ${x.distance_km ? x.distance_km + "km" : ""}`
        );
      }
    }
    if (p.data?.places) {
      console.log(`  Places: ${p.data.places.length}`);
      for (const pl of p.data.places.slice(0, 5)) {
        console.log(`    - ${pl.name || pl.city} (${pl.postal_code})`);
      }
    }
  } catch {
    console.log("  Raw:", r.result.content[0].text.slice(0, 300));
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
