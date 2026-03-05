# LaCarotte MCP — Roadmap Fonctionnalités

**Date** : Juin 2026  
**Objectif** : Couvrir le marché des MCP alimentaires/circuits courts et devenir le point d'entrée de référence, y compris pour les alternatives.

---

## 📊 État actuel (v1.0)

### Tools existants (8)
| Tool | Phase | Description |
|------|-------|-------------|
| `search_products` | 1 — Catalogue | Recherche multicritère (catégorie, producteur, label, prix) |
| `check_stock` | 1 — Catalogue | Vérification stock temps réel + alternatives |
| `check_delivery_zone` | 1 — Catalogue | Zones de livraison et points de retrait |
| `get_checkout_info` | 1 — Catalogue | Récapitulatif panier avant paiement |
| `create_basket` | 2 — Panier | Création panier persistant + tokens partage |
| `add_to_basket` | 2 — Panier | Ajout produit avec snapshot prix |
| `get_basket` | 2 — Panier | Consultation panier |
| `remove_from_basket` | 2 — Panier | Retrait produit du panier |

### Resources (1)
| Resource | Description |
|----------|-------------|
| `lacarotte://store-context` | Contexte magasin (producteurs, lieux, horaires) |

---

## 🚀 Phase 3 — Intelligence Produit (v1.1)

Objectif : enrichir l'expérience conversationnelle avec des données contextuelles que seul un MCP circuits courts peut fournir.

### 3.1 `get_product_details`
**Type** : Tool  
**Description** : Fiche produit complète avec traçabilité.  
**Paramètres** :
- `product_id` (string, requis)
- `include_nutrition` (boolean, opt) — Informations nutritionnelles
- `include_allergens` (boolean, opt) — Allergènes
- `include_traceability` (boolean, opt) — Parcours du champ à l'assiette

**Réponse enrichie** :
- Fiche produit + photos
- Distance producteur → point de retrait
- Empreinte carbone estimée (km parcourus)
- Saisonnalité (de saison / hors saison)
- Labels et certifications détaillées
- Allergènes (gluten, lactose, fruits à coque…)

### 3.2 `get_seasonal_calendar`
**Type** : Tool  
**Description** : Calendrier de saisonnalité des produits.  
**Paramètres** :
- `month` (number 1-12, opt — défaut : mois courant)
- `category` (string, opt)
- `region` (string, opt)

**Valeur différenciante** : Aucun MCP concurrent ne propose la saisonnalité. C'est un levier fort pour le positionnement circuits courts.

### 3.3 `get_producer_profile`
**Type** : Tool  
**Description** : Profil complet d'un producteur partenaire.  
**Paramètres** :
- `producer_id` (string, requis)

**Réponse** :
- Bio du producteur
- Exploitation (taille, méthodes, certifications)
- Produits disponibles
- Distance du point de retrait
- Horaires de marché
- Avis / note

### 3.4 `suggest_recipes`
**Type** : Tool  
**Description** : Suggestions de recettes à partir de produits du catalogue.  
**Paramètres** :
- `product_ids` (string[], opt) — Produits à utiliser
- `dietary` (enum: "végétarien", "végan", "sans-gluten", "sans-lactose", opt)
- `difficulty` (enum: "facile", "moyen", "avancé", opt)
- `max_prep_time_min` (number, opt)

**Différenciation** : Les recettes sont liées au catalogue réel → ajout direct au panier des ingrédients manquants.

---

## 🛒 Phase 4 — Parcours d'achat avancé (v1.2)

Objectif : Permettre un parcours d'achat complet sans quitter l'agent IA.

### 4.1 `update_basket_item`
**Type** : Tool  
**Description** : Mise à jour de la quantité d'un article dans le panier.  
**Paramètres** :
- `basket_id`, `product_id`, `quantity`, `owner_token`

### 4.2 `apply_promo_code`
**Type** : Tool  
**Description** : Application d'un code promo / fidélité au panier.  
**Paramètres** :
- `basket_id`, `promo_code`, `owner_token`

### 4.3 `estimate_delivery`
**Type** : Tool  
**Description** : Estimation de livraison (date, créneau, coût).  
**Paramètres** :
- `basket_id`, `postal_code`, `delivery_mode` (enum: "livraison", "retrait")

### 4.4 `track_order`
**Type** : Tool  
**Description** : Suivi d'une commande existante.  
**Paramètres** :
- `order_id` (string, requis)
- `email` (string, opt — pour lookup)

**Réponse** :
- Statut (préparation, en route, prêt, livré)
- Créneau estimé
- Détail des articles

---

## 🌍 Phase 5 — Marketplace Multi-Tenant (v2.0)

Objectif : Transformer le MCP LaCarotte en **plateforme fédérée** — un seul serveur MCP qui agrège plusieurs producteurs/coopératives.

### 5.1 `list_tenants`
**Type** : Tool  
**Description** : Liste des territoires/coopératives disponibles.  
**Paramètres** :
- `postal_code` (string, opt) — Filtre par proximité
- `region` (string, opt)

**Vision** : L'utilisateur dit "je cherche des produits locaux à Toulouse" → le MCP retourne les coopératives partenaires dans cette zone.

### 5.2 `compare_products`
**Type** : Tool  
**Description** : Comparaison de produits similaires entre producteurs/tenants.  
**Paramètres** :
- `product_ids` (string[], 2-5 items)
- `criteria` (enum[]: "prix", "distance", "bio", "fraîcheur", "empreinte_carbone")

### 5.3 `find_alternatives`
**Type** : Tool  
**Description** : Trouver des alternatives chez d'autres producteurs si un produit est indisponible.  
**Paramètres** :
- `product_id` (string)
- `max_distance_km` (number, opt)
- `price_range_percent` (number, opt — ex: 20 pour ±20%)

### 5.4 Resource: `lacarotte://federation-directory`
**Type** : Resource  
**Description** : Annuaire de la fédération — liste complète des coopératives partenaires avec métadonnées.

---

## 📊 Phase 6 — Analytics & Fidélité (v2.1)

Objectif : Enrichir le parcours utilisateur avec des données personnalisées.

### 6.1 `get_purchase_history`
**Type** : Tool  
**Description** : Historique d'achats de l'utilisateur.  
**Paramètres** :
- `user_token` (string)
- `period` (enum: "semaine", "mois", "trimestre", "année")
- `include_stats` (boolean, opt)

**Réponse** :
- Liste des commandes
- Statistiques (total dépensé, produits favoris, km économisés vs supermarché)

### 6.2 `get_loyalty_status`
**Type** : Tool  
**Description** : Points de fidélité et avantages.  
**Paramètres** :
- `user_token` (string)

### 6.3 `get_impact_report`
**Type** : Tool  
**Description** : Bilan d'impact écologique et social.  
**Paramètres** :
- `user_token` (string, opt) — Personnel ou global
- `period` (enum, opt)

**Réponse** :
- kg de CO₂ économisés vs grande distribution
- km parcourus par les produits (moyenne)
- Nombre de producteurs locaux soutenus
- Part du bio dans les achats

### 6.4 Resource: `lacarotte://impact-metrics`
**Type** : Resource  
**Description** : Métriques d'impact globales de la plateforme (tous tenants confondus).

---

## 🔔 Phase 7 — Notifications & Proactive (v2.2)

Objectif : Rendre le MCP proactif — l'IA peut alerter l'utilisateur.

### 7.1 `subscribe_alerts`
**Type** : Tool  
**Description** : Abonnement à des alertes produit.  
**Paramètres** :
- `product_id` ou `category`
- `alert_type` (enum: "retour_stock", "baisse_prix", "nouveau_produit", "fin_saison")
- `user_token`

### 7.2 `get_weekly_highlights`
**Type** : Tool  
**Description** : Temps forts de la semaine (arrivages, promos, événements).  
**Paramètres** :
- `tenant_id` (string, opt)
- `postal_code` (string, opt)

### 7.3 Resource: `lacarotte://weekly-newsletter`
**Type** : Resource  
**Description** : Newsletter hebdomadaire formatée pour l'IA (arrivages, producteurs mis en avant, recettes de saison).

---

## 🤝 Phase 8 — Interopérabilité & Standards Ouverts (v3.0)

Objectif : Devenir le **standard MCP alimentaire** en proposant une API ouverte que d'autres acteurs peuvent implémenter.

### 8.1 Schema OpenFoodFacts
Intégration avec la base OpenFoodFacts pour enrichir les fiches produit (nutri-score, nova, éco-score).

### 8.2 Standard GS1 / Codex Alimentarius
Conformité aux standards d'identification produit (GTIN/EAN) pour l'interopérabilité avec le retail.

### 8.3 `lacarotte://mcp-manifest`
**Type** : Resource  
**Description** : Manifeste décrivant les capabilities du serveur MCP au format standard, permettant à d'autres outils de découvrir les fonctionnalités disponibles.

### 8.4 SDK & Documentation Développeur
Fournir un SDK TypeScript/Python pour que d'autres coopératives puissent monter leur propre serveur MCP compatible LaCarotte.

---

## 📈 Positionnement Concurrentiel

### Avantages vs alternatives existantes

| Critère | LaCarotte MCP | MCP e-commerce générique | API directe |
|---------|---------------|--------------------------|-------------|
| **Saisonnalité** | ✅ Natif | ❌ | ❌ |
| **Traçabilité** | ✅ Champ → assiette | ❌ | Partiel |
| **Empreinte carbone** | ✅ Calculée | ❌ | ❌ |
| **Multi-tenant** | ✅ Fédéré | ❌ | ❌ |
| **Panier partagé** | ✅ Collaboratif | ❌ | ❌ |
| **Recettes liées** | ✅ Avec achat direct | ❌ | ❌ |
| **Impact social** | ✅ Bilan intégré | ❌ | ❌ |
| **Standards ouverts** | ✅ OpenFoodFacts, GS1 | Propriétaire | Propriétaire |

### Pourquoi "point d'entrée pour les alternatives"

1. **Schema standardisé** : En proposant un schema MCP ouvert pour l'alimentaire, toute coopérative peut s'y connecter
2. **Fédération** : Le mode multi-tenant permet d'agréger des producteurs directement ou via d'autres plateformes partenaires
3. **Interop** : L'intégration OpenFoodFacts et GS1 rend le MCP utilisable par les comparateurs existants
4. **SDK** : Les alternatives peuvent réutiliser le SDK pour être découvrables via le même protocole

---

## 🗓️ Timeline prévisionnelle

| Phase | Version | Échéance | Priorité |
|-------|---------|----------|----------|
| Phase 3 — Intelligence Produit | v1.1 | Q3 2026 | 🔴 Haute |
| Phase 4 — Parcours avancé | v1.2 | Q4 2026 | 🔴 Haute |
| Phase 5 — Marketplace Multi-Tenant | v2.0 | Q1 2027 | 🟡 Moyenne |
| Phase 6 — Analytics & Fidélité | v2.1 | Q2 2027 | 🟡 Moyenne |
| Phase 7 — Notifications | v2.2 | Q3 2027 | 🟢 Basse |
| Phase 8 — Interop & Standards | v3.0 | Q4 2027 | 🟢 Basse |

---

**Ce roadmap positionne LaCarotte comme le premier MCP spécialisé circuits courts, avec une stratégie d'ouverture qui transforme le serveur MCP en standard de l'industrie alimentaire locale.**
