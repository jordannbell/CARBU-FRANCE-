# MVP, backlog et feuille de route

## 1. Définition du MVP
Le plus petit produit qui prouve la valeur : **ouvrir l'application, voir les stations les moins chères autour de soi, avec la fraîcheur du prix.**

### Inclus
- Recherche par rayon, 6 carburants, tri prix/distance (F01 à F06).
- API versionnée, ingestion planifiée, base locale.
- Interface cohérente (design system), clair et sombre, accessible.
- Sécurité de base : validation, limitation de débit, en-têtes, CORS restreint.
- CI : tests, typecheck, audit des dépendances.

### Exclu (volontairement)
Comptes, alertes, historique, carte, bornes, itinéraires, paiement.

## 2. Backlog priorisé

| Épique | Histoire | Priorité | Estimation |
|--------|----------|----------|------------|
| Données | Ingestion fiable avec reprise sur erreur | M | fait |
| Données | Planification de l'ingestion toutes les 15 min | M | 0,5 j |
| API | Limitation de débit, en-têtes de sécurité, CORS | M | 0,5 j |
| API | Contrat d'API documenté (OpenAPI) | S | 1 j |
| Mobile | Design system et thème clair/sombre | M | 1 j |
| Mobile | États vides, erreurs, chargement | M | 0,5 j |
| Mobile | Accessibilité (libellés, contrastes) | M | 0,5 j |
| Mobile | Écran « À propos » : source, licence, confidentialité | M | 0,5 j |
| Qualité | CI GitHub Actions | M | 0,5 j |
| Qualité | Tests mobile (logique et composants) | S | 1 j |
| V1 | Recherche d'adresse (géocodage IGN) | S | 1 j |
| V1 | Carte et marqueurs | S | 2 j |
| V1 | Favoris locaux | S | 1 j |
| V1 | Alertes de prix (backend + push) | S | 4 j |
| V1 | PostgreSQL + PostGIS | S | 2 j |
| V1 | Historique et tendance | S | 3 j |
| V2 | Coût réel du plein | C | 3 j |
| V2 | Bornes IRVE | C | 4 j |
| V2 | Comptes et synchronisation | C | 5 j |

## 3. Jalons

| Jalon | Contenu | Critère de sortie |
|-------|---------|-------------------|
| J0 — Fondations | Cahier des charges, business plan, architecture | Documents validés |
| J1 — MVP technique | Ingestion + API + app liste | Démo locale fonctionnelle |
| J2 — MVP durci | Sécurité, design, tests, CI | Aucune alerte critique, CI verte |
| J3 — Bêta | APK de test, 10 testeurs | Retours collectés |
| J4 — V1 | Carte, favoris, alertes, PostgreSQL | Publication stores |

## 4. Définition de terminé (DoD)
- Code relu et sans erreur critique ou haute.
- Tests écrits pour la fonction, couverture ≥ 80 % sur le backend.
- Typecheck et lint passent.
- Documentation et changelog à jour.
- Aucune donnée personnelle dans les journaux.

## 5. Stratégie de test
| Niveau | Outil | Cible |
|--------|-------|-------|
| Unitaire | Vitest | Analyse des enregistrements, géo, validation |
| Intégration | Vitest + `fastify.inject` | Routes, base en mémoire |
| Contrat | Fixtures de vrais enregistrements | Compatibilité avec le flux officiel |
| Mobile | Jest + Testing Library (à ajouter) | Logique d'affichage, états |
| E2E | Maestro ou Detox (V1) | Parcours principal |
| Sécurité | `npm audit`, revue, tests d'entrées hostiles | Dépendances, validation |

## 6. Gestion de projet
- Branche `main` protégée, branches `feat/*` et `fix/*`.
- Commits : Conventional Commits.
- Revue systématique avant fusion.
- Décisions d'architecture consignées (ADR) dans `docs/04-securite-architecture.md`.
