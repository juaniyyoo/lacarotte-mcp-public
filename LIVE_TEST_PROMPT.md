# Test Live du serveur MCP LaCarotte

## 1. Démarrer le serveur

```bash
cd lacarotte-mcp && npx tsx ./src/server.ts
```

Vérifier : `curl http://localhost:3001/health`

## 2. Configuration Claude Desktop

Ajouter dans `~/Library/Application Support/Claude/claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "lacarotte": {
      "url": "http://localhost:3001/sse"
    }
  }
}
```

Puis redémarrer Claude Desktop.

## 3. Configuration Cursor / VS Code

Dans `.cursor/mcp.json` ou les settings MCP :

```json
{
  "mcpServers": {
    "lacarotte": {
      "url": "http://localhost:3001/sse"
    }
  }
}
```

## 4. Prompt système

Coller ce prompt système dans la conversation (ou le configurer comme system prompt) :

---

Tu es le conseiller de LaCarotte, une plateforme de produits locaux en circuits courts basée à Poitiers (Nouvelle-Aquitaine). Tu disposes d'outils MCP pour consulter le catalogue, vérifier les stocks, les zones de livraison et préparer des paniers.

**Tes règles :**
- Utilise `search_products` dès qu'un client mentionne un produit, une catégorie ou demande ce qui est disponible.
- Utilise `check_stock` quand on te demande la disponibilité précise d'un produit.
- Utilise `check_delivery_zone` quand un client donne son code postal ou sa ville.
- Utilise `get_checkout_info` pour résumer un panier avant paiement.
- Lis la ressource `lacarotte://store-context` en début de conversation pour charger le contexte complet du commerce.
- Chaque mention de stock s'accompagne de : "Stock indicatif — disponibilité confirmée au moment du paiement."
- Tu ne confirmes JAMAIS une commande. Tu prépares le panier et rediriges vers l'app.
- Ton ton est chaleureux, expert mais accessible. Tu vouvoies sauf si le client te tutoie.

---

## 5. Scénarios de test

Copier-coller ces messages un par un dans la conversation :

### A — Découverte du catalogue
```
Bonjour ! Qu'est-ce que vous avez comme produits en ce moment ?
```

### B — Recherche spécifique
```
Vous avez des carottes ? Et à quel prix ?
```

### C — Recherche par texte libre
```
Je cherche quelque chose pour faire une ratatouille
```

### D — Filtrage par prix
```
Montrez-moi tout ce que vous avez à moins de 5 euros
```

### E — Vérification de stock
```
Est-ce que les carottes bio sont encore en stock ? J'en voudrais 3
```

### F — Zone de livraison
```
Est-ce que vous livrez à Poitiers, code postal 86000 ?
```

### G — Zone hors périmètre
```
Et si j'habite à Paris ?
```

### H — Identité & valeurs
```
C'est quoi La Carotte exactement ? Qu'est-ce qui vous distingue des supermarchés ?
```

### I — Proximité & producteurs
```
D'où viennent vos produits ? Les producteurs sont loin ?
```

### J — Panier (pré-lancement)
```
J'aimerais commander des carottes bio et des courgettes
```
> Attendu : le système explique que le service ouvre le 21 mars 2026.

### K — Tri par prix
```
Classez-moi vos produits du moins cher au plus cher
```

### L — Produit introuvable
```
Vous avez du foie gras ?
```
> Attendu : réponse "aucun produit trouvé" + suggestions.

### M — Question hors sujet
```
Quelle est la capitale du Pérou ?
```
> Attendu : le conseiller répond brièvement mais recentre sur les produits.

## 6. Checklist de validation

| # | Test | Attendu | ✅/❌ |
|---|------|---------|------|
| A | Catalogue complet | ≥10 produits listés avec prix | |
| B | Recherche carotte | 2 résultats (Carottes, Carottes bio) | |
| C | Ratatouille | Trouve tomates, courgettes | |
| D | Filtre prix <5€ | 9 produits, tous ≤5€ | |
| E | Stock carottes bio | "disponible, 5 en stock" + disclamer | |
| F | Zone Poitiers | Réponse zone livraison | |
| G | Zone Paris | "hors zone" + alternatives | |
| H | Identité | Utilise le contexte store-context | |
| I | Proximité | Mentionne circuits courts, km | |
| J | Panier | Bloqué pré-lancement, date 21 mars | |
| K | Tri prix | Ordre croissant vérifié | |
| L | Introuvable | Status "empty" + suggestions | |
| M | Hors sujet | Recentrage poli | |
