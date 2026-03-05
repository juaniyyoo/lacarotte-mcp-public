# LaCarotte MCP Server

Serveur MCP (Model Context Protocol) pour LaCarotte — expose le catalogue de produits locaux en circuits courts aux agents IA.

## Démarrage rapide

```bash
# Installation
npm install

# Copier la config
cp .env.example .env
# Éditer .env avec vos valeurs

# Développement
npm run dev

# Build
npm run build

# Production
npm start
```

## Architecture

```
src/
├── server.ts              # Point d'entrée — serveur MCP + Express SSE
├── config/                # Configuration centralisée
├── tools/
│   ├── catalog/           # Phase 1 — Recherche, stock, zones
│   ├── cart/              # Phase 2 — Panier persistant
│   ├── checkout/          # Checkout info
│   ├── sharing/           # Phase 2 — Partage multicanal
│   ├── loyalty/           # Phase 3 — Abonnements, alertes, surprise
│   └── analytics/         # Phase 3-4 — Dashboard
├── resources/             # Resource MCP (store-context)
├── middleware/             # Pré-lancement, rate limiting, analytics
├── services/              # Client HTTP LaCarotte, email, SMS
├── db/                    # Client MongoDB + collections
├── schemas/               # Schemas Zod
└── types/                 # Types TypeScript
```

## Tools MCP disponibles

### Phase 1 — Socle catalogue
- `search_products` — Recherche enrichie dans le catalogue
- `check_stock` — Vérification de stock en temps réel
- `check_delivery_zone` — Vérification zone de livraison
- `get_checkout_info` — Récapitulatif de panier

### Phase 2 — Commerce
- `create_basket` — Création de panier persistant
- `add_to_basket` — Ajout au panier
- `get_basket` — Consultation du panier
- `remove_from_basket` — Retrait du panier

## Endpoints

- `GET /health` — Health check
- `GET /sse` — Connexion SSE MCP
- `POST /messages` — Messages MCP

## Environnement

Voir `.env.example` pour la liste complète des variables.

## Tests

```bash
npm test
```
