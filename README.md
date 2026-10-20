# Carbu France

Trouve les stations-service les moins chères autour de toi, à partir des données ouvertes officielles françaises (flux « Prix des carburants en France », DGCCRF). Sans publicité, sans compte, sans suivi : la position est arrondie et jamais conservée.

Source des prix : Ministère de l'Économie et des Finances, Licence Ouverte 2.0.

## Contenu

| Dossier | Rôle |
|---------|------|
| `backend/` | API Fastify, ingestion du flux officiel, SQLite, tests (67), lint, couverture |
| `mobile/` | Application Expo / React Native (TypeScript), thème clair et sombre, accessibilité |
| `docs/` | Cahier des charges, business plan, MVP et feuille de route, sécurité et architecture, design system |
| `.github/` | CI (typecheck, lint, tests, audit) et Dependabot |

## Démarrer

```bash
# Backend (Node >= 22.13)
cd backend
npm install
npm run ingest        # télécharge ~9 800 stations
npm run dev           # http://127.0.0.1:3000
npm run typecheck && npm run lint && npm run test:coverage

# Mobile
cd mobile
npm install
# émulateur Android : l'API est jointe via 10.0.2.2 automatiquement
# téléphone physique : EXPO_PUBLIC_API_URL=http://<IP-du-PC>:3000  (HOST=0.0.0.0 côté backend)
npx expo start
```

En production, l'application exige une URL `https://`.

## API

- `GET /health`
- `GET /stations?lat&lon&fuel=gazole|e10|sp95|sp98|e85|gplc&radiusKm=10&sort=price|distance&limit=30`
- `GET /stations/by-ids?ids=1,2&fuel&lat&lon` : favoris, quel que soit l'endroit
- `GET /stations/:id` : fiche (tous les prix, horaires, services)
- `GET /stations/:id/history?fuel&days` : évolution du prix
- `GET /stations/:id/route?lat&lon` : itinéraire voiture vers la station (OpenRouteService, optionnel)
- `GET /places?q=` : recherche d'adresse (Géoplateforme IGN)
- `POST /alerts`, `GET /alerts`, `DELETE /alerts/:id`, `PUT /device/push-token`, `DELETE /device` : alertes de prix (en-tête `x-device-id`)

Réponses : `{ success, data, error, meta }`. Chaque prix porte sa date et un indicateur `stale` (plus de 72 h). Les ruptures définitives sont masquées, les ruptures temporaires signalées.

## Configuration du backend

| Variable | Défaut | Rôle |
|----------|--------|------|
| `PORT` | 3000 | Port d'écoute |
| `HOST` | 127.0.0.1 | Interface (0.0.0.0 seulement derrière un proxy ou un conteneur) |
| `DB_PATH` | data/carbu.db | Fichier SQLite |
| `CORS_ORIGINS` | vide | Origines navigateur autorisées, séparées par des virgules |
| `RATE_LIMIT_PER_MINUTE` | 60 | Requêtes par minute et par IP |
| `LOG_LEVEL` | info | Niveau de journalisation |
| `ORS_API_KEY` | vide | Clé OpenRouteService (gratuite) ; sans elle, pas de tracé d'itinéraire |
| `ROUTE_RATE_LIMIT_PER_MINUTE` | 20 | Limite dédiée de l'endpoint d'itinéraire |
| `PLACES_RATE_LIMIT_PER_MINUTE` | 30 | Limite de la recherche d'adresse |
| `TRUST_PROXY_HOPS` | 0 | Nombre de relais de confiance devant l'API (0 = aucun). Ne jamais mettre une valeur trop haute : les limites de débit se fient à l'adresse indiquée |
| `ROUTING_FALLBACK` | osrm | Service de secours quand OpenRouteService ne répond pas (`osrm` ou `none`) |
| `ROUTE_DAILY_BUDGET` | 1500 | Calculs d'itinéraire amont par jour (UTC), sous le quota du fournisseur |
| `BRANDS_REFRESH` | true | Téléchargement hebdomadaire des enseignes (E.Leclerc, TotalEnergies…) depuis OpenStreetMap ; `npm run brands` le lance à la main (≈ 2 min) |
| `INGEST_INTERVAL_MINUTES` | 0 | Minutes entre deux rafraîchissements automatiques (0 ou ≥ 5). **À activer, par exemple 15**, pour remplir l'historique et évaluer les alertes |

## Documentation

1. [Cahier des charges](docs/01-cahier-des-charges.md)
2. [Business plan](docs/02-business-plan.md)
3. [MVP et feuille de route](docs/03-mvp-roadmap.md)
4. [Sécurité et architecture](docs/04-securite-architecture.md)
5. [Design system](docs/05-design-system.md)
6. [Conformité et publication](docs/06-conformite-et-publication.md)

Voir aussi [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md) et [LEGAL.md](LEGAL.md) (générés depuis `mobile/src/legal/content.json` par `npm run legal:generate`, à compléter avant publication : `npm run legal:check`).

## État

Vérifié : typecheck, lint, tests backend (180, couverture des lignes ≈ 98 %) et mobile (120), audit des dépendances du backend à zéro vulnérabilité, essai réel de l'API avec les données officielles (favoris, fiche, historique, recherche d'adresse, alertes).

Non vérifié : appel réel à OpenRouteService, notifications push réelles, rendu des écrans sur un appareil, image Docker, test de charge. Détails dans `docs/04-securite-architecture.md` (sections 5 et 8).

## Fonctions

Liste triée par prix ou distance, rayon 5/10/20 km, vue carte avec prix, recherche d'adresse, favoris, prix anciens signalés ou masqués, économie estimée sur un plein, fiche station (tous les prix, horaires avec statut « ouvert », services, évolution du prix, itinéraire tracé, navigation), alertes de prix, cache hors-ligne, thème clair et sombre.
