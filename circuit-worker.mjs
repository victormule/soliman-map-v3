/**
 * Le routage du recentrage, calculé HORS du fil d'affichage.
 *
 * Pourquoi un worker : mesuré sur un recentrage à pleine profondeur (395 nœuds,
 * 465 arêtes), le routage prend ~4,6 s. Sur le fil principal, c'est une page
 * gelée — pas une lenteur, un blocage : plus de rotation, plus de survol, plus
 * de clic. Ici, la carte continue de vivre en tracé direct pendant cette
 * première route, ensuite partagée par toutes les profondeurs du même
 * recentrage. Si le focal change, la page remplace ce Worker : ce calcul
 * synchrone ne pourrait pas retirer tout seul un travail obsolète de sa file.
 *
 * Ce fichier ne contient AUCUNE règle : il ne fait que passer le plat. La règle
 * est dans circuit-router.mjs, la même que celle du build.
 */
import { routeCircuit } from './circuit-router.mjs';

self.onmessage = (ev) => {
  const { key, nodes, edges, opts } = ev.data;
  try {
    const { routes, report } = routeCircuit(nodes, edges, opts, false);
    // La CLÉ revient avec le résultat : entre l'envoi et la réponse, le visiteur
    // a pu changer de nœud focal. C'est l'appelant qui juge si
    // ce qu'il reçoit répond encore à ce qu'il regarde (voir onmessage côté page).
    self.postMessage({ key, routes, report });
  } catch (err) {
    self.postMessage({ key, error: String(err && err.stack || err) });
  }
};
