# Architecture, sécurité et vie privée

Version 1.0 · 17 octobre 2026

## 1. Architecture

```
 data.economie.gouv.fr  (flux officiel, HTTPS, liste blanche d'hôte)
          │  ingestion toutes les 15 min (npm run ingest)
          ▼
   ┌───────────────┐   parse + validation zod    ┌────────────────────┐
   │ ingest/       │ ───────────────────────────▶ │ SQLite (node:sqlite)│
   └───────────────┘   remplacement transactionnel└─────────┬──────────┘
                                                             │ lecture
   ┌─────────────────────────────────────────────────────────▼──────────┐
   │ API Fastify : helmet · CORS fermé · rate limit · cache TTL · zod     │
   └─────────────────────────────────────────────────────────┬──────────┘
                                 HTTPS (JSON, enveloppe)      │
                      ┌──────────────────────────────────────▼─────────┐
                      │ App Expo / React Native (contrat zod, thème)    │
                      └─────────────────────────────────────────────────┘
```

Dépendances dirigées vers l'intérieur : `domain` (types, règles) ← `ingest`, `db` ← `app` (HTTP) ← `server`. La couche HTTP ne connaît que le port `StationReader`, pas SQLite.

### Décisions d'architecture (ADR)

| # | Décision | Raison | Conséquence |
|---|----------|--------|-------------|
| 1 | SQLite (`node:sqlite`) pour le MVP | Aucune dépendance native, tests rapides, déploiement simple | Pas de PostGIS : filtrage par boîte englobante puis distance exacte. Migration prévue vers PostgreSQL + PostGIS (V1) derrière le même port `StationReader` |
| 2 | Remplacement transactionnel des données à chaque ingestion | Évite un état mixte | Garde-fou : refus si le flux perd plus de 50 % des stations (`--force` pour passer outre) |
| 3 | Contrat d'API validé côté mobile (zod) | Le client ne fait pas confiance au serveur | `mobile/src/contract.ts` ; un test backend vérifie que la vraie sortie respecte ce schéma |
| 4 | Position arrondie à ~110 m côté serveur | Minimisation des données | Les distances ont une erreur d'environ 80 m au plus |
| 5 | Prix « ancien » après 72 h et date illisible = ancien | Ne jamais présenter comme frais un prix douteux | Badge visible, exclu de « le moins cher » |
| 6 | Station en rupture définitive masquée, rupture temporaire signalée | Éviter de recommander du carburant introuvable | Filtre SQL |
| 7 | `tsx` exécuté en production | Simplicité du MVP | Compilation vers du JavaScript prévue avant un vrai déploiement (risque résiduel R2) |

## 2. Modèle de menaces

Actifs : disponibilité de l'API, intégrité des prix affichés, position de l'utilisateur, chaîne d'approvisionnement logicielle.

| # | Menace | Vecteur | Contrôle en place | Niveau résiduel |
|---|--------|---------|-------------------|-----------------|
| T1 | Interception ou altération des échanges (faux prix) | Wi-Fi public, HTTP | HTTPS exigé en build de production (`resolveApiUrl`), test dédié | Faible. Épinglage de certificat non fait |
| T2 | Déni de service par requêtes massives | Boucle de requêtes sur `/stations` | Limite de débit par IP (60/min), cache 60 s par position arrondie, limite de rayon (50 km) et de résultats (100), délais de requête, corps limité à 1 Ko | Moyen derrière un proxy mal configuré (voir `TRUST_PROXY`) |
| T3 | Flux officiel malveillant ou corrompu | Compromission de la source | Hôte en liste blanche, HTTPS, pas de redirection, taille maximale 100 Mo, type de contenu vérifié, validation zod de chaque champ (bornes, longueurs), refus d'un flux vide ou tronqué | Faible |
| T4 | Injection SQL | Paramètres de requête | Requêtes préparées, `fuel` en énumération, aucun SQL construit par concaténation, test d'injection | Très faible |
| T5 | Fuite d'informations par erreur | Messages d'erreur détaillés | Gestionnaire d'erreurs générique, messages de validation fixes, aucune pile d'appel | Très faible |
| T6 | Fuite de la position via les journaux | Journaux d'accès | Journaux limités à méthode et chemin (la requête est exclue), niveau configurable | Faible. À surveiller pour proxy, CDN et WAF en production |
| T7 | Utilisation de l'API par des sites tiers | CORS permissif | CORS fermé par défaut, liste blanche via `CORS_ORIGINS`, méthode GET uniquement | Faible |
| T8 | Dépendance compromise | npm | Verrouillage (`package-lock.json`), `npm audit` en CI, Dependabot, 0 vulnérabilité dans le backend | Voir R1 et R2 |
| T9 | Prix volontairement trompeurs publiés par une station | Données sources | Date visible, signalement de l'ancienneté. Pas de contrôle de vraisemblance croisée | Moyen, accepté |
| T10 | Fuite de secrets | Dépôt | Aucun secret dans le code ; `.env` ignoré ; configuration validée au démarrage | Faible |

Correspondance OWASP : API4 (consommation de ressources) → T2 ; API8 (mauvaise configuration) → T1, T5, T7 ; API10 (consommation non sûre d'API) → T3 ; Mobile M5 (communication non sûre) → T1 ; Mobile M2 (chaîne d'approvisionnement) → T8 ; Mobile M6 (contrôles de confidentialité) → T6 et section 4.

## 3. Mesures de sécurité implémentées

**API**
- En-têtes de sécurité (`@fastify/helmet`) : CSP `default-src 'none'`, HSTS, `nosniff`.
- Limite de débit (`@fastify/rate-limit`), configurable (`RATE_LIMIT_PER_MINUTE`).
- CORS fermé par défaut ; `TRUST_PROXY` désactivé par défaut pour éviter l'usurpation d'IP.
- Validation stricte des paramètres (chaînes vides refusées avant conversion, bornes de plage).
- Enveloppe d'erreur uniforme pour 400, 404, 413, 415, 429 et 500.
- Écoute locale par défaut (`HOST=127.0.0.1`), arrêt propre sur SIGINT et SIGTERM.
- Configuration validée au démarrage (`PORT`, `HOST`, `DB_PATH`, etc.).

**Ingestion**
- Liste blanche d'hôtes, pas de redirection, plafond de taille, vérification du type de contenu.
- Validation de chaque enregistrement (coordonnées, prix 0 à 10 €/L, dates lisibles, tailles de textes).
- Doublons dédupliqués et comptés, enregistrements invalides comptés par motif.
- Remplacement transactionnel avec reprise propre en cas d'échec (retour arrière protégé).

**Mobile**
- HTTPS obligatoire hors développement.
- Délai maximal de 15 s, annulation des requêtes obsolètes, validation de la réponse.
- Permission de localisation minimale : `ACCESS_COARSE_LOCATION` seulement, premier plan seulement.
- Aucune donnée personnelle stockée. Aucun secret dans le paquet.

## 4. Vie privée (RGPD)

| Sujet | Position |
|-------|----------|
| Données traitées | Position approximative (arrondie) envoyée pour chercher des stations |
| Base légale | Exécution du service demandé par l'utilisateur ; consentement via la permission système |
| Conservation | Aucune : la position n'est ni stockée ni journalisée |
| Partage | Aucun, pas de publicité, pas de suivi, pas de compte |
| Droits | Rien à supprimer ou exporter côté serveur |
| Transparence | Écran « À propos » et `PRIVACY.md` |

Points à compléter avant publication : déclaration de confidentialité Apple (privacy manifest) et formulaire « Sécurité des données » de Google Play listant la localisation.

## 5. Risques résiduels et dette connue

| # | Risque | Détail | Plan |
|---|--------|--------|------|
| R1 | 22 vulnérabilités signalées dans la chaîne d'outils Expo (mobile) | Concernent Metro, le CLI Expo, `node-forge`, `braces`, `uuid` : outils de build et de développement, non embarqués dans l'application. Le correctif proposé par `npm audit` consiste à rétrograder Expo à la version 44, ce qui est inacceptable et n'a pas été appliqué | Ne pas exposer le serveur Metro à un réseau non fiable ; suivre les mises à jour Expo via Dependabot ; relancer l'audit à chaque SDK |
| R2 | `tsx` (donc `esbuild` avec script d'installation) exécuté en production | Surface de chaîne d'approvisionnement | Compiler en JavaScript et lancer `node` en production |
| R3 | Pas d'authentification | API publique de données publiques ; acceptable pour le MVP | Clés d'API ou jetons dès l'ajout de comptes (V2) |
| R4 | Pas de test de charge | Seuils de limite de débit non validés par mesure | Test de charge avant mise en production |
| R5 | Image Docker non construite ni analysée | Docker n'est pas démarré sur la machine de développement | Construire, scanner (Trivy) et tester en CI |
| R6 | Pas de test d'interface mobile (composants, parcours) | Couverture limitée à la logique pure et au client API | Testing Library, puis E2E (Maestro) |
| R7 | Application mobile jamais lancée sur appareil ou émulateur | Vérification limitée au typecheck et aux tests | Essai manuel sur Android et iOS avant bêta |

## 6. Liste de contrôle pour la production

- [ ] TLS (Let's Encrypt derrière un proxy inverse), redirection HTTP vers HTTPS.
- [ ] CDN ou WAF (limitation de débit complémentaire, protection DDoS).
- [ ] `TRUST_PROXY=true` uniquement derrière un proxy de confiance.
- [ ] Conteneur non root, système de fichiers en lecture seule, volume pour la base.
- [ ] Planification de l'ingestion (toutes les 15 minutes) avec alerte en cas d'échec.
- [ ] Surveillance de la fraîcheur : `/health` expose `lastIngestedAt`.
- [ ] Journaux structurés sans position ; rétention courte.
- [ ] Build mobile en HTTPS uniquement, sans exception de trafic en clair.
- [ ] Politique de confidentialité publiée ; déclarations des stores remplies.
- [ ] Compilation du backend en JavaScript (R2) ; `npm audit signatures`.

## 7. Itinéraires (ajout)

Le détail d'une station affiche un tracé calculé par OpenRouteService (ORS), appelé **par le backend**.

| # | Menace | Contrôle |
|---|--------|----------|
| T11 | Quota ORS épuisé par un tiers (la clé sert de proxy ouvert) | La destination est toujours une station de la base, jamais un point fourni par le client ; limite de débit dédiée (20/min par IP) ; distance maximale de 150 km ; cache de 10 minutes ; une seule requête amont pour des demandes identiques simultanées |
| T12 | Fuite de la clé ORS | Clé uniquement dans `backend/.env` (ignoré par git) ; jamais dans l'application mobile ; URL du fournisseur fixe dans le code ; redirections refusées ; messages d'erreur sans détail du fournisseur (test dédié) |
| T13 | Position transmise à un tiers | Position arrondie à ~110 m avant l'appel ; mention dans l'écran « À propos » et `PRIVACY.md` |
| T14 | Réponse fournisseur malveillante ou énorme | Validation zod, plafond de 50 000 points et de 5 Mo, tracé simplifié (algorithme de Douglas-Peucker) avant envoi au mobile |

Décisions : le routage est une dépendance **optionnelle** (sans clé, `/stations/:id/route` répond 503 `ROUTING_UNAVAILABLE` et l'application propose directement la navigation externe). L'attribution « © openrouteservice.org by HeiGIT | © OpenStreetMap contributors » est affichée sous la carte.

Risques résiduels : conditions d'utilisation d'ORS non relues en détail (usage non commercial pour l'offre gratuite) ; le fond de carte dépend du système et transmet des requêtes de tuiles à Apple ou Google ; pas de test d'intégration réel avec ORS tant que la clé n'est pas configurée.

## 8. Fonctions ajoutées : favoris, fiche enrichie, historique, adresses, alertes

| # | Menace | Contrôle |
|---|--------|----------|
| T15 | `/places` utilisé comme proxy gratuit de géocodage | Au moins 3 caractères, limite dédiée (30/min), cache 5 min, URL du fournisseur fixe, redirections refusées, réponse validée (plafond de taille, bornes de coordonnées) |
| T16 | Lecture ou suppression des alertes d'un autre appareil | Identifiant d'appareil aléatoire de 128 bits transmis en en-tête (jamais dans l'URL), toutes les requêtes limitées à cet appareil, l'alerte d'un autre appareil est indiscernable d'une alerte absente (404), aucun endpoint de listing global |
| T17 | Fuite du jeton de notification | Jamais renvoyé par l'API ni journalisé (test dédié), format validé, effacé quand Expo répond `DeviceNotRegistered` |
| T18 | Spam de notifications | Une alerte se déclenche une seule fois puis se réarme seulement quand le prix repasse au-dessus du seuil ; seuls les prix récents et sans rupture comptent ; 10 alertes maximum par appareil ; limite de débit sur les endpoints |
| T19 | Croissance de la base | Historique : un point par changement de prix, purgé après 400 jours ; appareils inactifs supprimés après 180 jours ; au plus 50 identifiants par requête de favoris |
| T20 | Données locales corrompues sur le téléphone | Favoris, réglages, cache et identifiant relus avec validation de schéma ; toute valeur invalide retombe sur les valeurs par défaut |
| T21 | Réponse serveur inattendue côté application | Chaque réponse validée par schéma partagé (test de contrat dans le backend) |

Décisions :
- **Identité sans compte** : un identifiant aléatoire par installation. Conséquence assumée : réinstaller l'application crée une nouvelle identité (les anciennes alertes sont supprimées après 180 jours d'inactivité).
- **Recherche par zone visible** : `GET /stations?bbox=minLat,minLon,maxLat,maxLon` renvoie les stations dans le rectangle de la carte. Le rectangle est validé (valeurs finies, bornes cohérentes, 50 km au plus du centre à un coin) puis agrandi vers l'extérieur sur une grille de 0,005° à 0,02° selon sa taille, ce qui garde un cache utile. `meta.total` donne le nombre de stations dans la zone et `meta.truncated` indique que le plafond (`limit`, 100 au plus) a coupé la liste.
- **Stations le long d'un trajet** : `GET /trip/stations` calcule l'itinéraire avec la chaîne OpenRouteService puis OSRM (mêmes limite de débit, budget quotidien, plafond de 150 km et cache que la route vers une station), puis garde les stations à moins de 1, 2, 3 ou 5 km du tracé (distance à vol d'oiseau, calculée segment par segment). La destination vient du client : elle doit rester dans la France métropolitaine (marge comprise), sinon le quota de routage servirait de passerelle ouverte. Réponse : `{ route, stations[] }`, chaque station avec `offRouteKm`.
- **Enseignes** : le flux officiel n'en contient pas. Le serveur télécharge chaque semaine les stations d'OpenStreetMap portant le tag `ref:FR:prix-carburants` (≈ 10 000 sur 9 800 stations, 716 sur 718 autour de Paris) et les rattache par numéro officiel, jamais par position. Un téléchargement trop court ou qui ferait perdre plus de la moitié des enseignes connues est ignoré. Le filtre `brands` de `/stations` est validé (10 noms au plus, 40 caractères) et fait partie de la clé de cache.
- **Alertes évaluées après chaque ingestion**, donc seulement si `INGEST_INTERVAL_MINUTES` est défini (par exemple 15). Sans cela, rien n'est évalué et l'historique ne se remplit pas.
- **Hors connexion** : la dernière recherche est enregistrée sur l'appareil et marquée « données enregistrées le … ».
- **Migrations** : version du schéma dans `PRAGMA user_version` (v3), étapes idempotentes ; une base ancienne est mise à niveau sans perte.

Risques résiduels (à ajouter à la liste de la section 5) :

| # | Risque | Plan |
|---|--------|------|
| R8 | Les notifications distantes **ne sont pas vérifiées** : impossibles dans Expo Go sur Android (SDK 53+), et un `projectId` EAS est nécessaire pour obtenir un jeton | Créer un build de développement, exécuter `eas init`, tester sur un appareil réel |
| R9 | Les reçus de notification Expo ne sont pas relus (seuls les tickets sont traités) | Lire les reçus environ 15 minutes après l'envoi |
| R10 | L'historique démarre à la première ingestion : aucune donnée antérieure | Éventuellement amorcer avec le jeu de données quotidien officiel |
| R11 | Le statut « ouvert maintenant » utilise l'heure du téléphone | Acceptable pour la France métropolitaine ; à revoir pour l'outre-mer |
| R12 | Les écrans et hooks React ne sont pas testés (la logique pure, les clients API et le contrat le sont) | Testing Library, puis tests E2E |

### Note d'exploitation : fournisseur d'itinéraires
Le 18 octobre 2026, `api.openrouteservice.org` laissait environ 5 requêtes sur 6 sans réponse (2 réussies sur 12, mesure avec la même clé), alors que `api.heigit.org/openrouteservice` répondait 9 fois sur 9 en ~0,4 s. Le backend utilise donc le second hôte. Le serveur réessaie une fois après un délai (6 s par essai), et ses délais de socket (20 s) restent au-dessus du budget de routage (12 s) pour toujours renvoyer une erreur propre. Diagnostic rapide : `npm run check:routing`. Piste de secours non implémentée : serveur OSRM public (sans clé, usage raisonnable), qui a répondu 6 fois sur 6.

## 9. Seconde passe d'audit (18 octobre 2026)

Trois relectures indépendantes (sécurité, qualité, erreurs silencieuses). **Corrigé :**

| Sujet | Correction |
|-------|-----------|
| Un seul client pouvait vider le quota d'itinéraires | Budget quotidien global (`ROUTE_DAILY_BUDGET`, 1 500 par défaut), limite par IP abaissée à 10/min, le cache reste gratuit |
| Contournement des limites de débit par un en-tête `X-Forwarded-For` falsifié | `TRUST_PROXY_HOPS` : seul le nombre de relais indiqué est cru ; test avec en-têtes falsifiés |
| Croissance illimitée des appareils et alertes | Plafonds globaux (20 000 appareils, 100 000 alertes) ; un jeton de notification n'appartient qu'à un appareil |
| Rétention de 180 jours non garantie | Purge au démarrage puis quotidienne, indépendante du planificateur |
| Notification perdue si Expo échouait | L'alerte est réarmée et réessayée au passage suivant ; échecs journalisés (jamais les jetons) |
| Erreur après ingestion présentée comme un échec d'ingestion | Étapes séparées, journaux distincts ; arrêt propre qui attend la tâche en cours ; arrêt qui ne laisse plus de rejet non géré |
| Historique : décalages horaires mêlés, point de départ purgé, correction ignorée | Horodatages convertis en UTC (migration v4), le dernier point d'une série est toujours conservé, une correction au même instant remplace l'ancienne valeur |
| Cache de recherche pouvant afficher le mauvais carburant | Les données ne sont affichées que pour la clé qui les a produites ; test dédié |
| Rayon libre contournant le cache | Rayon arrondi vers le haut à 1, 2, 5, 10, 20 ou 50 km |
| Identifiant d'appareil lisible dans une sauvegarde | Stocké dans le trousseau sécurisé (`expo-secure-store`), `allowBackup` désactivé sur Android |
| Données locales écrasées par les valeurs par défaut après une lecture ratée | Les changements ne sont pas enregistrés tant que la lecture a échoué, avec bandeau explicatif |
| Droit à l'effacement inatteignable | Bouton « Supprimer mes données » (serveur puis local, annulable en cas d'échec) |
| Texte de la politique pouvant diverger du code | Test qui compare durées de conservation, prestataires et absence de bibliothèque publicitaire au code réel |

**Non corrigé** (détail et plan dans `docs/06`, section 6) : preuve de possession du jeton de notification, rotation de l'identifiant, requêtes SQL synchrones sur zones denses, mémoire de l'ingestion, blocage bref à chaque rafraîchissement, interdiction explicite du trafic en clair sur Android, image Docker, vulnérabilités d'outillage Expo, tests de composants React.

### Itinéraires : secours automatique (18 octobre 2026, soir)
OpenRouteService répondait de façon intermittente (2 requêtes sur 6 sur `api.heigit.org`, 0 sur 6 sur l'ancien hôte) alors que le serveur public OSRM répondait 6 fois sur 6. Le backend calcule donc un itinéraire ainsi : OpenRouteService (un essai de 5 s, budget quotidien) puis, s'il ne répond pas, OSRM (5 s). Après deux échecs consécutifs, OpenRouteService est ignoré pendant une minute (disjoncteur), puis réessayé. Essai réel : les deux premiers trajets ont attendu 5 s avant de basculer, les six suivants ont répondu en 0,3 s. Un « pas de route » ou « trop loin » ne déclenche pas le secours (la réponse serait la même). Le crédit affiché suit le service qui a répondu. Désactivable avec `ROUTING_FALLBACK=none`.

Réserves : le serveur de démonstration OSRM n'offre aucune garantie et n'autorise qu'un usage raisonnable, sans revente ; pour un vrai déploiement, héberger son propre OSRM ou Valhalla. Le lieu de traitement de ce serveur n'a pas été vérifié : le noter dans la politique de confidentialité avant publication si besoin.
