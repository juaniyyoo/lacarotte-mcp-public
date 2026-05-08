/**
 * Point d'entrée du serveur MCP LaCarotte
 *
 * Expose le catalogue de produits locaux en circuits courts aux agents IA
 * via le protocole MCP (Model Context Protocol).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import config from "./config/index.js";
import { connectDb, disconnectDb } from "./db/client.js";
import { getStoreContext } from "./resources/store-context.js";

// Phase 1 — Catalog tools
import { searchProducts } from "./tools/catalog/search-products.js";
import { checkStock } from "./tools/catalog/check-stock.js";
import { checkDeliveryZone } from "./tools/catalog/check-delivery-zone.js";
import { getProduct } from "./tools/catalog/get-product.js";
import { listPartners } from "./tools/catalog/list-partners.js";
import { getCheckoutInfo } from "./tools/checkout/get-checkout-info.js";

// Phase 2 — Cart tools
import { createBasket } from "./tools/cart/create-basket.js";
import { addToBasket } from "./tools/cart/add-to-basket.js";
import { getBasket } from "./tools/cart/get-basket.js";
import { removeFromBasket } from "./tools/cart/remove-from-basket.js";

// ═══════════════════════════════════════════
// MCP Server Factory — one instance per session
// ═══════════════════════════════════════════

function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "LaCarotte — Produits Locaux Circuits Courts",
      version: "1.0.0",
    },
    {
      instructions: `Tu as accès au catalogue LaCarotte, une plateforme de vente en circuits courts.
Utilise search_products pour trouver des produits locaux (fruits, légumes, fromages, viandes, épicerie…).
Utilise check_stock pour vérifier la disponibilité avant d'ajouter au panier.
Utilise check_delivery_zone pour savoir si une adresse est livrée.
Utilise create_basket puis add_to_basket pour construire une commande.
Utilise get_checkout_info pour finaliser.
La ressource store-context donne le contexte général du magasin (producteurs, labels, zones).`,
    },
  );

// ─── Resources ───

server.resource(
  "store-context",
  "lacarotte://store-context",
  async (uri) => {
    const context = await getStoreContext();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: context,
        },
      ],
    };
  },
);

// ─── Phase 1: Catalog tools ───

server.tool(
  "search_products",
  `Recherche dans le catalogue de produits locaux LaCarotte.
QUAND L'UTILISER : l'utilisateur cherche des produits, mentionne une catégorie, un producteur, ou demande ce qui est disponible.
CE QUE C'EST : recherche enrichie avec infos producteur, labels, distance.
CE QUE CE N'EST PAS : une vérification de stock précise, ni une commande.`,
  {
    query: z.string().optional().describe("Mot-clé de recherche libre"),
    category: z.string().optional().describe("Catégorie produit"),
    producer: z.string().optional().describe("Nom du producteur"),
    label: z.string().optional().describe("Label qualité : bio, AOP, Label Rouge..."),
    price_max_eur: z.number().positive().optional().describe("Prix maximum en euros"),
    sort_by: z.enum(["pertinence", "prix_asc", "prix_desc", "distance", "fraicheur"]).optional().describe("Critère de tri"),
    page: z.number().int().positive().optional().describe("Numéro de page"),
    per_page: z.number().int().min(1).max(20).optional().describe("Résultats par page"),
    tenant_id: z.string().optional().describe("Identifiant du territoire"),
  },
  async (args) => {
    const result = await searchProducts(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  "check_stock",
  `Vérification du stock en temps réel pour un produit LaCarotte.
QUAND L'UTILISER : le client demande si un produit est en stock ou veut connaître la quantité disponible.
CE QUE C'EST : vérification temps réel du stock avec alternatives si rupture.
CE QUE CE N'EST PAS : une recherche de produit, ni une réservation.`,
  {
    product_id: z.string().describe("Identifiant du produit"),
    quantity: z.number().int().positive().optional().describe("Quantité souhaitée"),
    tenant_id: z.string().optional().describe("Identifiant du territoire"),
  },
  async (args) => {
    const result = await checkStock(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  "check_delivery_zone",
  `Vérification de la zone de livraison et des points de retrait LaCarotte.
QUAND L'UTILISER : le client demande si on livre chez lui ou quels sont les points de retrait.
CE QUE C'EST : vérification des zones couvertes avec options de retrait.
CE QUE CE N'EST PAS : une planification de livraison, ni une commande.`,
  {
    postal_code: z.string().optional().describe("Code postal"),
    city: z.string().optional().describe("Nom de la ville"),
    tenant_id: z.string().optional().describe("Identifiant du territoire"),
  },
  async (args) => {
    const result = await checkDeliveryZone(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  "get_product",
  `Fiche complète d'un produit LaCarotte par son ID.
QUAND L'UTILISER : on connaît l'ID du produit et on veut tous ses détails (prix, unité, producteur, description).
CE QUE C'EST : fiche produit complète.
CE QUE CE N'EST PAS : une recherche — utiliser search_products pour chercher par mots-clés.`,
  {
    product_id: z.string().describe("Identifiant du produit"),
    tenant_id: z.string().optional().describe("Identifiant du territoire"),
  },
  async (args) => {
    const result = await getProduct(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  "list_partners",
  `Liste des producteurs en ligne sur LaCarotte avec leurs produits disponibles et leurs phrases de présentation.
QUAND L'UTILISER : l'utilisateur veut connaître les producteurs, leurs engagements, leurs produits.
CE QUE C'EST : liste des partenaires actifs avec ID produits, phrases whyThisJob et whyCarotte.
CE QUE CE N'EST PAS : une fiche produit — utiliser get_product pour les détails d'un produit.`,
  {
    tenant_id: z.string().optional().describe("Identifiant du territoire"),
  },
  async (args) => {
    const result = await listPartners(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  "get_checkout_info",
  `Récapitulatif de panier pour le checkout LaCarotte.
QUAND L'UTILISER : le client veut voir le résumé de son panier avant paiement.
CE QUE C'EST : sous-total, articles, options de livraison, URL de paiement.
CE QUE CE N'EST PAS : une action de paiement. Ne déclenche aucune transaction.`,
  {
    basket_id: z.string().describe("Identifiant du panier"),
    tenant_id: z.string().optional().describe("Identifiant du territoire"),
  },
  async (args) => {
    const result = await getCheckoutInfo(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ─── Phase 2: Cart tools ───

server.tool(
  "create_basket",
  `Création d'un panier persistant avec lien partageable.
QUAND L'UTILISER : le client veut commencer ses courses ou créer un panier.
CE QUE C'EST : création d'un panier vide avec tokens de partage.
CE QUE CE N'EST PAS : un ajout de produit (utiliser add_to_basket ensuite).
Bloqué en pré-lancement.`,
  {
    label: z.string().max(100).optional().describe("Nom du panier"),
    tenant_id: z.string().optional().describe("Identifiant du territoire"),
  },
  async (args) => {
    const result = await createBasket(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  "add_to_basket",
  `Ajout d'un produit à un panier LaCarotte existant.
QUAND L'UTILISER : le client veut ajouter un produit à son panier.
CE QUE C'EST : ajout avec vérification de stock et snapshot du prix.
CE QUE CE N'EST PAS : une commande ni un paiement.
Bloqué en pré-lancement.`,
  {
    basket_id: z.string().describe("Identifiant du panier"),
    product_id: z.string().describe("Identifiant du produit"),
    quantity: z.number().int().positive().optional().describe("Quantité"),
    added_by: z.string().max(50).optional().describe("Prénom du participant"),
    owner_token: z.string().optional().describe("Token propriétaire"),
    tenant_id: z.string().optional().describe("Identifiant du territoire"),
  },
  async (args) => {
    const result = await addToBasket(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  "get_basket",
  `Consultation d'un panier LaCarotte.
QUAND L'UTILISER : le client veut voir le contenu de son panier.
CE QUE C'EST : liste des articles, total, statut du panier.
CE QUE CE N'EST PAS : une modification du panier.`,
  {
    basket_id: z.string().describe("Identifiant du panier"),
    share_token: z.string().optional().describe("Token de partage (lecture seule)"),
    owner_token: z.string().optional().describe("Token propriétaire (lecture/écriture)"),
    tenant_id: z.string().optional().describe("Identifiant du territoire"),
  },
  async (args) => {
    const result = await getBasket(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  "remove_from_basket",
  `Retrait d'un produit d'un panier LaCarotte.
QUAND L'UTILISER : le client veut retirer un produit de son panier.
CE QUE C'EST : suppression d'un article du panier.
CE QUE CE N'EST PAS : une annulation de commande.
Bloqué en pré-lancement.`,
  {
    basket_id: z.string().describe("Identifiant du panier"),
    product_id: z.string().describe("Identifiant du produit"),
    owner_token: z.string().describe("Token propriétaire"),
    tenant_id: z.string().optional().describe("Identifiant du territoire"),
  },
  async (args) => {
    const result = await removeFromBasket(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

  return server;
}

// ═══════════════════════════════════════════
// Express SSE Transport
// ═══════════════════════════════════════════

const app = express();
// Apply express.json() only on routes that need pre-parsed body (/mcp Streamable HTTP).
// The SSE /messages route uses handlePostMessage() which reads the raw request stream
// directly — pre-parsing the body would consume the stream and cause "stream is not readable".
app.use((req, res, next) => {
  if (req.path === "/messages") return next();
  express.json()(req, res, next);
});

// ─── CORS — serveur public, tous clients MCP autorisés ───
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, Mcp-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

const transports: Map<string, SSEServerTransport> = new Map();
// Transport Streamable HTTP stateful (sessions)
const streamableTransports: Map<string, StreamableHTTPServerTransport> = new Map();

// ─── Quota : connexions SSE concurrentes ───
let activeConnections = 0;
const MAX_CONCURRENT_CONNECTIONS = parseInt(process.env.MCP_MAX_CONNECTIONS ?? "15", 10);

// ─── Quota : rate limiting par IP sur /messages ───
const ipStore = new Map<string, { count: number; resetAt: number }>();
const IP_MAX_REQUESTS = parseInt(process.env.MCP_IP_MAX_REQUESTS ?? "20", 10);
const IP_WINDOW_MS = 60_000;

// Nettoyage périodique de l'IP store (toutes les 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of ipStore) {
    if (now >= entry.resetAt) ipStore.delete(key);
  }
}, 5 * 60_000).unref();

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "lacarotte-mcp",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// ─── Streamable HTTP transport (Claude.ai, clients modernes) ───

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  let transport: StreamableHTTPServerTransport;

  if (sessionId && streamableTransports.has(sessionId)) {
    transport = streamableTransports.get(sessionId)!;
  } else if (!sessionId) {
    // Nouvelle session
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        streamableTransports.set(sid, transport);
      },
    });
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) streamableTransports.delete(sid);
    };
    const mcpServer = createMcpServer();
    await mcpServer.connect(transport);
  } else {
    res.status(404).json({ error: "Session inconnue" });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !streamableTransports.has(sessionId)) {
    res.status(400).json({ error: "Session ID requis" });
    return;
  }
  const transport = streamableTransports.get(sessionId)!;
  await transport.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !streamableTransports.has(sessionId)) {
    res.status(404).json({ error: "Session inconnue" });
    return;
  }
  const transport = streamableTransports.get(sessionId)!;
  await transport.handleRequest(req, res);
  streamableTransports.delete(sessionId);
});

app.get("/sse", async (req, res) => {
  if (activeConnections >= MAX_CONCURRENT_CONNECTIONS) {
    res.status(503).json({
      error: "Serveur saturé — trop de connexions actives. Réessayez dans quelques instants.",
      active_connections: activeConnections,
      max_connections: MAX_CONCURRENT_CONNECTIONS,
    });
    return;
  }

  activeConnections++;
  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);

  res.on("close", () => {
    transports.delete(transport.sessionId);
    activeConnections--;
  });

  const mcpServer = createMcpServer();
  await mcpServer.connect(transport);
});

app.post("/messages", async (req, res) => {
  // Rate limiting par IP
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim()
    ?? req.socket.remoteAddress
    ?? "unknown";
  const now = Date.now();
  const ipEntry = ipStore.get(ip);
  if (!ipEntry || now >= ipEntry.resetAt) {
    ipStore.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
  } else if (ipEntry.count >= IP_MAX_REQUESTS) {
    const retryAfter = Math.ceil((ipEntry.resetAt - now) / 1000);
    res.status(429).json({
      error: "Trop de requêtes — quota par minute atteint.",
      retry_after_seconds: retryAfter,
    });
    return;
  } else {
    ipEntry.count++;
  }

  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);

  if (!transport) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  await transport.handlePostMessage(req, res);
});

// ═══════════════════════════════════════════
// Startup
// ═══════════════════════════════════════════

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  LaCarotte MCP Server");
  console.log("  Produits locaux en circuits courts");
  console.log("═══════════════════════════════════════════");

  // Connect to MongoDB
  try {
    await connectDb();
  } catch (error) {
    console.error("[MCP] MongoDB connection failed:", error);
    console.warn("[MCP] Starting without database — some features will be limited");
  }

  const port = config.server.port;

  app.listen(port, () => {
    console.log(`[MCP] Server running on http://localhost:${port}`);
    console.log(`[MCP] SSE endpoint: http://localhost:${port}/sse`);
    console.log(`[MCP] Health check: http://localhost:${port}/health`);
    console.log(`[MCP] Transport: SSE`);
    console.log(
      `[MCP] Launch date: ${config.launch.date.toLocaleDateString("fr-FR")}`,
    );
    console.log(
      `[MCP] Pre-launch mode: ${new Date() < config.launch.date ? "ACTIVE" : "OFF"}`,
    );
    console.log("═══════════════════════════════════════════");
  });
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[MCP] Shutting down...");
  await disconnectDb();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[MCP] Shutting down...");
  await disconnectDb();
  process.exit(0);
});

main().catch((error) => {
  console.error("[MCP] Fatal error:", error);
  process.exit(1);
});
