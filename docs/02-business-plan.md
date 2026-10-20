# Business plan — Carbu France

Version 1.0 · 17 octobre 2026

> **Lecture honnête.** L'objectif premier est un projet de portfolio. Ce document décrit un modèle économique crédible *si* le produit devenait un vrai service. Les chiffres marqués « hypothèse » ne sont pas des mesures : ils servent à raisonner et doivent être remplacés par des données réelles.

## 1. Résumé
Carbu France aide les automobilistes à trouver le carburant le moins cher autour d'eux, à partir des données ouvertes officielles. Promesse : **fiable, sans publicité, respectueuse de la vie privée**. Modèle : gratuit pour l'essentiel, option « Pro » payante à bas prix. Le marché est saturé : la réussite dépend de la qualité d'exécution et d'un positionnement net, pas de l'idée.

## 2. Marché

### 2.1 Taille (sources publiques)
- Environ 39,7 à 40 millions de voitures en circulation en France (SDES, 1er janvier 2025).
- Diesel : 48,3 % du parc ; essence : environ 38 à 40 % ; électrique : environ 3 %.
- Le thermique reste donc très largement majoritaire : la cible « carburant » est grande et durera des années, avec une érosion lente.

### 2.2 Concurrence
| Acteur | Modèle observé | Faiblesse citée par les comparatifs |
|--------|----------------|-------------------------------------|
| Essence&Co | Publicité + abonnement facultatif ; revendique plus de 8 M de téléchargements (déclaratif) | Publicités parfois intrusives |
| Gasoil Now | Prix collaboratifs ; version sans pub payante | Publicité dès l'ouverture |
| Fuel Flash | Gratuit avec pub ; payant à bas prix | Interface moins fluide |
| SLMC | Gratuit ou version sans pub | Nombreuses variantes de prix |
| Roole Map | Gratuit, sans publicité | Couverture France seulement |
| Application officielle (prix-carburants.gouv.fr) | Gratuite | Ergonomie limitée |

Les prix de l'option sans publicité vont d'environ 0,99 € à 6,99 € par an selon les sources (chiffres non vérifiés à la source).

### 2.3 Positionnement
| Axe | Concurrents | Carbu France |
|-----|-------------|--------------|
| Publicité | Fréquente | Aucune |
| Vie privée | Variable | Position traitée à la demande, non conservée |
| Fraîcheur | Rarement affichée | Toujours affichée, signalée si ancienne |
| Coût réel | Rare | Prix + détour (V2) |
| Transparence | Faible | Source et licence citées |

## 3. Proposition de valeur
1. **Le bon prix, vite** : liste triée en quelques secondes.
2. **Un prix honnête** : date visible, alerte si ancien ou en rupture.
3. **Aucune pub, aucun suivi** : la confiance comme argument.
4. **Utile pour tous les carburants**, bornes électriques en V2.

## 4. Modèle économique

### 4.1 Paliers
| Palier | Contenu | Prix (hypothèse) |
|--------|---------|------------------|
| Gratuit | Recherche, tri, fraîcheur, ruptures, favoris | 0 € |
| Pro | Alertes de prix, historique et tendance, coût réel du plein, widgets | 2,99 €/an ou 4,99 € à vie |

Principe : aucune fonction de base derrière un mur de paiement (c'est la plainte n°1 des utilisateurs d'applications de ce type).

### 4.2 Autres revenus possibles
- Dons (« Soutenir »), sur le modèle de projets open source.
- Partenariats sans publicité ciblée (mutuelles, assureurs) : à explorer seulement après traction.

## 5. Coûts (estimation)

| Poste | Montant | Remarque |
|-------|---------|----------|
| Compte Apple Developer | environ 99 $/an | Obligatoire pour l'App Store |
| Compte Google Play | environ 25 $ une fois | Frais uniques |
| Hébergement (API + base) | 5 à 20 €/mois | Petite instance, hypothèse |
| Nom de domaine | 10 à 15 €/an | |
| Surveillance, sauvegardes | 0 à 10 €/mois | |
| Commission des stores | 15 à 30 % des ventes | Selon programme et ancienneté |
| Temps de développement | Non valorisé | Projet personnel |

Coût annuel de fonctionnement estimé : environ 200 à 450 € (hypothèse).

## 6. Scénarios financiers (illustratifs, hypothèses)

Hypothèses : prix Pro 2,99 €/an, commission 15 %, conversion applicable aux utilisateurs actifs.

| Scénario | Utilisateurs actifs | Conversion Pro | Revenu brut | Revenu net de commission | Résultat après coûts (≈ 350 €) |
|----------|--------------------|----------------|-------------|--------------------------|---------------------------------|
| Prudent | 2 000 | 2 % | 120 € | 102 € | −248 € |
| Réaliste | 20 000 | 3 % | 1 794 € | 1 525 € | +1 175 € |
| Ambitieux | 100 000 | 3 % | 8 970 € | 7 625 € | +7 275 € |

**Conclusion** : à ces niveaux, le projet couvre ses coûts à partir d'environ 7 000 à 8 000 utilisateurs actifs payant à 3 %. Il ne constitue pas un revenu principal. Sa valeur première est la démonstration de compétences.

## 7. Acquisition
| Canal | Action | Coût |
|-------|--------|------|
| Référencement store (ASO) | Mots-clés « prix carburant », captures soignées | Temps |
| Presse et blogs | Cas : « une alternative sans pub » | Temps |
| Communautés | Reddit, forums automobiles | Temps |
| Open source | Dépôt GitHub propre, README, démo | Temps |
| Saisonnalité | Pics de départs en vacances, hausses de prix | Temps |

## 8. Indicateurs clés
- Installations, utilisateurs actifs hebdomadaires, rétention à J7 et J30.
- Temps jusqu'au premier résultat.
- Taux de conversion Pro, remboursements.
- Fraîcheur de l'ingestion (écart avec la source), taux d'erreur de l'API.
- Note de store et motifs de plainte.

## 9. Risques et réponses
| Risque | Réponse |
|--------|---------|
| Marché saturé, acquisition difficile | Positionnement net, qualité, communication transparente |
| Dépendance à une seule source de données | Cache, flux quotidien de secours, surveillance |
| Revenu insuffisant | Coûts faibles, projet pensé comme portfolio |
| Réglementation (RGPD, stores) | Minimisation, politique de confidentialité, permissions justifiées |
| Changement de licence ou de format des données | Veille, tests de contrat sur le flux |

## 10. Feuille de route économique
1. **Mois 0-1** : MVP gratuit, publication d'un APK, retours de 10 testeurs.
2. **Mois 2-3** : V1 (carte, favoris, alertes), publication sur les stores.
3. **Mois 4-6** : palier Pro, mesure de la conversion réelle, décision de continuer ou de rester en démonstration.

## Sources
- [SDES — 39,7 millions de voitures en circulation](https://www.statistiques.developpement-durable.gouv.fr/397-millions-de-voitures-en-circulation-en-france-au-1er-janvier-2025)
- [Roole — parc roulant 2025](https://media.roole.fr/transition/voiture-propre/voitures-electriques-ou-en-est-vraiment-le-parc-roulant-en-france-en-2025)
- [Pièces et pneus — comparatif d'applications carburant](https://blog.piecesetpneus.com/applications-deconomie-de-carburant-comparatif-de-lefficacite-reelle/)
- [Palac — comparatif des applications](https://palac.fr/blog/application-essence-moins-chere-comparatif)
- [Cartecarburant — Gasoil Now](https://www.cartecarburant.com/blog-cartes-carburant/carburant/gasoil-now-avis-complet-fonctionnement-gratuit-ou-payant-alternatives-2026/)

## 11. Modèles de revenus sans abonnement (ajout du 18 octobre 2026)

Contrainte posée : pas d'abonnement ; la publicité est envisageable. Rappel important : les fonctions de base restent gratuites et la confiance (aucune publicité, aucun suivi, prix honnêtes) est la raison d'être du produit face aux concurrents. Chaque option ci-dessous est jugée à l'aune de cette promesse. Aucun chiffre de revenu n'est avancé : les sources trouvées sont des blogs d'éditeurs d'outils, sans données comparables.

| Option | Principe | Avantages | Risques et conditions | Effort |
|--------|----------|-----------|-----------------------|--------|
| **Dons** | Lien « Soutenir le projet » (`EXPO_PUBLIC_DONATION_URL`, https uniquement) | Aucune donnée, aucune publicité, cohérent avec le positionnement ; déjà implémenté | Revenus faibles et irréguliers (un projet comparable cité par la presse évoque environ 0,5 % de donateurs) | Fait |
| **Liens partenaires étiquetés** | Affiliation vers des services utiles (entretien, pneus, assurance, recharge électrique) | Pas de publicité intrusive ; pertinent pour l'automobiliste | Mention « lien affilié » obligatoire ; le partenaire dépose ses propres traceurs après le clic (à dire dans la politique) ; ne jamais influencer le classement par prix | Faible |
| **Stations partenaires (côté professionnels)** | Une station revendique sa fiche : horaires, services, promotion, photo, étiquette « Partenaire » ; la station paie, pas l'utilisateur | Revenu sans toucher au gratuit côté particulier ; différenciant | Vérification d'identité des stations ; étiquetage publicitaire ; le tri par prix reste neutre ; statut professionnel de l'éditeur | Moyen à élevé |
| **API de données enrichies** | Historique des prix, tendances, alertes pour flottes, médias, comparateurs ; clé payante | Réutilisation commerciale permise sous Licence Ouverte avec mention de la source ; la valeur ajoutée est l'historique que nous accumulons | Il faut une audience technique, de la documentation, du support, et un volume d'historique suffisant | Élevé |
| **Publicité non intrusive** | Une annonce discrète en bas de liste, jamais sur les écrans sensibles | Revenu proportionnel à l'audience | Consentement CNIL avant tout identifiant, module de consentement, build de développement, déclarations des stores, perte de la promesse « sans publicité » ; le revenu dépend de la taille de l'audience, pas du modèle | Élevé (voir `docs/06`, section 5) |
| **Achat unique optionnel** | Un déblocage à vie (widgets, plus d'alertes), pas un abonnement | Pas de renouvellement | Commission des stores de 15 à 30 %, contraire à l'esprit « tout gratuit » si les alertes sont limitées | Moyen |

**Recommandation par étapes**
1. **Maintenant** : dons, transparence totale (politique, mentions légales, suppression des données), qualité des données. Objectif : démontrer le produit et mesurer l'usage.
2. **Quand l'audience existe** (par exemple quelques milliers d'utilisateurs actifs) : liens partenaires étiquetés, puis stations partenaires, qui rapportent sans toucher au particulier.
3. **En dernier recours** : publicité, derrière un interrupteur désactivé par défaut et avec le consentement complet décrit dans `docs/06`.

**Ce qui fait croître l'audience sans dépenser** : fiche de store soignée (mots-clés, captures), angle de presse clair (« comparateur sans publicité, vos données restent chez vous ») comme l'ont fait d'autres applications gratuites françaises, partage d'un prix depuis la fiche d'une station, et pics saisonniers (départs en vacances, hausses de prix).

**Rappel statut** : dès qu'un revenu régulier apparaît (affiliation, stations partenaires, publicité), le statut d'éditeur non professionnel est à réexaminer (`docs/06`, section 4).
