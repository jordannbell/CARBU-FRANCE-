# Conformité et publication

*Document de travail, rédigé à partir du comportement réel du code au 18 octobre 2026. Ce n'est pas un avis juridique : faites-le relire avant de publier sur un store.*

## 1. Ce qui est à faire avant toute publication

| # | Action | Comment vérifier |
|---|--------|------------------|
| 1 | Renseigner l'identité de l'éditeur, le directeur de la publication et l'hébergeur | Éditer `mobile/src/legal/content.json`, puis `npm run legal:generate` et `npm run legal:check` (échoue tant qu'un `[À COMPLÉTER]` reste) |
| 2 | Publier la politique de confidentialité à une **adresse web publique** (exigée par Apple et Google) | Par exemple GitHub Pages sur le dossier du dépôt, ou le fichier `PRIVACY.md` en lien direct |
| 3 | Remplir les déclarations des stores (section 3) | Voir tableaux ci-dessous |
| 4 | Vérifier le statut juridique de l'éditeur (section 4) | Particulier non professionnel ou micro-entrepreneur |
| 5 | Choisir et documenter le mécanisme de transfert vers Expo (États-Unis) | Vérifier si Expo est certifié au Data Privacy Framework, sinon clauses contractuelles types ; ne pas affirmer plus que la réalité dans la politique |
| 6 | Configurer le serveur : `TRUST_PROXY_HOPS`, `INGEST_INTERVAL_MINUTES=15`, `ROUTE_DAILY_BUDGET`, HTTPS, sauvegardes | `docs/04`, section 6 |
| 7 | Régénérer la clé OpenRouteService si le dossier a été partagé, et ne jamais la committer | `backend/.env` est ignoré par git |
| 8 | Tester les notifications sur un appareil réel avec un build de développement | Impossible dans Expo Go sur Android |

## 2. Registre des traitements (article 30 du RGPD)

Responsable du traitement : l'éditeur (voir `content.json`). Pas de sous-traitant au sens strict côté mobile ; l'hébergeur du serveur et les services tiers sont des destinataires.

| Traitement | Finalité | Données | Base légale | Destinataires | Durée |
|------------|----------|---------|-------------|---------------|-------|
| Recherche de stations | Afficher les stations de la zone de carte visible | Position arrondie (~100 m), carburant, rectangle de la carte (bords arrondis vers l'extérieur) | Exécution du service demandé ; autorisation de localisation | Hébergeur | Non conservé |
| Recherche d'adresse | Chercher ailleurs que sur sa position | Texte tapé | Exécution du service demandé | Hébergeur, Géoplateforme (IGN) | Mémoire quelques minutes |
| Itinéraire | Tracer le trajet et lister les stations le long | Position arrondie, station ou destination choisie (destination limitée à la France, position et destination arrondies à ~100 m) | Exécution du service demandé | Hébergeur, OpenRouteService (HeiGIT, Allemagne) ou, en secours, serveur de démonstration OSRM (lieu de traitement à vérifier) | Mémoire quelques minutes |
| Alertes de prix | Prévenir d'une baisse | Identifiant d'installation aléatoire, station, carburant, seuil | Exécution du service demandé | Hébergeur | Appareil inactif 180 jours |
| Notifications | Acheminer l'alerte application fermée | Jeton de notification, texte de l'alerte | Consentement | Expo (États-Unis), Apple/Google | Même durée que l'appareil |
| Historique des prix | Afficher l'évolution | Prix publics des stations | Intérêt légitime ; données non personnelles | Hébergeur | 400 jours |
| Enseignes des stations | Afficher et filtrer par enseigne | Aucune donnée personnelle : le serveur télécharge chaque semaine les enseignes d'OpenStreetMap (ODbL, crédit affiché) | Intérêt légitime ; données non personnelles | Hébergeur, API Overpass (le serveur seulement, jamais l'appareil) | Remplacées à chaque téléchargement |
| Données locales | Favoris, réglages, cache | Identifiants de stations, réglages | Nécessaires au fonctionnement | Aucun (sur l'appareil) | Jusqu'à désinstallation ou suppression |

Droits : accès, rectification, effacement, limitation, opposition, portabilité. Effacement immédiat par le bouton « Supprimer mes données » (endpoint `DELETE /device`) et par courriel. Réclamation possible auprès de la CNIL. Pas d'analyse d'impact obligatoire à cette échelle (pas de traitement à grande échelle de données sensibles), mais la géolocalisation justifie de rester vigilant.

## 3. Déclarations des stores

À remplir à partir de ce que le code fait réellement. Les libellés exacts des formulaires changent : vérifier à la soumission.

### Apple (App Privacy)
| Type de donnée | Collectée ? | Liée à l'identité ? | Servant au suivi ? | Usage |
|----------------|-------------|--------------------|--------------------|-------|
| Localisation précise ou approximative | Oui, envoyée au serveur | Non | Non | Fonctionnement de l'application |
| Identifiant d'appareil (identifiant aléatoire propre à l'installation, jeton de notification) | Oui, si alertes | Non (non relié à une personne) | Non | Fonctionnement de l'application |
| Contenu saisi (texte de recherche d'adresse) | Transmis, non conservé | Non | Non | Fonctionnement de l'application |

Notes : la position est arrondie à environ 100 m, ce qui reste plus fin que la définition « approximative » d'Apple (1 km) : à déclarer prudemment comme précise. Aucun suivi publicitaire, donc pas de fenêtre ATT tant qu'il n'y a pas de publicité. Expo fournit les manifestes de confidentialité des modules ; vérifier le fichier généré au moment du build.

### Google Play (Sécurité des données)
| Question | Réponse |
|----------|---------|
| Données collectées | Position approximative ; identifiants d'appareil ou autres (identifiant d'installation, jeton de notification) |
| Données partagées avec des tiers | À examiner : l'IGN, OpenRouteService et Expo reçoivent des données pour fournir le service (prestataires) ; Google distingue partage et traitement pour le compte du développeur |
| Chiffrement en transit | Oui (HTTPS obligatoire en production) |
| Possibilité de demander la suppression | Oui : bouton dans l'application et adresse de contact |
| Politique de confidentialité | URL publique requise |

## 4. Mentions légales : ce qui s'applique

- La loi pour la confiance dans l'économie numérique (LCEN, article 1-1 depuis la loi du 21 mai 2024, anciennement 6-III) impose d'identifier l'éditeur et l'hébergeur.
- **Particulier, activité non professionnelle** : le public peut ne voir que le nom, la dénomination ou la raison sociale et l'adresse de l'**hébergeur**, à condition d'avoir communiqué son identité à cet hébergeur.
- **Professionnel (micro-entrepreneur compris)** : identité complète, adresse, téléphone et numéro d'inscription à publier. Dès qu'une activité génère un revenu régulier (publicité, affiliation, stations partenaires), le statut non professionnel devient discutable : décidez avant de monétiser.
- Où les placer : dans l'application (écran Réglages, déjà prévu) et sur la fiche des stores. Le texte est généré dans `LEGAL.md`.
- Les sanctions citées par des sources secondaires (jusqu'à un an de prison et 75 000 €) sont à vérifier sur Légifrance avant de s'en servir.

## 5. Si de la publicité est ajoutée un jour

La politique actuelle affirme « aucune publicité, aucun traceur » et un test automatique (`mobile/tests/legal.test.ts`) échoue dès qu'une bibliothèque publicitaire ou d'analyse est ajoutée aux dépendances : il faudra alors revoir tout ce qui suit.

1. **Consentement avant toute lecture ou écriture d'identifiant publicitaire.** La CNIL rappelle que l'autorisation système (localisation, notifications) ne vaut pas consentement à la publicité ; refuser doit être aussi simple qu'accepter, et le choix doit pouvoir être modifié.
2. Un module de consentement certifié (plateforme de messages d'utilisateur de Google, ou autre CMP) doit s'afficher en Europe avant l'initialisation du SDK.
3. iPhone : fenêtre App Tracking Transparency si l'identifiant publicitaire est utilisé.
4. Nécessite un **build de développement** (la bibliothèque publicitaire ne fonctionne pas dans Expo Go).
5. Mettre à jour la politique, le registre, les déclarations Apple et Google, et les mentions légales (statut professionnel).
6. Étiqueter clairement « Publicité », ne jamais placer d'annonce sur un écran d'alerte, d'itinéraire ou de suppression de données, et ne jamais laisser la publicité influencer le classement par prix.
7. Mettre la fonction derrière un interrupteur désactivé par défaut.

## 6. Failles connues non corrigées (à traiter avant un déploiement public)

| # | Sujet | Détail |
|---|-------|--------|
| S1 | Preuve de possession du jeton de notification | Quiconque connaît le jeton d'un autre appareil peut se l'attribuer ; mitigé (un jeton = un appareil, 10 alertes maximum, limites de débit) mais pas supprimé |
| S2 | Rotation de l'identifiant d'appareil | Pas de point d'accès pour le renouveler en cas de fuite ; la suppression des données en crée un nouveau |
| S3 | `findNearby` synchrone | Une zone très dense charge plusieurs milliers de lignes ; à surveiller, plafond SQL possible |
| S4 | Ingestion en mémoire | ~3 fois la taille du flux en mémoire pendant l'analyse ; à dimensionner avec la mémoire du conteneur |
| S5 | `replaceAll` bloque l'API quelques instants à chaque rafraîchissement | Passer à PostgreSQL ou à un thread dédié |
| S6 | Android : trafic en clair non interdit explicitement | Ajouter la propriété de build correspondante lors du passage en build natif |
| S7 | Image Docker non construite ni analysée, image de base non épinglée | CI : construire, scanner, épingler par empreinte |
| S8 | 23 vulnérabilités d'outillage Expo | Chaîne de build uniquement ; suivre les versions d'Expo |
| S9 | Aucun test de composants React ni de bout en bout | Testing Library puis Maestro |
