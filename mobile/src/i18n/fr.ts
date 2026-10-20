// All user-facing text lives here so another language can be added without touching components.
import type { FuelId } from '../contract'

export const fuelLabels: Readonly<Record<FuelId, string>> = {
  gazole: 'Gazole',
  e10: 'SP95-E10',
  sp95: 'SP95',
  sp98: 'SP98',
  e85: 'E85',
  gplc: 'GPLc',
}

export const fr = {
  appName: 'Carbu France',
  about: 'À propos',
  close: 'Fermer',
  retry: 'Réessayer',
  fuelGroup: 'Carburant',
  sortGroup: 'Trier par',
  radiusGroup: 'Rayon de recherche',
  sortPrice: 'Prix',
  sortDistance: 'Distance',
  radiusOption: (km: number) => `${km} km`,

  aroundYou: (km: number) => `Autour de vous · ${km} km`,
  aroundParis: (km: number) => `Autour de Paris · ${km} km`,

  perLiter: '€/L',
  cheapest: 'Le moins cher',
  open24h: '24h/24',
  shortageTemporary: 'Rupture temporaire',
  stalePrice: 'Prix ancien',
  updatedOn: (date: string) => `Mis à jour le ${date}`,
  openDetail: "Affiche l'itinéraire jusqu'à cette station",
  startNavigation: 'Lancer la navigation',
  mapsFailed: "Impossible d'ouvrir l'application de cartes.",
  routeFromParis: "L'itinéraire part du centre de Paris : votre position est indisponible.",
  routeSummary: (distance: string, duration: string) => `${distance} · ${duration} en voiture`,
  routeLoading: "Calcul de l'itinéraire",
  routeUnavailableTitle: 'Itinéraire indisponible',
  routeUnavailableBody:
    "Le calcul d'itinéraire est momentanément indisponible. Vous pouvez lancer la navigation directement.",
  routeNoRouteBody: 'Aucun itinéraire routier trouvé vers cette station.',
  routeTooFarBody: 'Cette station est trop loin pour afficher le tracé.',
  routeFailedBody: "Impossible de calculer l'itinéraire pour le moment.",
  mapAttribution: '© openrouteservice.org by HeiGIT | © OpenStreetMap contributors',
  mapAttributionOsrm: '© OpenStreetMap contributors | Routage : OSRM (serveur de démonstration)',
  mapLabel: (address: string) => `Carte de l'itinéraire vers ${address}`,
  yourPosition: 'Votre position',

  loadingResults: 'Chargement des prix',
  locating: 'Recherche de votre position',
  resultsCount: (count: number) =>
    count === 0 ? 'Aucune station' : count === 1 ? '1 station' : `${count} stations`,

  emptyTitle: 'Aucune station trouvée',
  emptyBody: (fuel: string, km: number) => `Aucune station ne propose du ${fuel} dans ${km} km.`,
  widenRadius: (km: number) => `Élargir à ${km} km`,

  errorTitle: 'Impossible de charger les prix',
  offlineBanner: 'Pas de connexion au serveur. Les dernières données restent affichées.',
  offlineBody: 'Vérifiez votre connexion internet, puis réessayez.',
  timeoutBody: 'Le serveur met trop de temps à répondre. Réessayez dans un instant.',
  rateLimitedBody: 'Trop de recherches en peu de temps. Patientez une minute.',
  serverBody: 'Le service rencontre un problème. Réessayez dans un instant.',
  staleBanner: 'Mise à jour impossible. Les dernières données restent affichées.',

  locationDeniedBanner: 'Localisation désactivée : la recherche porte sur Paris.',
  locationUnavailableBanner: 'Position introuvable : la recherche porte sur Paris.',
  allowLocation: 'Autoriser',
  openSettings: 'Ouvrir les réglages',

  credit: "Source : Ministère de l'Économie et des Finances, Licence Ouverte",
  creditBrands: "Enseignes : © contributeurs d'OpenStreetMap (ODbL)",
  aboutTitle: 'À propos de Carbu France',
  aboutDataTitle: 'Les prix',
  aboutData:
    "Les prix viennent des données ouvertes du Ministère de l'Économie et des Finances (flux « Prix des carburants en France »), sous Licence Ouverte 2.0. Ils sont déclarés par les stations et peuvent être en retard : la date de mise à jour est toujours affichée. Les enseignes viennent d'OpenStreetMap (© contributeurs d'OpenStreetMap, licence ODbL) et peuvent manquer ou être inexactes.",
  aboutPrivacyTitle: 'Vie privée',
  aboutPrivacy:
    "Votre position sert à chercher les stations proches. Elle est arrondie à environ 100 m avant l'envoi et n'est pas enregistrée. Quand vous affichez un itinéraire, cette position arrondie et la station ou la destination choisie sont transmises, via notre serveur, au service d'itinéraires OpenRouteService (HeiGIT). Il n'y a ni compte, ni publicité, ni suivi.",

  // Home: modes, views, places
  modeGroup: 'Mode',
  modeNearby: 'Autour de moi',
  modeFavorites: 'Favoris',
  viewGroup: 'Affichage',
  viewList: 'Liste',
  viewMap: 'Carte',
  settings: 'Réglages',
  placeSearchLabel: 'Rechercher une adresse',
  placeSearchPlaceholder: 'Adresse, ville ou code postal',
  placeTooShort: 'Saisissez au moins 3 caractères.',
  placeLoading: 'Recherche en cours',
  placeNone: 'Aucune adresse trouvée.',
  placeError: "La recherche d'adresse est indisponible. Réessayez dans un instant.",
  placeClear: 'Effacer la saisie',
  aroundPlace: (label: string, km: number) => `Autour de ${label} · ${km} km`,
  useMyPosition: 'Utiliser ma position',
  placeAttribution: 'Adresses : Géoplateforme (IGN)',

  favoritesEmptyTitle: 'Aucun favori',
  favoritesEmptyBody:
    'Ouvrez une station et touchez « Ajouter aux favoris » pour la retrouver ici, où que vous soyez.',
  favoritesMissing: (count: number) =>
    count === 1
      ? '1 favori n’a pas de prix pour ce carburant.'
      : `${count} favoris n’ont pas de prix pour ce carburant.`,
  hiddenStale: (count: number) =>
    count === 1
      ? '1 station au prix ancien masquée.'
      : `${count} stations au prix ancien masquées.`,
  cachedBanner: (date: string) => `Données enregistrées le ${date}.`,
  saving: (euros: string, liters: number) => `Économie de ${euros} pour un plein de ${liters} L`,
  mapListHint: 'Touchez un prix pour ouvrir la station.',
  mapPriceLabel: (price: string, address: string, brand: string | null) =>
    [brand, price, address].filter(Boolean).join(', '),

  // Brand filter
  brandGroup: 'Enseigne',
  brandAll: 'Toutes',
  brandSupermarkets: 'Supermarchés',
  brandChip: (brand: string, count: number) => (count > 0 ? `${brand} (${count})` : brand),

  // Detail
  addFavorite: 'Ajouter aux favoris',
  removeFavorite: 'Retirer des favoris',
  isFavorite: 'Favori',
  pricesTitle: 'Tous les prix',
  hoursTitle: 'Horaires',
  servicesTitle: 'Services',
  historyTitle: 'Évolution du prix',
  detailLoadError: 'Impossible de charger les détails de la station.',
  priceStale: 'ancien',
  priceShortage: 'rupture',
  openAlways: 'Ouvert 24h/24',
  openUntil: (time: string) => `Ouvert · ferme à ${time}`,
  closedOpensAt: (time: string) => `Fermé · ouvre à ${time}`,
  closedNow: 'Fermé',
  hoursUnknown: 'Horaires non communiqués.',
  closedDay: 'Fermé',
  today: "Aujourd'hui",
  dayNames: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'],

  historySince: (date: string) => `Relevés disponibles depuis le ${date}.`,
  historyTooShort: 'Pas encore assez de relevés pour tracer une courbe.',
  historyLoadError: "Impossible de charger l'historique.",
  historySummary: (parts: {
    days: number
    min: string
    max: string
    current: string
    change: string
  }) =>
    `Sur ${parts.days} jours : de ${parts.min} à ${parts.max}. Prix actuel ${parts.current} (${parts.change}).`,
  historyChangeUp: (amount: string) => `en hausse de ${amount}`,
  historyChangeDown: (amount: string) => `en baisse de ${amount}`,
  historyChangeFlat: 'stable',

  // Settings
  settingsTitle: 'Réglages',
  tankTitle: 'Capacité du réservoir',
  tankHelp:
    "Sert à estimer l'économie réalisée sur un plein, par rapport à la station la plus chère de la liste.",
  tankValue: (liters: number) => `${liters} L`,
  tankDecrease: 'Diminuer la capacité',
  tankIncrease: 'Augmenter la capacité',
  hideStaleTitle: 'Masquer les prix anciens',
  hideStaleHelp: 'Cache les stations dont le prix date de plus de 72 h.',
  saveFailed: "Vos préférences n'ont pas pu être enregistrées sur cet appareil.",

  // Price alerts
  alertsTitle: 'Alertes de prix',
  alertsIntro: 'Soyez prévenu quand le prix de ce carburant passe sous un seuil.',
  alertThresholdLabel: "Seuil de l'alerte",
  alertThresholdValue: (price: string) => `${price} ou moins`,
  alertLower: (step: string) => `Baisser le seuil de ${step}`,
  alertRaise: (step: string) => `Augmenter le seuil de ${step}`,
  alertAlreadyReached:
    "Ce seuil est déjà atteint : l'alerte se déclenchera dès la prochaine mise à jour des prix.",
  alertCreate: "Créer l'alerte",
  alertUpdate: 'Modifier le seuil',
  alertRemove: "Supprimer l'alerte",
  alertActive: (price: string) => `Alerte active : ${price} ou moins.`,
  alertTriggered: (price: string) => `Déclenchée : le prix est de ${price}.`,
  alertTooMany: 'Vous avez atteint 10 alertes. Supprimez-en une pour en créer une autre.',
  alertFailed: 'Impossible de joindre le serveur pour cette alerte. Réessayez.',
  alertsEmpty: "Aucune alerte pour l'instant. Ouvrez une station pour en créer une.",
  alertsLoadFailed: 'Impossible de charger vos alertes.',
  alertsBanner: (count: number) =>
    count === 1 ? '1 alerte de prix déclenchée.' : `${count} alertes de prix déclenchées.`,
  alertsSee: 'Voir',
  alertStationUnknown: 'Station absente des dernières données',
  alertRow: (parts: { fuel: string; threshold: string; current: string | null }) =>
    parts.current
      ? `${parts.fuel} · seuil ${parts.threshold} · actuel ${parts.current}`
      : `${parts.fuel} · seuil ${parts.threshold}`,
  pushUnknown: '',
  pushEnabled: 'Notifications activées : vous serez prévenu même application fermée.',
  pushDenied:
    "Notifications refusées : les alertes s'afficheront seulement dans l'application. Autorisez-les dans les réglages du téléphone.",
  pushUnsupportedExpoGoAndroid:
    "Notifications indisponibles dans Expo Go sur Android : les alertes s'afficheront dans l'application.",
  pushUnsupportedNoProject:
    "Notifications non configurées dans cette version : les alertes s'afficheront dans l'application.",
  pushError:
    "Activation des notifications impossible pour l'instant. Les alertes restent visibles dans l'application.",

  // Legal, support, erasure
  dataSection: 'Données et confidentialité',
  privacyLink: 'Politique de confidentialité',
  legalNoticeLink: 'Mentions légales',
  legalUpdated: (date: string) => `Dernière mise à jour : ${date}`,
  legalIncomplete: 'Texte incomplet : renseignez src/legal/content.json avant toute publication.',
  supportTitle: 'Soutenir le projet',
  supportHelp:
    "L'application est gratuite, sans publicité ni abonnement. Un don libre aide à couvrir l'hébergement.",
  supportOpenFailed: "Impossible d'ouvrir la page de don.",
  forgetTitle: 'Supprimer mes données',
  forgetHelp:
    'Efface de nos serveurs votre appareil, vos alertes et votre jeton de notification, puis vide les données de cette application (favoris, réglages).',
  forgetConfirmTitle: 'Supprimer vos données ?',
  forgetConfirmBody:
    'Vos alertes, vos favoris et vos réglages seront effacés. Cette action est définitive.',
  forgetConfirmAction: 'Supprimer',
  cancel: 'Annuler',
  forgetDone: 'Vos données ont été supprimées.',
  forgetFailed:
    "Suppression impossible pour l'instant : rien n'a été effacé. Vérifiez votre connexion et réessayez.",
  preferencesLoadFailed:
    "Vos favoris et réglages n'ont pas pu être lus sur cet appareil. Vos changements ne seront pas enregistrés pour ne pas écraser les données existantes.",

  rowLabel: (parts: {
    price: string
    distance: string
    address: string
    city: string
    brand: string | null
    notes: string[]
  }) =>
    [
      ...(parts.brand ? [parts.brand] : []),
      parts.price,
      `à ${parts.distance}`,
      `${parts.address}, ${parts.city}`,
      ...parts.notes,
    ].join(', '),
} as const
