const http = require("http");

const BASE = "http://localhost:3001";

console.log("=== MCP SSE Diagnostic Test ===");
console.log("Connecting to SSE...");

const sseReq = http.get(`${BASE}/sse`, (res) => {
  console.log("SSE status:", res.statusCode);
  res.setEncoding("utf8");
  
  let sessionId = null;
  let buffer = "";
  
  res.on("data", (chunk) => {
    buffer += chunk;
    
    // Split on double newline (SSE event boundary)
    const events = buffer.split("\n\n");
    buffer = events.pop(); // keep incomplete
    
    for (const event of events) {
      console.log("SSE event:", JSON.stringify(event));
      
      // Parse event
      const lines = event.split("\n");
      let type = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) type = line.slice(7);
        if (line.startsWith("data: ")) data = line.slice(6);
      }
      
      if (type === "endpoint" && data && !sessionId) {
        const url = new URL(data, BASE);
        sessionId = url.searchParams.get("sessionId");
        console.log("Got session:", sessionId);
        
        // Start the protocol
        doProtocol(sessionId);
      }
      
      if (type === "message" && data) {
        try {
          const msg = JSON.parse(data);
          console.log("SSE response id=" + msg.id + ":", JSON.stringify(msg).substring(0, 500));
          
          // If this is the tools/call response (id=2)
          if (msg.id === 2) {
            const toolText = msg.result?.content?.[0]?.text;
            if (toolText) {
              const toolData = JSON.parse(toolText);
              console.log("\n=== SEARCH RESULTS ===");
              console.log("Status:", toolData.status);
              console.log("Total:", toolData.data?.total_results, "products");
              console.log("Message:", toolData.message);
              if (toolData.data?.products) {
                toolData.data.products.forEach((p) => {
                  console.log("  •", p.name, "|", p.price_eur + "€/" + p.unit, "|", p.producer?.name, "|", p.stock_status);
                });
              }
            }
            
            // Done - exit after a delay
            setTimeout(() => process.exit(0), 500);
          }
        } catch (e) {
          console.log("Parse error:", e.message);
        }
      }
    }
  });
});

sseReq.on("error", (e) => {
  console.error("SSE connection error:", e.message);
  process.exit(1);
});

function postMsg(sessionId, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${BASE}/messages?sessionId=${sessionId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    }, (res) => {
      let out = "";
      res.on("data", (c) => out += c);
      res.on("end", () => {
        console.log("POST", body.method || body.id, "→", res.statusCode);
        resolve({ status: res.statusCode, body: out });
      });
    });
    req.on("error", reject);
    req.end(data);
  });
}

async function doProtocol(sid) {
  try {
    // Initialize
    await postMsg(sid, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "diag-test", version: "1.0" },
      },
    });
    
    // Notify
    await postMsg(sid, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    });
    
    // Call search_products
    console.log("\nCalling search_products...");
    await postMsg(sid, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "search_products",
        arguments: {},
      },
    });
    
    console.log("Waiting for response via SSE stream...");
  } catch (e) {
    console.error("Protocol error:", e.message);
    process.exit(1);
  }
}

// Safety timeout
setTimeout(() => {
  console.log("Timeout - exiting");
  process.exit(1);
}, 30000);
