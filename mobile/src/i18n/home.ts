// Text of the map home screen (full-screen map, floating buttons, bottom sheet).
import type { FuelId } from '../contract'

export const FUEL_DOT_COLORS: Readonly<Record<FuelId, string>> = {
  gazole: '#CA8A04',
  sp95: '#16A34A',
  e10: '#65A30D',
  sp98: '#0F766E',
  e85: '#2563EB',
  gplc: '#7C3AED',
}

export const home = {
  routeButton: 'Itinéraire',
  routeTitle: 'Où allez-vous ?',
  routeBody: 'Cherchez une destination pour voir les stations sur le trajet.',
  routeAround: 'Stations autour de ce lieu',
  routeTo: 'Itinéraire jusqu’ici',
  routeClear: 'Quitter l’itinéraire',
  routeCorridor: (count: number) =>
    count === 0
      ? 'Aucune station sur le trajet.'
      : count === 1
        ? '1 station sur le trajet'
        : `${count} stations sur le trajet`,
  routeSummary: (distance: string, duration: string) => `${distance} · ${duration}`,
  routeFailed: 'Impossible de calculer le trajet. Réessayez dans un instant.',
  routeTooFar: 'Cette destination est trop éloignée pour un calcul de trajet.',
  routeNoRoute: 'Aucun trajet en voiture trouvé vers cette destination.',
  routeLoading: 'Calcul du trajet',
  routeDetour: (km: string) => `Détour ${km}`,

  settingsButton: 'Réglages',
  layersButton: 'Type de carte',
  layerStandard: 'Plan',
  layerSatellite: 'Satellite',
  locateButton: 'Centrer sur ma position',
  favoritesButton: 'Favoris',
  favoritesOn: 'Quitter les favoris',

  areaCount: (count: number) =>
    count === 0
      ? 'Aucune station dans cette zone'
      : count === 1
        ? '1 station dans cette zone'
        : `${count} stations dans cette zone`,
  areaCountMore: (shown: number, total: number) =>
    `${shown} stations affichées sur ${total} dans cette zone`,
  areaHint: 'Dézoomez pour voir plus de stations, zoomez pour resserrer.',
  areaTooWide: 'Zone trop large : zoomez pour afficher toutes les stations.',
  areaLoading: 'Recherche des stations',
  favoritesCount: (count: number) => (count === 1 ? '1 favori' : `${count} favoris`),
  listButton: 'Liste',
  mapButton: 'Carte',
  listOpenHint: 'Affiche la liste des stations',
  listCloseHint: 'Réduit la liste pour voir la carte',

  fuelMenu: 'Carburant',
  brandMenu: 'Enseignes',
  brandMenuAll: 'Toutes les enseignes',
  brandMenuCount: (count: number) => (count === 1 ? '1 enseigne' : `${count} enseignes`),
  sortMenu: 'Trier par',
  sortCheapest: 'Moins chère',
  sortNearest: 'Plus proche',
  menuClose: 'Fermer le menu',
  brandNone: 'Aucune enseigne connue dans cette zone.',

  verifiedToday: 'Vérifié aujourd’hui',
  brandBadgeLabel: (brand: string) => `Enseigne ${brand}`,
} as const
