// MCP SSE client test — communicates with LaCarotte MCP Server
const BASE = "http://localhost:3001";

async function main() {
  // 1. Connect to SSE and get session endpoint
  console.log("=== Connecting to SSE ===");
  const sseResponse = await fetch(`${BASE}/sse`);
  const reader = sseResponse.body.getReader();
  const decoder = new TextDecoder();

  // Read the first SSE event to get the session endpoint
  let buffer = "";
  let messagesUrl = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (buffer.includes("\n\n")) {
      const lines = buffer.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          messagesUrl = `${BASE}${line.slice(6)}`;
        }
      }
      break;
    }
  }

  console.log(`Messages URL: ${messagesUrl}`);

  // Helper: send JSON-RPC and read the SSE response
  async function sendAndReceive(payload) {
    const postPromise = fetch(messagesUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let responseBuffer = "";
    const readPromise = new Promise(async (resolve) => {
      const timeout = setTimeout(() => {
        console.log("  (timeout — no response in 8s)");
        resolve(null);
      }, 8000);
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          clearTimeout(timeout);
          resolve(null);
          break;
        }
        responseBuffer += decoder.decode(value, { stream: true });
        const events = responseBuffer.split("\n\n");
        for (const event of events) {
          const dataLine = event
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (dataLine) {
            try {
              const data = JSON.parse(dataLine.slice(6));
              if (data.id === payload.id) {
                clearTimeout(timeout);
                resolve(data);
                return;
              }
            } catch {}
          }
        }
      }
    });

    await postPromise;
    return readPromise;
  }

  // 2. Initialize
  console.log("\n=== MCP Initialize ===");
  const initResult = await sendAndReceive({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    },
  });
  if (initResult?.result) {
    console.log(
      `  Server: ${initResult.result.serverInfo?.name} v${initResult.result.serverInfo?.version}`
    );
    console.log(
      `  Protocol: ${initResult.result.protocolVersion}`
    );
    console.log(
      `  Capabilities: ${JSON.stringify(Object.keys(initResult.result.capabilities || {}))}`
    );
  } else {
    console.log("  ERROR:", JSON.stringify(initResult, null, 2));
  }

  // 3. Send initialized notification
  await fetch(messagesUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
  });
  console.log("\n=== Initialized notification sent ===");

  // 4. List tools
  console.log("\n=== List Tools ===");
  const toolsResult = await sendAndReceive({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  if (toolsResult?.result?.tools) {
    console.log(`  Found ${toolsResult.result.tools.length} tools:`);
    for (const tool of toolsResult.result.tools) {
      const desc = (tool.description || "").slice(0, 90);
      console.log(`    - ${tool.name}: ${desc}...`);
    }
  } else {
    console.log("  ERROR:", JSON.stringify(toolsResult, null, 2));
  }

  // 5. List resources
  console.log("\n=== List Resources ===");
  const resourcesResult = await sendAndReceive({
    jsonrpc: "2.0",
    id: 3,
    method: "resources/list",
    params: {},
  });
  if (resourcesResult?.result?.resources) {
    console.log(
      `  Found ${resourcesResult.result.resources.length} resources:`
    );
    for (const r of resourcesResult.result.resources) {
      console.log(`    - ${r.uri}: ${r.name}`);
    }
  } else {
    console.log("  Result:", JSON.stringify(resourcesResult, null, 2));
  }

  // 6. Call search_products
  console.log("\n=== Call search_products(query='tomate') ===");
  const searchResult = await sendAndReceive({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "search_products",
      arguments: { query: "tomate", per_page: 3 },
    },
  });
  if (searchResult?.result?.content) {
    for (const c of searchResult.result.content) {
      try {
        const parsed = JSON.parse(c.text);
        console.log(`  Status: ${parsed.status}`);
        console.log(`  Message: ${parsed.message}`);
        if (parsed.data?.products) {
          console.log(`  Products: ${parsed.data.products.length}`);
          for (const p of parsed.data.products.slice(0, 3)) {
            console.log(`    - ${p.name} (${p.price}€) [${p.stock_status}]`);
          }
        }
        if (parsed.meta) {
          console.log(`  Meta: page=${parsed.meta.page} total=${parsed.meta.total_results}`);
        }
      } catch {
        console.log(`  Raw: ${c.text.slice(0, 200)}`);
      }
    }
  } else if (searchResult?.error) {
    console.log("  ERROR:", JSON.stringify(searchResult.error, null, 2));
  } else {
    console.log("  Result:", JSON.stringify(searchResult, null, 2));
  }

  // 7. Call check_delivery_zone
  console.log("\n=== Call check_delivery_zone(postal_code='86000') ===");
  const zoneResult = await sendAndReceive({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "check_delivery_zone",
      arguments: { postal_code: "86000" },
    },
  });
  if (zoneResult?.result?.content) {
    for (const c of zoneResult.result.content) {
      try {
        const parsed = JSON.parse(c.text);
        console.log(`  Status: ${parsed.status}`);
        console.log(`  Message: ${parsed.message}`);
      } catch {
        console.log(`  Raw: ${c.text.slice(0, 200)}`);
      }
    }
  } else {
    console.log("  Result:", JSON.stringify(zoneResult, null, 2));
  }

  // 8. Call create_basket (should be blocked by pre-launch)
  console.log("\n=== Call create_basket (pre-launch gating test) ===");
  const basketResult = await sendAndReceive({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: {
      name: "create_basket",
      arguments: { user_id: "test-user", tenant_id: "poitiers.fr.la-carotte" },
    },
  });
  if (basketResult?.result?.content) {
    for (const c of basketResult.result.content) {
      try {
        const parsed = JSON.parse(c.text);
        console.log(`  Status: ${parsed.status}`);
        console.log(`  Message: ${parsed.message}`);
        if (parsed.suggestions) {
          console.log(`  Suggestions: ${JSON.stringify(parsed.suggestions)}`);
        }
      } catch {
        console.log(`  Raw: ${c.text.slice(0, 200)}`);
      }
    }
  } else {
    console.log("  Result:", JSON.stringify(basketResult, null, 2));
  }

  console.log("\n=== All tests complete ===");
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
