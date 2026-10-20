# Cahier des charges — Carbu France

Version 1.0 · 17 octobre 2026 · Statut : brouillon validé pour le MVP

## 1. Contexte et objectifs

### 1.1 Contexte
Les prix des carburants varient fortement d'une station à l'autre, parfois de plus de 20 centimes par litre dans un même rayon de 10 km. L'État publie ces prix en données ouvertes (flux « Prix des carburants en France – Flux instantané v2 », DGCCRF, Licence Ouverte 2.0), mises à jour environ toutes les 10 minutes. Plusieurs applications existent (Essence&Co, Gasoil Now, Fuel Flash, SLMC, l'application officielle), souvent financées par la publicité.

### 1.2 Objectifs du projet
| # | Objectif | Indicateur de réussite |
|---|----------|------------------------|
| O1 | Aider l'utilisateur à trouver la station la moins chère autour de lui | Résultat affiché en moins de 3 s après ouverture |
| O2 | Dire la vérité sur la fraîcheur des données | 100 % des prix affichés portent leur date de mise à jour |
| O3 | Respecter la vie privée | Aucune position stockée côté serveur dans le MVP |
| O4 | Démontrer une réalisation de niveau senior (portfolio) | Backend testé, CI verte, documentation, sécurité documentée |

### 1.3 Périmètre
- **Dans le périmètre du MVP** : recherche par rayon, tri prix/distance, 6 carburants, signalement de fraîcheur et de rupture, application Android et iOS.
- **Hors périmètre du MVP** : comptes, alertes, historique, bornes électriques, itinéraires, paiement, contributions des utilisateurs.

## 2. Parties prenantes et utilisateurs

| Persona | Besoin | Fréquence |
|---------|--------|-----------|
| Navetteur diesel (35-55 ans) | Faire le plein au meilleur prix sur son trajet | 1 à 2 fois/semaine |
| Étudiant / petit budget | Économiser sur chaque plein | 1 fois/semaine |
| Conducteur occasionnel | Éviter les stations hors de prix sur autoroute | Rare |
| Recruteur / évaluateur technique | Lire un dépôt propre, testé, documenté | Ponctuelle |

## 3. Exigences fonctionnelles

Priorités MoSCoW : **M** doit, **S** devrait, **C** pourrait, **W** pas maintenant.

| ID | Exigence | Priorité | Phase |
|----|----------|----------|-------|
| F01 | Rechercher les stations dans un rayon (1 à 50 km) autour de la position | M | MVP |
| F02 | Filtrer par carburant : gazole, SP95, SP95-E10, SP98, E85, GPLc | M | MVP |
| F03 | Trier par prix ou par distance | M | MVP |
| F04 | Afficher prix, adresse, distance, date de mise à jour | M | MVP |
| F05 | Signaler un prix ancien (> 72 h) et une rupture temporaire | M | MVP |
| F06 | Repli sur une position par défaut si la localisation est refusée | M | MVP |
| F07 | Saisir une adresse ou une ville pour chercher ailleurs | S | V1 |
| F08 | Vue carte avec marqueurs de prix | S | V1 |
| F09 | Fiche station : horaires, services, tous les prix | S | V1 |
| F10 | Favoris stockés sur l'appareil | S | V1 |
| F11 | Alertes de prix (notification push) | S | V1 |
| F12 | Historique et tendance des prix par station | S | V1 |
| F13 | Coût réel du plein (prix + détour) | C | V2 |
| F14 | Bornes de recharge électrique (IRVE) | C | V2 |
| F15 | Comptes et synchronisation multi-appareils | C | V2 |
| F16 | Signalement communautaire d'erreurs | W | V3 |

## 4. Exigences non fonctionnelles

| Domaine | Exigence | Cible |
|---------|----------|-------|
| Performance | Temps de réponse API p95 d'une recherche | < 300 ms |
| Performance | Démarrage à premier résultat sur réseau 4G | < 3 s |
| Disponibilité | API (hors maintenance) | 99,5 % |
| Fraîcheur | Écart entre la source officielle et l'API | < 20 min |
| Sécurité | Voir `04-securite-architecture.md` | Aucune vulnérabilité critique ou haute connue |
| Vie privée | Aucune donnée personnelle persistante côté serveur | Conforme RGPD |
| Accessibilité | Contraste AA, libellés d'accessibilité, tailles dynamiques | WCAG 2.2 AA |
| Compatibilité | Android 8+ (API 26), iOS 15+ | À valider selon Expo SDK 57 |
| Maintenabilité | Couverture de tests backend | ≥ 80 % |
| Observabilité | Journaux structurés, métrique de fraîcheur des données | Présents en V1 |
| Internationalisation | Français d'abord, structure prête pour d'autres langues | Textes centralisés |

## 5. Données

### 5.1 Sources
| Source | Usage | Licence | Risque |
|--------|-------|---------|--------|
| Flux instantané v2 (data.economie.gouv.fr) | Stations et prix | Licence Ouverte 2.0 | Station sans prix à jour, indisponibilité |
| Flux quotidien (data.gouv.fr) | Historique, ruptures | Licence Ouverte | Volume |
| IRVE consolidé (data.gouv.fr) | Bornes (V2) | Licence Ouverte | Fichier lourd |
| Géoplateforme IGN (géocodage) | Recherche d'adresse (V1) | Conditions de l'IGN, 50 req/s/IP | Quota |

Obligation : citer « Ministère de l'Économie et des Finances – Licence Ouverte » dans l'application.

### 5.2 Modèle de données (MVP)
- `stations(id, latitude, longitude, address, city, postal_code, department_code, open_24h, services)`
- `prices(station_id, fuel, price, updated_at)`
- `shortages(station_id, fuel, type, since)`
- `meta(key, value)` : date de dernière ingestion.

## 6. Contraintes
- Données publiques uniquement : aucun scraping, aucune donnée propriétaire.
- Pas de copie de code, de nom, de logo ni de visuels d'applications tierces.
- Budget : quasi nul en développement. Coûts récurrents estimés dans le business plan.
- Un seul développeur : périmètre MVP volontairement réduit.

## 7. Risques

| Risque | Probabilité | Impact | Réponse |
|--------|-------------|--------|---------|
| Source officielle indisponible ou format modifié | Moyenne | Élevé | Validation stricte, conservation de la dernière ingestion, alerte, flux quotidien en secours |
| Données incorrectes (prix aberrants) | Moyenne | Moyen | Filtres de plausibilité, date visible |
| Refus des stores (localisation, confidentialité) | Faible | Élevé | Permission minimale, politique de confidentialité, libellés clairs |
| Marché saturé | Élevée | Moyen | Différenciation : sans publicité, vie privée, transparence |
| Fuite de position utilisateur | Faible | Élevé | Ne pas journaliser les coordonnées, arrondir si besoin |
| Dérive du périmètre | Élevée | Moyen | Priorités MoSCoW, jalons courts |

## 8. Critères d'acceptation du MVP
1. Une recherche à Paris renvoie des stations triées par prix avec leur date de mise à jour.
2. Refuser la localisation n'empêche pas d'utiliser l'application.
3. Les prix de plus de 72 h et les ruptures sont visibles.
4. La suite de tests backend passe en CI et la couverture dépasse 80 %.
5. Aucune alerte critique ou haute dans l'audit des dépendances.
6. La politique de confidentialité et les crédits de la source sont accessibles dans l'application.
7. Un APK de démonstration est publié.

## 9. Livrables
Code source (backend, mobile), documentation (ce dossier `docs/`), CI GitHub Actions, README avec captures et GIF, APK de démonstration, politique de confidentialité.
