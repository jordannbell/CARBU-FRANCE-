# Design system — Carbu France

Principe : **sobre, lisible, honnête**. Un outil qu'on ouvre à la pompe, d'une main, souvent en plein soleil. Le prix est l'information dominante ; la fraîcheur et les ruptures sont toujours dites ; rien de décoratif.

Références de méthode : règles du skill `mobile-uiux-pro-max` (typographie TYP, cartes CRD, états STATE, accessibilité A11Y), Apple HIG et Material 3 pour les cibles tactiles et la hiérarchie. Le style s'inspire de la retenue des applis système (Réglages, Météo, Wallet) : fonds neutres, séparateurs fins, une seule couleur d'accent.

## 1. Choix de design

| Choix | Pourquoi |
|-------|----------|
| Liste groupée avec séparateurs fins, pas de cartes ombrées | Moins de bruit visuel ; évite les cartes imbriquées et les contours à contraster (CRD-010, CRD-011) ; défile plus vite |
| Neutres « stone » + noir d'encre comme couleur primaire | Sobre, bon contraste, fonctionne en clair et en sombre sans accent criard |
| Vert et ambre réservés au sens (le moins cher / prix ancien, rupture) | La couleur ne sert qu'à informer, jamais à décorer |
| Prix à droite, en gros, chiffres tabulaires | Lecture en colonne, pas de saut quand les valeurs changent (TYP-014) |
| Adresse en titre de ligne | Le flux officiel ne fournit pas de nom de marque ; l'adresse identifie la station |
| Pas d'emoji, pas d'icônes de remplissage | Texte clair, lisible par lecteur d'écran, aucune dépendance d'icônes |

## 2. Couleurs

Source unique : `mobile/src/theme/colors.json` (clair et sombre). Aucune couleur dans les composants. Le test `tests/contrast.test.ts` calcule le contraste WCAG de chaque paire texte/fond utilisée, dans les deux thèmes : **toutes ≥ 4,5:1**, et le test échoue si un jeton casse la règle.

| Jeton | Clair | Sombre | Usage |
|-------|-------|--------|-------|
| `background` | #FAFAF9 | #0C0A09 | Fond d'écran |
| `surface` | #FFFFFF | #1C1917 | Lignes, puces |
| `surfaceMuted` | #F5F5F4 | #292524 | Contrôle segmenté, ligne pressée, squelette |
| `border` | #E7E5E4 | #2E2A28 | Séparateurs fins (décoratifs) |
| `text` / `textMuted` | #1C1917 / #57534E | #FAFAF9 / #A8A29E | Texte principal / secondaire |
| `primary` / `primaryText` | #1C1917 / #FAFAF9 | #FAFAF9 / #1C1917 | Sélection, bouton principal |
| `success` | #166534 | #4ADE80 | « Le moins cher » |
| `warning` / `warningSurface` | #92400E / #FEF3C7 | #FBBF24 / #422006 | Prix ancien, rupture, bandeaux |
| `danger` / `dangerSurface` | #B91C1C / #FEE2E2 | #F87171 / #450A0A | Erreurs |

Règle : aucune information portée par la couleur seule. Chaque état a un libellé.

## 3. Typographie

Police système. Échelle modulaire 12 · 14 · 16 · 24 · 28, six rôles seulement (TYP-008).

| Rôle | Taille / interligne | Graisse | Usage |
|------|--------------------|---------|-------|
| `title` | 28 / 34 | 700 | Titre d'écran |
| `price` | 24 / 28 | 700, chiffres tabulaires | Prix |
| `body` | 16 / 24 | 400 | Texte courant |
| `bodyStrong` | 16 / 24 | 600 | Adresse de la station |
| `label` | 14 / 20 | 600 | Étiquettes, contrôles |
| `caption` | 12 / 16 | 400 | Dates, notes |

La mise à l'échelle du texte système n'est jamais limitée (TYP-017). Les hauteurs de ligne s'adaptent au contenu.

## 4. Espacement, formes, cibles

- Grille 4/8 : 4 · 8 · 12 · 16 · 24 · 32.
- Rayons : 8, 12, 16 et pastille.
- Cible tactile minimale **48 dp** (puces, segments, boutons, lignes de 76 dp).
- Zones de sécurité via `react-native-safe-area-context` ; liste avec marge basse égale à l'inset.

## 5. Composants

| Composant | Fichier | Comportement |
|-----------|---------|--------------|
| `AppText` | `components/ui.tsx` | Seul rendu de texte : rôle typographique + ton (`default`, `muted`, `success`, `warning`, `danger`, `inverse`) |
| `Chip` | `components/ui.tsx` | Choix unique (carburant), rôle `radio`, état « coché » annoncé |
| `Segmented` | `components/ui.tsx` | 2 à 4 options exclusives (tri, rayon), groupe `radiogroup` |
| `Button` | `components/ui.tsx` | Primaire (encre) ou secondaire ; état pressé |
| `Banner` | `components/ui.tsx` | Message non bloquant en haut du contenu avec une seule action de récupération ; zone annoncée |
| `StationRow` | `components/StationRow.tsx` | Une ligne = une cible : lecture « 1,789 €, à 2,3 km, adresse, notes » ; toucher ouvre l'itinéraire dans l'appli de cartes |
| `StationSkeleton` | `components/Skeleton.tsx` | Mêmes dimensions que `StationRow` ; pulsation de 1,6 s, figée si « réduire les animations » |
| `EmptyState` | `components/EmptyState.tsx` | Titre, une phrase, une action |
| `AboutModal` | `components/AboutModal.tsx` | Source des données, vie privée, crédits |

## 6. États de l'écran principal

| État | Rendu |
|------|-------|
| Position en cours | Squelette de 6 lignes, libellé « Recherche de votre position » |
| Chargement des prix | Squelette si rien n'est affiché ; sinon les résultats restent visibles et le geste « tirer pour rafraîchir » montre l'indicateur |
| Résultats | Liste groupée ; « Le moins cher » seulement pour un prix récent et sans rupture |
| Aucun résultat | « Aucune station trouvée » + « Élargir à 10/20 km » (action de récupération) |
| Erreur sans données | Écran d'erreur : titre, explication selon la cause (réseau, délai, trop de requêtes, serveur), bouton Réessayer |
| Erreur avec données | Bandeau « Les dernières données restent affichées » + Réessayer |
| Hors connexion | Même bandeau, texte dédié « Pas de connexion au serveur » |
| Localisation refusée | Bandeau + « Autoriser » ; si l'OS ne redemandera plus : « Ouvrir les réglages » ; recherche autour de Paris |
| Position introuvable | Bandeau + « Autoriser » pour réessayer ; recherche autour de Paris |
| Échec d'ouverture des cartes | Bandeau d'erreur avec Fermer |

Les changements d'état sont annoncés aux lecteurs d'écran (nombre de stations après chargement). Les détails techniques d'erreur (adresse du serveur) ne s'affichent qu'en développement.

## 7. Accessibilité

- Rôles et états : `radio` + coché pour les choix, `button` pour les actions, `header` pour les titres, zones annoncées pour bandeaux et états vides.
- Cartes de station : une seule cible, indice « Ouvre l'itinéraire dans l'application de cartes ».
- Contrastes AA testés automatiquement (section 2).
- Texte dynamique sans plafond ; mise en page sans hauteur fixe pour le texte.
- Mouvement : seul le squelette s'anime, et il se fige avec « réduire les animations ».
- Non vérifié : essai réel avec TalkBack et VoiceOver.

## 8. Contrôle qualité

Les validateurs du skill (`run_all.py`, lecture seule) donnent, sur `mobile/src` :

| Mesure | Avant | Après |
|--------|-------|-------|
| Score de préparation | 0 / 100 | 59 / 100 |
| Erreurs | 28 | 0 |
| Verdict | BLOQUÉ | PASS |

Les avertissements restants sont des faux positifs : l'outil attend les états « chargement/vide/erreur/hors-ligne » dans chaque fichier, y compris les composants d'affichage ; l'écran `HomeScreen.tsx`, qui porte ces états, n'a aucun avertissement.

## 9. Texte et langue

Tout le texte visible est dans `mobile/src/i18n/fr.ts`. Ton court et direct. Montants « 1,789 » avec l'unité « €/L » à part, distances « 350 m » ou « 2,3 km ».

## 10. Suite prévue
Carte avec marqueurs de prix, fiche station, favoris, historique de prix (couleurs de graphique dérivées des jetons), icônes cohérentes si une bibliothèque est ajoutée.

## 11. Écran de détail et itinéraire

Toucher une ligne ouvre `StationDetail` : adresse, prix, date, résumé « 2,3 km · 7 min en voiture », carte avec tracé, bouton « Lancer la navigation » (ouvre l'application de cartes du système pour le guidage).

| État | Rendu |
|------|-------|
| Calcul en cours | Indicateur et « Calcul de l'itinéraire » ; la carte montre déjà la station et la position |
| Itinéraire disponible | Tracé (jeton `route`, contraste ≥ 3:1 testé), vue ajustée au trajet |
| Service indisponible, délai, réseau | Bandeau explicatif ; « Réessayer » ; navigation externe toujours possible |
| Aucun itinéraire / trop loin | Bandeau sans réessai (inutile) ; navigation externe possible |
| Position indisponible | Bandeau : l'itinéraire part du centre de Paris |

La carte est masquée aux lecteurs d'écran : le résumé texte porte l'information. L'attribution du fournisseur est visible sous la carte.

## 12. Écrans et composants ajoutés

| Élément | Fichier | Règles |
|---------|---------|--------|
| Mode « Autour de moi / Favoris », affichage « Liste / Carte » | `HomeScreen.tsx`, `Segmented` | Groupes `radiogroup`, 48 dp ; les favoris restent visibles où que l'on soit |
| Recherche d'adresse | `components/PlaceSearch.tsx` | Champ étiqueté, suggestions de 48 dp, états « trop court », « chargement », « aucun résultat », « erreur » avec réessai ; attribution IGN |
| Vue carte | `components/StationMap.tsx` | Bulles de prix (la moins chère en vert uniquement si le prix est fiable) ; carte masquée aux lecteurs d'écran, la liste en est l'équivalent accessible |
| Économie sur un plein | `logic/savings.ts`, `StationRow` | Comparée à la station la plus chère **fiable** de la liste ; masquée sous 0,50 € ; stations anciennes ou en rupture exclues |
| Fiche enrichie | `components/detail/sections.tsx` | Tous les prix avec « ancien » et « rupture », horaires avec statut (« ouvert, ferme à 21:00 »), jour courant en gras, services |
| Évolution du prix | `components/PriceChart.tsx`, `logic/history.ts` | Courbe en escalier à une teinte, trait fin, grille discrète, un seul repère final, pas de légende (le titre nomme la série) ; résumé texte « de X à Y, prix actuel, en hausse/baisse de Z » ; message honnête quand il y a trop peu de relevés ; date du premier relevé |
| Alertes | `components/detail/AlertSection.tsx`, `AlertsList.tsx`, `state/Alerts.tsx` | Seuil réglé par pas de 0,05 € et 0,01 € (cibles de 48 dp), avertissement si le seuil est déjà atteint, état « active / déclenchée », bannière d'accueil quand une alerte est déclenchée, messages explicites sur l'état des notifications |
| Réglages | `components/SettingsModal.tsx` | Capacité du réservoir (pas de 5 L), interrupteur « masquer les prix anciens », alertes, à propos ; bandeau si l'enregistrement local échoue |
| Cache hors-ligne | `data/hooks.ts`, `logic/searchCache.ts` | Dernière recherche affichée au lancement et en cas de panne, bandeau « Données enregistrées le … » |

Principe constant : aucune information portée par la couleur seule, texte à l'échelle du système, cibles d'au moins 48 dp, chaque erreur propose une action de récupération.

Contrôle automatique (skill `mobile-uiux-pro-max`) : 0 erreur, verdict PASS. Le « score » affiché par l'outil chute avec le nombre de fichiers parce qu'il attend les états chargement/vide/erreur dans chaque fichier, y compris les composants d'affichage : à ne pas lire comme une régression.
