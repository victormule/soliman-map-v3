/**
 * LE ROUTEUR ORTHOGONAL — une seule implémentation, deux appelants.
 *
 * `build-graph.mjs` l'appelle sur la cartographie, dont les positions sont
 * figées : le résultat part dans graph.json et le visiteur ne paie rien.
 * `index.html` l'appelle sur le RECENTRAGE, dont les positions sont calculées à
 * la volée et qu'aucun routage préparé ne peut donc décrire.
 *
 * Les deux ne peuvent pas diverger : c'est le même fichier. Un routeur recopié
 * dans la page aurait dérivé du jour où l'on aurait touché à un poids — et la
 * cartographie et le recentrage auraient dessiné deux circuits différents en
 * prétendant suivre la même règle.
 *
 * ── Pourquoi ce style (tableaux plats, aucune allocation dans les boucles)
 * La première version, écrite avec des objets `{x,y}`, des `Set` et des clés de
 * case en chaînes, mettait 39,6 s pour 594 arêtes. Correcte, et inutilisable :
 * le recentrage doit router pendant que la caméra recule, soit deux secondes,
 * navigateur compris. Ce qui coûtait n'était pas l'algorithme mais ce qu'on
 * jetait — des millions de petits objets. D'où ici : index entiers, tampons
 * réutilisés, marquage par estampille au lieu de `Set`. Même résultat, au trait
 * près ; le temps est passé sous la seconde.
 *
 * ⚠ Ne pas « simplifier » en revenant aux objets : c'est la seule raison d'être
 * de ce fichier.
 */

/**
 * Les réglages du routage. Ils vivent ICI, avec le code qui les lit, et non
 * dans build-graph.mjs : la page les lit aussi, et un réglage recopié des deux
 * côtés est un réglage qui ment d'un côté.
 */
export const ROUTE = {
  points: 6,        // sommets par arête, TOUJOURS (pire cas : Z à deux coudes biseautés)
  chamfer: 2.6,     // longueur du biseau à 45° qui coupe un coude
  splits: [-0.25, 0.35, 0.5, 0.65, 1.25],  // où couper un Z. Hors de [0,1], le
                    // trait SORT du rectangle a-b : l'échappée qui permet de
                    // contourner une zone dense au lieu d'y choisir le moins pire.
  wCross: 1.0,      // ce que coûte un croisement
  wOverlap: 2.0,    // ce que coûte un RECOUVREMENT (deux traits confondus se
                    // lisent comme un seul : pire qu'un croisement, qui se voit)
  wNode: 3.0,       // ce que coûte un nœud traversé — le plus lourd : un trait
                    // qui passe sous un post-it laisse croire à un lien absent
  wLen: 0.004,      // ce que coûte la longueur, à départager seulement
  clear: 0.6,       // marge gardée autour d'un nœud
  cell: 8,          // maille de la grille d'accélération
  ripup: 8,         // reprises (rip-up and reroute) — plafond de TEMPS, pas
                    // condition d'arrêt : la boucle sort d'elle-même (voir plus bas)
};

/** Le nombre de candidats se DÉDUIT de la table des partages : 2 L + 2 Z par
 *  partage. L'écrire à côté, ce serait le laisser mentir au premier réglage. */
export const candidateCount = (opts = ROUTE) => 2 + opts.splits.length * 2;

/**
 * Route un ensemble d'arêtes dans un plan.
 *
 * @param nodes  [{ id, x, y, r }]  — r = rayon du nœud (la marge est ajoutée ici)
 * @param edges  [{ source, target, rank }] — rank 0 passe avant rank 1 (les
 *               traits tracés à la main avant les cooccurrences calculées)
 * @param opts   surcharge de ROUTE (le vivant : `ripup` plus court pour le direct)
 * @param census `true` pour mesurer AUSSI le tracé direct — le build en a besoin
 *               pour la fiche, le navigateur non (c'est un second parcours complet)
 * @returns { routes, report } — routes[i] = Float64Array des points INTÉRIEURS
 *          de l'arête i (x,y entrelacés), ou null si une extrémité manque.
 */
export function routeCircuit(nodes, edges, opts = {}, census = false) {
  const O = { ...ROUTE, ...opts };
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // ── Les nœuds, à plat ─────────────────────────────────────────────────────
  const N = nodes.length;
  const nx = new Float64Array(N), ny = new Float64Array(N), nr = new Float64Array(N);
  const indexOfId = new Map();
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    nx[i] = n.x; ny[i] = n.y; nr[i] = n.r + O.clear;
    indexOfId.set(n.id, i);
  }

  // ── La grille. Bornes calculées sur les nœuds ET élargies : un Z à partage
  //    1,25 sort volontairement du nuage, et une case hors bornes doit rester
  //    une case, pas un débordement silencieux.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < N; i++) {
    if (nx[i] < minX) minX = nx[i];
    if (nx[i] > maxX) maxX = nx[i];
    if (ny[i] < minY) minY = ny[i];
    if (ny[i] > maxY) maxY = ny[i];
  }
  const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);
  const pad = Math.max(spanX, spanY) * 0.6;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const cell = O.cell;
  const GX = Math.max(1, Math.ceil((maxX - minX) / cell));
  const GY = Math.max(1, Math.ceil((maxY - minY) / cell));
  const cx0 = v => Math.min(GX - 1, Math.max(0, Math.floor((v - minX) / cell)));
  const cy0 = v => Math.min(GY - 1, Math.max(0, Math.floor((v - minY) / cell)));

  // Nœuds par case : une seule construction, jamais retouchée.
  const nodeCells = new Array(GX * GY);
  for (let i = 0; i < N; i++) {
    const a = cx0(nx[i] - nr[i]), b = cx0(nx[i] + nr[i]);
    const c = cy0(ny[i] - nr[i]), d = cy0(ny[i] + nr[i]);
    for (let x = a; x <= b; x++) for (let y = c; y <= d; y++) {
      const k = y * GX + x;
      (nodeCells[k] || (nodeCells[k] = [])).push(i);
    }
  }

  // ── Les segments posés. Tampons plats qui grandissent par doublement ; un
  //    segment retiré libère sa place (pile `freeSlots`), donc le stock ne
  //    grandit pas à chaque reprise.
  let cap = 1024;
  let sx1 = new Float64Array(cap), sy1 = new Float64Array(cap);
  let sx2 = new Float64Array(cap), sy2 = new Float64Array(cap);
  let sOwner = new Int32Array(cap);
  let stamp = new Int32Array(cap);
  let segCount = 0;
  const freeSlots = [];
  const segCells = new Array(GX * GY);

  function growSegs() {
    const c2 = cap * 2;
    const g = (old, T) => { const a = new T(c2); a.set(old); return a; };
    sx1 = g(sx1, Float64Array); sy1 = g(sy1, Float64Array);
    sx2 = g(sx2, Float64Array); sy2 = g(sy2, Float64Array);
    sOwner = g(sOwner, Int32Array); stamp = g(stamp, Int32Array);
    cap = c2;
  }
  function addSeg(x1, y1, x2, y2, owner) {
    let s;
    if (freeSlots.length) s = freeSlots.pop();
    else { if (segCount === cap) growSegs(); s = segCount++; }
    sx1[s] = x1; sy1[s] = y1; sx2[s] = x2; sy2[s] = y2; sOwner[s] = owner; stamp[s] = 0;
    const a = cx0(Math.min(x1, x2)), b = cx0(Math.max(x1, x2));
    const c = cy0(Math.min(y1, y2)), d = cy0(Math.max(y1, y2));
    for (let x = a; x <= b; x++) for (let y = c; y <= d; y++) {
      const k = y * GX + x;
      (segCells[k] || (segCells[k] = [])).push(s);
    }
    return s;
  }
  function removeSeg(s) {
    const a = cx0(Math.min(sx1[s], sx2[s])), b = cx0(Math.max(sx1[s], sx2[s]));
    const c = cy0(Math.min(sy1[s], sy2[s])), d = cy0(Math.max(sy1[s], sy2[s]));
    for (let x = a; x <= b; x++) for (let y = c; y <= d; y++) {
      const arr = segCells[y * GX + x];
      if (!arr) continue;
      // Retrait par échange avec le dernier : l'ordre d'une case n'a aucun sens,
      // et un splice recopierait la queue à chaque reprise.
      const i = arr.indexOf(s);
      if (i >= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); }
    }
    sOwner[s] = -1;
    freeSlots.push(s);
  }

  // ── Géométrie ─────────────────────────────────────────────────────────────
  /** 0 = rien · 1 = croisement · 2 = recouvrement (colinéaires qui se chevauchent) */
  function meet(ax, ay, bx, by, cxx, cyy, dx2, dy2) {
    const rx = bx - ax, ry = by - ay;
    const sx = dx2 - cxx, sy = dy2 - cyy;
    const rxs = rx * sy - ry * sx;
    const qx = cxx - ax, qy = cyy - ay;
    const qpxr = qx * ry - qy * rx;
    if (rxs > -1e-9 && rxs < 1e-9) {
      if (qpxr > 1e-9 || qpxr < -1e-9) return 0;
      const rr = rx * rx + ry * ry;
      if (rr < 1e-12) return 0;
      const t0_ = (qx * rx + qy * ry) / rr;
      const t1_ = t0_ + (sx * rx + sy * ry) / rr;
      const lo = t0_ < t1_ ? t0_ : t1_, hi = t0_ < t1_ ? t1_ : t0_;
      return (hi > 1e-6 && lo < 1 - 1e-6) ? 2 : 0;
    }
    const t = (qx * sy - qy * sx) / rxs;
    const u = qpxr / rxs;
    // Bornes STRICTES : deux arêtes qui partagent un nœud se touchent à leur
    // extrémité — c'est le tableau, pas un croisement à éviter.
    return (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) ? 1 : 0;
  }
  function distToSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    if (l2 < 1e-12) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  // ── Coût d'une polyligne ──────────────────────────────────────────────────
  // Les estampilles remplacent les `Set` : `segStamp` est remis à zéro par
  // simple incrément du compteur, jamais réalloué.
  let tick = 0;
  const nodeStamp = new Int32Array(N);
  let outCross = 0, outOver = 0, outHits = 0;

  /**
   * @param P tampon plat x,y entrelacés · @param np nombre de points
   * @param limit ÉLAGAGE : au-delà de ce coût, on abandonne le candidat en
   *   route. Tous les termes du coût sont positifs, donc la somme partielle ne
   *   redescendra jamais — un candidat déjà plus cher que le meilleur connu est
   *   déjà perdu, et le mesurer jusqu'au bout ne sert qu'à le confirmer. C'est
   *   ce qui rend le routage tenable dans un navigateur : la plupart des
   *   candidats meurent au premier segment. Le recensement, lui, appelle sans
   *   limite — il ne cherche pas, il compte.
   */
  function costOf(P, np, srcIdx, dstIdx, owner, limit = Infinity) {
    let cross = 0, over = 0, hits = 0, len = 0;
    const nodeTick = ++tick;
    for (let i = 0; i < np - 1; i++) {
      const ax = P[i * 2], ay = P[i * 2 + 1], bx = P[i * 2 + 2], by = P[i * 2 + 3];
      len += Math.hypot(bx - ax, by - ay);
      // Une estampille PAR SEGMENT pour les segments posés (deux segments
      // distincts de la même polyligne ont le droit de croiser tous deux), une
      // SEULE pour les nœuds (un nœud est rasé par un trait, pas par un segment).
      const segTick = ++tick;
      const ca = cx0(ax < bx ? ax : bx), cb = cx0(ax < bx ? bx : ax);
      const cc = cy0(ay < by ? ay : by), cd = cy0(ay < by ? by : ay);
      for (let x = ca; x <= cb; x++) for (let y = cc; y <= cd; y++) {
        const k = y * GX + x;
        const arr = segCells[k];
        if (arr) for (let z = 0; z < arr.length; z++) {
          const s = arr[z];
          if (stamp[s] === segTick || sOwner[s] === owner) continue;
          stamp[s] = segTick;
          const m = meet(ax, ay, bx, by, sx1[s], sy1[s], sx2[s], sy2[s]);
          if (m === 1) cross++; else if (m === 2) over++;
        }
        const narr = nodeCells[k];
        if (narr) for (let z = 0; z < narr.length; z++) {
          const n = narr[z];
          if (n === srcIdx || n === dstIdx || nodeStamp[n] === nodeTick) continue;
          nodeStamp[n] = nodeTick;
          if (distToSeg(nx[n], ny[n], ax, ay, bx, by) < nr[n]) hits++;
        }
      }
      // Élagage, une fois par segment : assez tôt pour trancher, assez rare
      // pour ne rien coûter.
      if (cross * O.wCross + over * O.wOverlap + hits * O.wNode + len * O.wLen >= limit) return Infinity;
    }
    outCross = cross; outOver = over; outHits = hits;
    return cross * O.wCross + over * O.wOverlap + hits * O.wNode + len * O.wLen;
  }

  // ── Les chemins possibles : deux L (un coude), deux Z par partage ─────────
  const CAND = candidateCount(O);
  const candBuf = new Float64Array(CAND * 8);   // 4 points max par candidat
  const candLen = new Int32Array(CAND);
  function buildCandidates(ax, ay, bx, by) {
    let c = 0;
    const put = (pts) => { candBuf.set(pts, c * 8); candLen[c] = pts.length / 2; c++; };
    put([ax, ay, bx, ay, bx, by]);
    put([ax, ay, ax, by, bx, by]);
    for (let i = 0; i < O.splits.length; i++) {
      const t = O.splits[i];
      const mx = ax + (bx - ax) * t, my = ay + (by - ay) * t;
      put([ax, ay, mx, ay, mx, by, bx, by]);
      put([ax, ay, ax, my, bx, my, bx, by]);
    }
  }

  // ── Les arêtes à router, dans l'ordre de pose ─────────────────────────────
  // Les traits tracés à la main d'abord (c'est le geste des auteur·rices, il a
  // priorité sur une cooccurrence calculée), puis du plus court au plus long :
  // un court a peu de latitude, un long saura contourner. Ordre totalement
  // déterministe — l'identifiant départage les ex æquo.
  const jobs = [];
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const a = indexOfId.get(e.source), b = indexOfId.get(e.target);
    if (a === undefined || b === undefined || a === b) continue;
    jobs.push({ i, a, b, len: Math.hypot(nx[b] - nx[a], ny[b] - ny[a]), rank: e.rank || 0, s: e.source, t: e.target });
  }
  jobs.sort((u, v) => u.rank - v.rank || u.len - v.len
    || (u.s < v.s ? -1 : u.s > v.s ? 1 : 0)
    || (u.t < v.t ? -1 : u.t > v.t ? 1 : 0));

  // ── Pose ──────────────────────────────────────────────────────────────────
  const chosen = new Array(jobs.length);   // Float64Array des points retenus
  const chosenN = new Int32Array(jobs.length);
  const segsOf = new Array(jobs.length);   // indices des segments posés

  function bestFor(ji) {
    const j = jobs[ji];
    buildCandidates(nx[j.a], ny[j.a], nx[j.b], ny[j.b]);
    let best = -1, bs = Infinity;
    for (let c = 0; c < CAND; c++) {
      const sub = candBuf.subarray(c * 8, c * 8 + candLen[c] * 2);
      // On passe le meilleur coût connu comme plafond : les candidats suivants
      // n'ont qu'à prouver qu'ils font mieux, pas à dire de combien ils font pire.
      const sc = costOf(sub, candLen[c], j.a, j.b, ji, bs);
      if (sc < bs - 1e-9) { bs = sc; best = c; }
    }
    return best;
  }
  function place(ji, c) {
    const np = candLen[c];
    const pts = candBuf.slice(c * 8, c * 8 + np * 2);
    chosen[ji] = pts; chosenN[ji] = np;
    const segs = [];
    for (let i = 0; i < np - 1; i++) {
      segs.push(addSeg(pts[i * 2], pts[i * 2 + 1], pts[i * 2 + 2], pts[i * 2 + 3], ji));
    }
    segsOf[ji] = segs;
  }
  function lift(ji) {
    const segs = segsOf[ji];
    if (segs) for (let i = 0; i < segs.length; i++) removeSeg(segs[i]);
    segsOf[ji] = null;
  }

  for (let ji = 0; ji < jobs.length; ji++) place(ji, bestFor(ji));

  /**
   * La REPRISE (rip-up and reroute), empruntée aux routeurs de circuits.
   *
   * Un glouton pur souffre de son ordre : les premières arêtes choisissent dans
   * un plan vide, prennent le chemin le plus court, et ce sont les dernières qui
   * paient — elles n'ont plus que des passages encombrés. On retire donc chaque
   * arête à son tour et on la repose face au tracé COMPLET, celui qu'elle
   * n'avait pas pu voir la première fois. On itère tant que ça bouge : le coût
   * total ne peut que baisser (chaque repose choisit un candidat au moins aussi
   * bon que celui qu'on vient d'ôter), donc la boucle converge — le plafond
   * `ripup` n'est qu'une garantie de temps, jamais la condition d'arrêt.
   */
  let passes = 0, moves = 0;
  for (let p = 0; p < O.ripup; p++) {
    moves = 0;
    for (let ji = 0; ji < jobs.length; ji++) {
      const beforeN = chosenN[ji], before = chosen[ji];
      lift(ji);
      const c = bestFor(ji);
      place(ji, c);
      if (chosenN[ji] !== beforeN) moves++;
      else { for (let k = 0; k < beforeN * 2; k++) if (before[k] !== chosen[ji][k]) { moves++; break; } }
    }
    passes = p + 1;
    if (!moves) break;   // plus rien à gagner : inutile de repasser
  }

  // ── Recensement (facultatif) ──────────────────────────────────────────────
  // Il ne peut PAS être accumulé pendant la recherche : le coût qu'une arête
  // voyait en se posant ne comptait que ce qui était déjà là, et la reprise a
  // tout rebattu depuis. On repart donc d'un plan vide qui se remplit — ainsi
  // chaque croisement est compté par UNE des deux arêtes qui le forment.
  const report = { passes, moves, elbows: 0, ms: 0 };
  for (let ji = 0; ji < jobs.length; ji++) report.elbows += chosenN[ji] - 2;

  if (census) {
    const measure = (getPts, getN) => {
      // On vide le plan sans le réallouer : tous les segments repartent au stock.
      for (let ji = 0; ji < jobs.length; ji++) lift(ji);
      let cross = 0, over = 0, hits = 0;
      for (let ji = 0; ji < jobs.length; ji++) {
        const j = jobs[ji];
        const P = getPts(ji), np = getN(ji);
        costOf(P, np, j.a, j.b, -1);
        cross += outCross; over += outOver; hits += outHits;
        const segs = [];
        for (let i = 0; i < np - 1; i++) segs.push(addSeg(P[i*2], P[i*2+1], P[i*2+2], P[i*2+3], ji));
        segsOf[ji] = segs;
      }
      return { cross, over, hits };
    };
    const keptPts = chosen.slice(), keptN = chosenN.slice();
    const straightBuf = jobs.map(j => Float64Array.from([nx[j.a], ny[j.a], nx[j.b], ny[j.b]]));
    const direct = measure(ji => straightBuf[ji], () => 2);
    const circuit = measure(ji => keptPts[ji], ji => keptN[ji]);
    report.straightCross = direct.cross;
    report.straightNodeHits = direct.hits;
    report.circuitCross = circuit.cross;
    report.overlaps = circuit.over;
    report.nodeHits = circuit.hits;
  }

  // ── Biseau, remplissage, écriture ─────────────────────────────────────────
  // Le biseau et le remplissage n'arrivent qu'ICI, sur le tracé définitif : ce
  // sont des affaires de rendu, elles n'ont rien à faire dans la recherche (un
  // biseau de 2,6 unités ne change aucun croisement, et le faire calculer à
  // chaque candidat, c'était douze fois le travail pour rien).
  const routes = new Array(edges.length).fill(null);
  for (let ji = 0; ji < jobs.length; ji++) {
    const pts = padTo(chamfer(chosen[ji], chosenN[ji], O.chamfer), O.points);
    // Seuls les points INTÉRIEURS sortent : les extrémités se relisent sur les
    // nœuds, qui bougent. Les figer, c'est les voir se décrocher de leur nœud
    // dès la première animation.
    routes[jobs[ji].i] = pts.slice(2, pts.length - 2);
  }
  report.ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
  return { routes, report };
}

/** Le biseau à 45° qui fait l'allure d'un circuit : un angle droit coupé. */
function chamfer(P, np, amount) {
  const out = [P[0], P[1]];
  for (let i = 1; i < np - 1; i++) {
    const px = P[i*2], py = P[i*2+1];
    const qx = P[i*2-2], qy = P[i*2-1];
    const rx = P[i*2+2], ry = P[i*2+3];
    const d1 = Math.hypot(px - qx, py - qy), d2 = Math.hypot(rx - px, ry - py);
    const c = Math.min(amount, d1 / 2, d2 / 2);
    if (!(c > 1e-6)) { out.push(px, py); continue; }
    out.push(px + (qx - px) / d1 * c, py + (qy - py) / d1 * c);
    out.push(px + (rx - px) / d2 * c, py + (ry - py) / d2 * c);
  }
  out.push(P[np*2-2], P[np*2-1]);
  return out;
}

/** Amener une polyligne à `k` sommets en coupant les plus longs segments — les
 *  coudes sont conservés TELS QUELS, jamais rééchantillonnés (un
 *  rééchantillonnage régulier arrondirait les angles, et le circuit n'a d'allure
 *  que par ses angles). */
function padTo(flat, k) {
  const out = flat.slice();
  while (out.length / 2 < k) {
    let bi = 0, bl = -1;
    for (let i = 0; i < out.length / 2 - 1; i++) {
      const l = Math.hypot(out[i*2+2] - out[i*2], out[i*2+3] - out[i*2+1]);
      if (l > bl) { bl = l; bi = i; }
    }
    out.splice(bi * 2 + 2, 0, (out[bi*2] + out[bi*2+2]) / 2, (out[bi*2+1] + out[bi*2+3]) / 2);
  }
  return out;
}
