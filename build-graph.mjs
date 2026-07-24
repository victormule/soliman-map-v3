/**
 * build-graph.mjs — export_miro.json  ->  graph.json
 *
 *   node build-graph.mjs
 *
 * Le graphe expédié au navigateur est un PRODUIT, jamais une source : il se
 * régénère entièrement depuis l'export Miro. Toute règle de dérivation vit ici,
 * en clair, et se DIT quand elle rejette quelque chose (cf. l'audit de config.js
 * : une donnée qui n'agit pas n'a rien à faire dans le fichier ; une règle qui
 * jette doit s'annoncer, pas faire semblant).
 *
 * Les tables ci-dessous (sections, regards, sous-thèmes) sont ÉDITORIALES :
 * elles portent des noms et des couleurs qu'aucun algorithme ne peut deviner.
 * Le reste est dérivé.
 *
 * ⚠ LA COULEUR NE DIT PAS LA MÊME CHOSE PARTOUT (audit de juillet 2026) :
 * HORS du cadre Miro, la couleur de remplissage désigne un REGARD (la légende
 * du tableau) ; DANS le cadre « Vue d'ensemble », elle désigne un SOUS-THÈME
 * (onze grappes, chacune titrée par un post-it « x … » de la même couleur).
 * L'ancien build lisait « regard » partout : ~105 attributions du cadre
 * étaient des contresens (le bleu ciel y est « Inhumation symbolique », pas
 * « Musée du Quai Branly »). Ne pas ré-unifier ces deux lectures.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// Le routeur orthogonal (§ 9). Partagé avec la page, qui route le recentrage à
// la volée : une seule implémentation, donc une seule règle. Aucune API Node
// dedans — c'est ce qui lui permet d'être aussi un module du navigateur.
import { routeCircuit, ROUTE, candidateCount } from './circuit-router.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'export_miro.json');
const OUT = join(HERE, 'graph.json');

// ══════════════════════════════════════════════════════ Tables éditoriales

/**
 * Les 14 sections = les BLOCS TITRÉS du tableau lui-même (audit de juillet
 * 2026 : l'ancienne grille de 6 ancres absorbait des blocs entiers dans le
 * mauvais voisin — la désocialisation dans « Cas pratiques », la monstration
 * dans « Représentations du meurtre »…). Chaque bloc porte une ou plusieurs
 * `anchors` (coordonnées Miro brutes) : le centre de son contenu, plus, quand
 * le titre est excentré, une ancre sous le titre — un post-it rejoint la
 * section de l'ancre la plus proche. `s_frame` fait exception : ses membres
 * sont les enfants du cadre Miro, pas un voisinage.
 */
const SECTIONS = [
  { id: 's_frame',  name: "Vue d'ensemble",                          color: '#d9c9a3', anchors: null },
  { id: 'b_cas',    name: "Cas pratiques d'autres horizons",         color: '#7fa398', anchors: [[4400, 150], [5800, -285], [4300, 450]] },
  { id: 'b_restit', name: "Restituer le corps à l'État syrien",      color: '#56b3a7', anchors: [[4500, -900], [5300, -1050]] },
  { id: 'b_desoc',  name: "(Dé)socialisation du corps",              color: '#9b7fd4', anchors: [[4900, -2900], [5730, -2800]] },
  { id: 'b_sacre',  name: "Restes humains et objets sacrés",         color: '#d4b95e', anchors: [[4500, -1800], [5700, -1750]] },
  { id: 'b_natur',  name: "Naturalisation du corps",                 color: '#8a94b8', anchors: [[7800, -1500], [9100, -1600]] },
  { id: 'b_conserv',name: "Conditions de conservation",              color: '#4e9bc7', anchors: [[8200, 100], [9150, -150]] },
  { id: 'b_deonto', name: "Questions déontologiques",                color: '#d47f6a', anchors: [[12300, -1400], [13600, -1900]] },
  { id: 'b_inhum',  name: "Inhumation symbolique",                   color: '#b5654f', anchors: [[11900, 300], [12300, 1100], [12300, 1750], [13740, 60], [11500, 900]] },
  { id: 'b_integ',  name: "Intégrités physiques et morales",         color: '#c47ab8', anchors: [[8600, 1500], [9400, 1300], [10520, 900], [7650, 1650]] },
  { id: 'b_nommer', name: "Nommer le corps",                         color: '#a3607a', anchors: [[8100, 2700], [9600, 2450], [7000, 2800], [7600, 2450]] },
  { id: 'b_repr',   name: "Représentations du meurtre de Kléber",    color: '#7a9a72', anchors: [[4700, 2700], [5825, 2400]] },
  { id: 'b_montrer',name: "Montrer le corps en institution muséale", color: '#86b85c', anchors: [[4700, 1500], [6160, 1050], [4650, 1000]] },
  { id: 'b_esaa',   name: "Retours des étudiant·es de l'ESAA",       color: '#c99a4b', anchors: [[13850, 3050], [12600, 2900], [10900, 3400]] },
];

/** Au-delà de cette distance de toute ancre, un post-it n'est pas sur le
 *  tableau : il est garé à côté (mots doux, émojis). Le plus grand écart
 *  légitime observé vaut ~740 ; les intrus sont à ~6700. */
const OFF_BOARD_DIST = 3000;

/**
 * Les 11 regards, et la couleur de remplissage Miro qui les désigne — HORS DU
 * CADRE UNIQUEMENT (dans le cadre, la couleur dit le sous-thème, voir
 * SOUS_THEMES). `aliases` : les couleurs que les auteur·rices ont employées
 * pour le MÊME regard sans tomber pile sur la couleur de la légende. Ce n'est
 * pas un calcul de proximité — c'est cette liste-ci, et rien d'autre. Une
 * couleur absente d'ici reste « non classée » : mieux vaut ne rien dire que
 * mal attribuer un point de vue.
 *
 * ⚠ DEUX jaunes proches, à ne pas confondre. (1) `#fff6b6` est un hex CHOISI,
 * et c'est EXACTEMENT la couleur que la légende du tableau donne à « Média »
 * (le sticky « Média » de la légende est #fff6b6) : les douze post-its
 * hors-cadre qui la portent sont donc classés « Média », fidèlement à la
 * légende. (2) `light_yellow` est le NOM de la couleur PAR DÉFAUT d'un sticky
 * Miro (jamais recoloré), stocké littéralement « light_yellow » : il n'entre
 * PAS dans regardByColor (qui n'a que des hex), reste « non classé », et ses
 * douze post-its sont des cas de restitution. Coïncidence troublante : les
 * deux jaunes valent chacun douze. Une couleur qu'on obtient sans la choisir
 * (le défaut) ne peut pas désigner un point de vue ; une couleur choisie et
 * déclarée en légende, si.
 */
const REGARDS = [
  { key: 'musee_homme',  name: "Musée de l'Homme",                       color: '#ffdc4a', aliases: [] },
  { key: 'musee_branly', name: 'Musée du Quai Branly',                   color: '#c6dcff', aliases: [] },
  { key: 'historien',    name: 'Historien·ne',                           color: '#ff6464', aliases: [] },
  { key: 'juriste',      name: 'Juriste',                                color: '#adf0c7', aliases: [] },
  { key: 'abounaddara',  name: 'Collectif Abounaddara',                  color: '#659df2', aliases: [] },
  { key: 'conservateur', name: 'Conservateur·rice-restaurateur·rice',    color: '#ffc6c6', aliases: [] },
  { key: 'media',        name: 'Média',                                  color: '#fff6b6', aliases: [] },
  { key: 'esaa',         name: 'ESAA',                                   color: '#df67c2', aliases: ['#d20aa2'] },
  { key: 'phrenologie',  name: 'Phrénologie',                            color: '#bd0a0a', aliases: [] },
  { key: 'philosophe',   name: 'Philosophe',                             color: '#af7e04', aliases: [] },
  { key: 'islam',        name: 'Islam',                                  color: '#067429', aliases: [] },
];

const NEUTRAL_REGARD_COLOR = '#6d6656';

/**
 * Les 11 sous-thèmes du cadre « Vue d'ensemble » : les grappes de couleur de
 * le canevas de départ, chacune titrée sur le tableau par un post-it « x … » de la même
 * couleur. `colors` est la table de correspondance (remplissage Miro) ;
 * `color` la teinte d'affichage. Le jaune #ffdc4a sert DEUX grappes : on
 * départage par l'ancre du titre (coordonnées RELATIVES au cadre, comme les
 * positions de ses enfants) — et l'affichage de « Restitution du squelette »
 * prend un jaune assombri, sinon les deux se confondraient à l'écran.
 * Le rouge #bd0a0a du cadre n'a AUCUN titre « x … » : il reste « sans
 * sous-thème », et le build l'annonce.
 */
const SOUS_THEMES = [
  { key: 'st_inhum',    name: 'Inhumation symbolique',              color: '#c6dcff', colors: ['#c6dcff'] },
  { key: 'st_integrite',name: 'Intégrité du squelette',             color: '#dedaff', colors: ['#dedaff'] },
  { key: 'st_monstr',   name: 'Monstration du corps',               color: '#7bdbfa', colors: ['#7bdbfa'] },
  { key: 'st_denomin',  name: 'Dénomination',                       color: '#fff6b6', colors: ['#fff6b6'] },
  { key: 'st_conserv',  name: 'Conditions de conservation',         color: '#adf0c7', colors: ['#adf0c7'] },
  { key: 'st_social',   name: 'Socialisation / désocialisation',    color: '#ffdc4a', colors: ['#ffdc4a'], anchor: [1961, 1322] },
  { key: 'st_restitsq', name: 'Restitution du squelette',           color: '#dfa32e', colors: ['#ffdc4a'], anchor: [2051, 709] },
  { key: 'st_deonto',   name: 'Questions déontologiques',           color: '#f8d3af', colors: ['#f8d3af'] },
  { key: 'st_sacre',    name: 'Restes humains / objets sacrés',     color: '#94d377', colors: ['#94d377'] },
  { key: 'st_natur',    name: 'Naturalisation du corps',            color: '#b9a4e6', colors: ['#b9a4e6', '#6631d7'] },
  { key: 'st_recits',   name: 'Images et récits autour de Soliman', color: '#ffc6c6', colors: ['#ffc6c6'] },
];

/**
 * Les 5 FORMES — « Comment ? », le registre d'un post-it : sous quelle forme la
 * chose est dite, non de quoi elle parle (« Pourquoi ? ») ni qui la porte
 * (« Qui ? »).
 *
 * ⚠ Cet axe est un CRIBLE, pas une coloration. Quatre post-its sur cinq sont
 * de simples notes : la carte ne s'en trouve pas bariolée, elle laisse
 * apparaître la centaine d'items qui ne sont PAS des notes — les voix
 * rapportées, ce qui vient du dehors, ce qui se montre. « Note » reçoit donc
 * une teinte calme, non parce qu'on l'efface (l'isolé du Tissu garde la
 * sienne, et c'est la bonne règle quand la classe est minoritaire) mais parce
 * qu'ici la classe dominante EST le fond sur lequel les autres se lisent.
 *
 * PRIORITÉ DÉCLARÉE, une seule classe par nœud — comme tous les autres axes,
 * pour que les comptes s'additionnent à 100 % :
 *
 *   image > appareil > lien/référence > citation > note
 *
 * Un post-it qui cite ET porte un lien (6 cas) compte comme référence : le lien
 * est un fait de l'item, la citation une lecture de son texte. Le fait prime.
 */
const FORMES = [
  { key: 'f_note',   name: 'Note',               color: '#6f7c93' },
  { key: 'f_cit',    name: 'Citation rapportée', color: '#d8a13a' },
  { key: 'f_ref',    name: 'Lien / référence',   color: '#4bb3c4' },
  { key: 'f_img',    name: 'Image',              color: '#a878d8' },
  { key: 'f_app',    name: 'Appareil du tableau', color: '#8a8f6d' },
];

/**
 * La CITATION est la seule classe de cet axe qui s'interprète — les quatre
 * autres se lisent dans la structure de l'item (son type, ses liens, sa
 * nature). Les guillemets, seuls, ne suffisent pas : sur cinquante post-its
 * qui en portent, treize les emploient en MENTION (« restes humains »,
 * « corps sacré » — on désigne le terme, on ne rapporte pas une voix).
 *
 * D'où la règle, écrite ici et affichée dans la fiche méthode : un passage
 * entre guillemets compte comme citation s'il est LONG (≥ CITATION_MIN_LEN),
 * ou s'il occupe l'ESSENTIEL du post-it (≥ CITATION_MIN_COVER). Une mention
 * tient en deux mots au milieu d'une phrase ; une citation porte le post-it.
 *
 * C'est une heuristique, elle est dite comme telle, et quelques faux positifs
 * subsistent : c'est le prix d'une classe qui, sans elle, n'existerait pas.
 * Elle vaut pour « repéré », jamais pour « relevé ».
 */
const CITATION_MIN_LEN = 25;     // caractères cités d'affilée
const CITATION_MIN_COVER = 0.5;  // ou part du post-it occupée par la citation
const QUOTED_SPAN = /[«“"]\s*([^«»“”"]{3,})\s*[»”"]/g;

/**
 * Les 4 TEMPS du tableau. `createdAt` est la seule donnée présente sur 100 %
 * des items — mieux couverte que « regard » — et c'est un RELEVÉ de l'outil,
 * ni une déclaration des auteur·rices ni un calcul sur le graphe : sa propre
 * nature, dite comme telle dans la légende du site.
 *
 * Les bornes ne sont pas régulières : elles suivent les PHASES DE TRAVAIL du
 * tableau — le canevas, l'atelier, les reprises, l'enquête (voir `hint`) —, et
 * non un calendrier régulier. À ne pas confondre avec les grands SILENCES de
 * l'archive (census.silencesHours) : ceux-là montrent que le temps n'est pas un
 * continuum, mais ils NE définissent PAS les bornes — les plus longs tombent au
 * milieu des « reprises », pas à ses lisières. `until` est une borne SUPÉRIEURE
 * EXCLUSIVE ; la dernière période prend tout ce qui suit.
 *
 * « PÉRIODE », et surtout pas « session » : une période n'est PAS une séance
 * de travail. À une coupure de 48 h le tableau compte huit séances — les 1re
 * et 2e périodes n'en forment qu'UNE à elles deux, tandis que la 3e en
 * contient plusieurs (sept jours de travail étalés sur trois mois). Nommer
 * ces tranches « sessions » affirmerait un rythme de travail qui n'a pas eu
 * lieu. L'ordinal dit le temps qui passe ; ce que la période a FAIT et ses
 * dates exactes vivent dans `hint`, que le site affiche au SURVOL — un nom
 * court se lit, une borne se vérifie.
 *
 * ⚠ Le jour, jamais l'heure. L'horodatage complet dirait à quelle heure de la
 * nuit telle personne travaillait seule : ce n'est pas le sujet du site, et
 * l'archive n'autorise pas à le publier. `n.date` est donc tronquée au jour.
 */
const PERIODES = [
  { key: 't1', name: '1re période', color: '#6b5fa0', until: '2025-10-28', hint: 'le canevas · 23 → 27 octobre 2025, avant l\'atelier' },
  { key: 't2', name: '2e période',  color: '#c4566e', until: '2025-10-30', hint: 'l\'atelier · 28 et 29 octobre 2025, à plusieurs mains' },
  { key: 't3', name: '3e période',  color: '#e09354', until: '2026-02-01', hint: 'les reprises · novembre 2025 → janvier 2026, retours espacés' },
  { key: 't4', name: '4e période',  color: '#f0dcae', until: null,         hint: 'l\'enquête · février 2026, les retours ESAA et les derniers apports' },
];

/**
 * Compression de la chronologie pour l'introduction.
 *
 * 78 % suivent le RANG des objets : les journées très productives restent
 * lisibles au lieu de surgir dans une seule image. 22 % suivent le logarithme
 * du temps civil : les longues interruptions gardent une respiration, sans
 * immobiliser l'introduction pendant des semaines ramenées à trois secondes.
 * Seul le résultat normalisé [0,1] est publié, jamais l'heure source.
 */
const INTRO_RANK_WEIGHT = 0.78;
const INTRO_TIME_WEIGHT = 0.22;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * La LÉGENDE du tableau (les 11 pastilles de regards, « Identification des
 * différents regards », « Légende ») vit dans le cadre, dans ce rectangle en
 * coordonnées relatives. Ce sont 13 items d'appareil, pas du corpus : comptés
 * comme des post-its, ils gonflaient chaque regard d'exactement 1 (fatal aux
 * petits — « Philosophe » affichait 3 dont sa propre pastille) et tissaient
 * des fils « même texte » entre la légende et le contenu. Écartés, et dits.
 */
const LEGEND_BOX = { x0: 5400, x1: 5700, y0: 600, y1: 2500 };

// ══════════════════════════════════════════════════════ Réglages de dérivation

// L'étiquette (survol, carte flottante) est le texte coupé au mot. En deçà du
// seuil on ne coupe pas : quelques caractères de plus valent mieux qu'une
// phrase amputée pour rien.
const LABEL_KEEP_UNDER = 64;   // jusque-là, le texte passe entier
const LABEL_CUT_AT = 61;       // au-delà, on coupe ici, puis on recule au mot
const SIZE_BASE = 0.62;        // taille d'un nœud de degré 0
const SIZE_PER_DEGREE = 0.075; // ce qu'un voisin ajoute
const SIZE_MAX = 1.22;         // plafond (atteint à 8 voisins)
const SIZE_SECTION = 3.4;

const MIRO_SPAN_X = 320;       // largeur de la cartographie en unités de scène
const MIRO_JITTER_Z = 2;       // épaisseur donnée au plan, pour que les nœuds
                               // superposés ne se masquent pas exactement
// NB : un « dé-tassement » des amas (écarter les nœuds serrés pour loger les
// boîtes) a été essayé et RETIRÉ — mesuré au banc : bouger les nœuds re-route le
// circuit et AJOUTE des croisements (+5 % même en douceur, +10 % pour un vrai
// écartement), pour un gain d'espacement marginal (les boîtes se chevauchent de
// toute façon, l'écran ne peut en loger 570). Le circuit prime ; l'entassement
// des boîtes se règle à l'écran (curseur à fond + survol), pas dans la géométrie.

const CONST_R_XZ = 46;         // sphère des sections : rayon équatorial
const CONST_R_Y = 32.2;        //                       demi-hauteur

const SEED = 42;               // l'aléatoire est à graine fixe : deux exécutions
                               // donnent le même fichier, au bit près

// Seuil typographique du paratexte : hors du cadre, un item composé en corps
// 30 ou plus n'est pas un post-it — c'est un titre de bloc, une question de
// recherche ou une présentation (« Cette carte mentale… »). Vérifié item par
// item sur l'export : au-dessus de ce corps, AUCUN contenu ; en dessous, aucun
// titre (le plus grand contenu observé est en corps 15).
const PARATEXT_FONT_MIN = 30;

// Relaxation de la constellation. Ces constantes vivent ICI, au grand jour, et
// non dans le bloc qui les consomme : c'est aussi d'ici que la fiche « méthode »
// du site les lit (§ 9). Un paramètre de simulation recopié à la main dans une
// page mentirait au premier réglage.
const ITERS = 500;             // tours de relaxation
const REPULSE = 12;            // intensité de la répulsion (en 1/d²)
const MIN_SEP = 2.2;           // en deçà, deux post-its comptent comme à MIN_SEP :
                               // sans ce plancher, la répulsion en 1/d² part à
                               // l'infini dès que deux nœuds se frôlent.
const CUTOFF2 = 3600;          // au-delà de 60, on s'ignore
const GRAV_REST = 26, GRAV_K = 0.09;   // ressort post-it → sa section
const SPRING_CONNECTOR = { rest: 5, k: 0.55 };   // un trait tracé tire fort
const SPRING_CONCEPT = { rest: 13, k: 0.12 };    // un texte répété tire peu
const STEP_START = 6, STEP_END = 0.12; // pas borné, du plus large au plus fin

// Les réglages du routage « circuit » (§ 9) ne sont PAS ici : ils vivent dans
// circuit-router.mjs, avec le code qui les lit — la page les lit aussi, et un
// réglage recopié des deux côtés est un réglage qui ment d'un côté.

// ══════════════════════════════════════════════════════ Outils

/** mulberry32 — générateur à graine, court et reproductible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// nbsp reste une INSÉCABLE (U+00A0), pas une espace ordinaire : en français elle
// porte la ponctuation haute (« Le Robert : ») et l'intérieur des guillemets.
// L'écraser retoucherait la typographie des auteur·rices.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Le HTML de Miro -> du texte. Les <a href> sont récoltés au passage. */
function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, c) => String.fromCodePoint(parseInt(c, 16)))
    .replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(Number(c)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function htmlToText(html) {
  if (!html) return '';
  return decodeEntities(
    String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
  // Pas de rognage ligne à ligne : les espaces en fin de ligne du tableau
  // d'origine sont conservés tels quels. Les nettoyer serait retoucher le
  // corpus — un autre métier que celui de ce script.
}

function hrefsIn(html) {
  return [...String(html || '').matchAll(/href="([^"]+)"/gi)].map(m => decodeEntities(m[1]));
}

/** L'unique <iframe src> d'un embed : la référence que l'embed donne à voir. */
function iframeSrc(html) {
  const m = /<iframe[^>]*\bsrc="([^"]+)"/i.exec(String(html || ''));
  return m ? decodeEntities(m[1]) : null;
}

function labelOf(text) {
  if (text.length <= LABEL_KEEP_UNDER) return text;
  const cut = text.slice(0, LABEL_CUT_AT);
  const lastSpace = cut.search(/\s+\S*$/);
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…';
}

/** Clé de rapprochement des textes répétés : casse, accents d'espaces et
 *  retours à la ligne écrasés. C'est elle qui fabrique les fils « même texte ». */
const conceptKey = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

// ══════════════════════════════════════════════════════ Journal

const report = { kept: 0, dropped: [], warnings: [] };
const drop = (item, why) => report.dropped.push({ id: item.id, type: item.type, why });
const warn = msg => report.warnings.push(msg);

// ══════════════════════════════════════════════════════ 1. Lecture

// L'export Miro arrive avec une marque d'ordre des octets : JSON.parse la refuse.
const raw = JSON.parse(readFileSync(SRC, 'utf8').replace(/^﻿/, ''));
const frame = raw.items.find(i => i.type === 'frame');
if (!frame) throw new Error('Aucun cadre dans export_miro.json : la section « Vue d\'ensemble » est définie par lui.');

// ══════════════════════════════════════════════════════ 2. Couleurs -> regards / sous-thèmes

const regardByColor = new Map();
for (const r of REGARDS) {
  regardByColor.set(r.color.toLowerCase(), r);
  for (const a of r.aliases) regardByColor.set(a.toLowerCase(), r);
}
const unknownFills = new Map();        // hors cadre : couleur sans regard
const unknownFrameFills = new Map();   // dans le cadre : couleur sans sous-thème

const themesByColor = new Map();
for (const t of SOUS_THEMES) {
  for (const c of t.colors) {
    const k = c.toLowerCase();
    if (!themesByColor.has(k)) themesByColor.set(k, []);
    themesByColor.get(k).push(t);
  }
}

/** Le temps d'un item : la première borne `until` qu'il n'atteint pas. La
 *  dernière période (until null) recueille tout le reste. */
function periodeOf(createdAt) {
  if (!createdAt) return null;
  const day = String(createdAt).slice(0, 10);
  for (const p of PERIODES) if (!p.until || day < p.until) return p;
  return null;
}

/** Sous-thème d'un enfant du cadre : sa couleur, départagée par l'ancre du
 *  titre quand une couleur sert deux grappes (le jaune). p est RELATIF. */
function sousThemeOf(fill, p) {
  const cands = themesByColor.get(fill) || [];
  if (cands.length === 0) return null;
  if (cands.length === 1) return cands[0];
  let best = null, bestD = Infinity;
  for (const t of cands) {
    const d = dist2(p.x, p.y, t.anchor[0], t.anchor[1]);
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}

// ══════════════════════════════════════════════════════ 3. Le texte d'un item

/** Chaque type d'item range son texte ailleurs. Un item sans texte n'a rien à
 *  dire et ne devient pas un nœud — sauf une image, qui parle en montrant
 *  (et par son altText quand les auteur·rices en ont écrit un). */
function textOf(item) {
  if (item.type === 'image') return htmlToText(item.data?.altText);
  if (item.type === 'embed') {
    // `description` d'abord ; à défaut `title` — c'est ce qui rattrape la
    // référence cairn.info, muette de description, que l'ancien graphe perdait.
    return htmlToText(item.data?.description) || htmlToText(item.data?.title);
  }
  // Une carte range son texte dans `title`, pas dans `content` comme tout le
  // reste. Il n'y en a qu'une sur le tableau, et elle disparaîtrait en silence.
  if (item.type === 'card') return htmlToText(item.data?.title) || htmlToText(item.data?.description);
  return htmlToText(item.data?.content);
}

function linksOf(item) {
  const out = [...hrefsIn(item.data?.content)];
  if (item.type === 'embed') {
    const src = iframeSrc(item.data?.html);
    if (src) out.push(src);
  }
  if (Array.isArray(item.links)) out.push(...item.links.filter(l => typeof l === 'string'));
  // `links.self` est l'adresse de l'item dans l'API Miro, pas une référence.
  return [...new Set(out.filter(u => /^https?:\/\//i.test(u)))];
}

/**
 * La NATURE d'un item : contenu, ou appareil éditorial. Le corpus mélangeait
 * post-its d'idées et paratexte (titres de blocs, questions de recherche,
 * présentations « Cette carte mentale… ») — ~8 % des nœuds pesaient dans le
 * lexique, les croisements et les hubs sans être des idées. La nature est
 * DITE, expédiée au navigateur, et les statistiques l'écartent en l'annonçant.
 * Tout reste visible et cherchable sur la carte : on écarte des comptes, pas
 * de la vue.
 */
function natureOf(item, text, inFrame) {
  if (item.type === 'image') return 'image';
  if (item.type === 'embed') return 'reference';
  if (item.type === 'card') return 'meta';         // la carte décrit le projet
  if (/cette carte mentale/i.test(text)) return 'meta';
  if (inFrame && /^x\s/i.test(text)) return 'titre';  // les onze « x … » du cadre
  const fs = Number(item.style?.fontSize) || 0;
  if (!inFrame && fs >= PARATEXT_FONT_MIN) return /\?/.test(text) ? 'question' : 'titre';
  return 'contenu';
}

/** Le plus long passage entre guillemets d'un texte, '' s'il n'y en a pas. */
function longestQuote(text) {
  let best = '';
  for (const m of String(text).matchAll(QUOTED_SPAN)) {
    const q = m[1].trim();
    if (q.length > best.length) best = q;
  }
  return best;
}

/** La FORME d'un item — voir FORMES pour la priorité et son motif. */
function formeOf(item, text, nature, links) {
  if (nature === 'image') return 'f_img';
  if (nature === 'titre' || nature === 'question' || nature === 'meta') return 'f_app';
  if (nature === 'reference' || links.length) return 'f_ref';
  const q = longestQuote(text);
  if (q && (q.length >= CITATION_MIN_LEN || q.length / Math.max(1, text.length) >= CITATION_MIN_COVER)) return 'f_cit';
  return 'f_note';
}

// ══════════════════════════════════════════════════════ 4. Tri des items

const sectionById = new Map(SECTIONS.map(s => [s.id, s]));
const formeById = new Map(FORMES.map(f => [f.key, f]));
const anchored = SECTIONS.filter(s => s.anchors);

const kept = [];
let legendDropped = 0;
for (const item of raw.items) {
  if (item.type === 'frame') { drop(item, 'cadre (devient la section « Vue d\'ensemble »)'); continue; }

  const text = textOf(item);
  if (!text && item.type !== 'image') { drop(item, 'aucun texte'); continue; }

  const p = item.position;
  const inFrame = !!item.parent;

  // La légende du tableau : de l'appareil, pas du corpus (voir LEGEND_BOX).
  if (inFrame && p.x >= LEGEND_BOX.x0 && p.x <= LEGEND_BOX.x1 && p.y >= LEGEND_BOX.y0 && p.y <= LEGEND_BOX.y1) {
    drop(item, 'légende du tableau');
    legendDropped++;
    continue;
  }

  // Position absolue : les enfants du cadre sont exprimés depuis son coin haut-gauche.
  const x = inFrame ? frame.position.x - frame.geometry.width / 2 + p.x : p.x;
  const y = inFrame ? frame.position.y - frame.geometry.height / 2 + p.y : p.y;

  let sectionId;
  if (inFrame) {
    sectionId = 's_frame';
  } else {
    let best = null, bestD = Infinity;
    for (const s of anchored) {
      for (const [ax, ay] of s.anchors) {
        const d = dist2(x, y, ax, ay);
        if (d < bestD) { bestD = d; best = s; }
      }
    }
    if (Math.sqrt(bestD) > OFF_BOARD_DIST) {
      drop(item, `garé hors du tableau (${Math.round(Math.sqrt(bestD))} de l'ancre la plus proche)`);
      continue;
    }
    sectionId = best.id;
  }

  const fill = (item.style?.fillColor || '').toLowerCase();

  // La couleur ne dit pas la même chose dedans et dehors (voir l'en-tête).
  let regard = null, sousTheme = null;
  if (inFrame) {
    sousTheme = fill ? sousThemeOf(fill, p) : null;
    if (fill && !sousTheme) unknownFrameFills.set(fill, (unknownFrameFills.get(fill) || 0) + 1);
  } else {
    regard = regardByColor.get(fill) || null;
    if (fill && !regard) unknownFills.set(fill, (unknownFills.get(fill) || 0) + 1);
  }

  const nature = natureOf(item, text, inFrame);
  const periode = periodeOf(item.createdAt);
  if (!periode) warn(`item ${item.id} sans date exploitable : hors de toute période.`);
  const forme = formeOf(item, text, nature, linksOf(item));
  kept.push({ item, x, y, text, sectionId, regard, sousTheme, nature, periode, forme });
}
report.kept = kept.length;
if (legendDropped !== 13) warn(`légende du tableau : ${legendDropped} items écartés au lieu des 13 attendus — vérifier LEGEND_BOX.`);

// ── Les PRÉSENTATIONS de branche. Chaque bloc porte de l'appareil qui le
// PRÉSENTE, pas du corpus : un titre, un paragraphe « Cette carte mentale… »,
// parfois une carte de présentation composée à la main. On les SORT de la carte
// et on les remonte en en-tête du panneau de zone (voir renderGroupPanel). La
// question de recherche, elle, RESTE un nœud interrogeable : on n'en garde
// qu'une COPIE pour l'en-tête. Le tronc (« Vue d'ensemble ») garde ses titres de
// sous-thèmes — ce sont les étiquettes de ses grappes, pas des présentations.
const presentations = {};
const presFor = id => presentations[id] || (presentations[id] = { category: sectionById.get(id)?.name || '' });
// Cartes de présentation composées à la main, donc classées « contenu » : la
// règle typographique ne les attrape pas, on les DÉSIGNE (texte exact, tel que
// textOf le normalise). Une carte interrogative y sert de question, sinon de
// titre — c'est le cas de la zone « Questions déontologiques ».
const PRESENTATION_CONTENT = new Set([
  'Questions déontologiques liées aux restes humains en contexte muséal',
  'En quoi le dispositif muséal actuel peut-il perpétuer, ou au contraire atténuer, les strates de violence associées à un corps muséalisé, comme celui de Soliman al-Halabi ?',
]);
// Descriptions ÉDITORIALES qui surchargent la carte de présentation dérivée du
// tableau : le séminaire a parfois formulé pour une branche un cadrage plus
// complet que le post-it d'origine. Assumé et en clair ici. Une description vit
// en EN-TÊTE de zone (renderGroupPanel), jamais sur la carte — elle n'ajoute
// donc aucun nœud.
const DESCRIPTION_OVERRIDES = {
  b_cas: "Un travail de comparaisons sur le traitement des restes humains dans des collections publiques présentes dans des institutions françaises mais également dans divers pays. Cela permettra d’observer la place que peuvent prendre les restes humains à travers des exemples de conservation, de recherche ainsi qu’au travers de cas de restitutions, afin de cerner au mieux le traitement qu’un corps peut exiger ou subir. Avec ces comparatifs, des liens avec le corps patrimonialisé de Soliman Al-Halabi pourront être établis liant les différents points réfléchis lors du séminaire, notamment avec la question de dignité.",
};
const promoted = new Set();
for (const k of kept) {
  if (k.sectionId === 's_frame') continue;
  const txt = (k.text || '').trim();
  if (k.nature === 'titre') { presFor(k.sectionId).title = txt; promoted.add(k.item.id); }
  else if (k.nature === 'meta') { presFor(k.sectionId).description = txt; promoted.add(k.item.id); }
  else if (k.nature === 'question') { presFor(k.sectionId).question = txt; promoted.add(k.item.id); } // hors tronc (boucle) : passe en en-tête de zone ET quitte la carte
  else if (PRESENTATION_CONTENT.has(txt)) {
    if (/\?\s*$/.test(txt)) presFor(k.sectionId).question = txt; else presFor(k.sectionId).title = txt;
    promoted.add(k.item.id);
  }
}
// Les descriptions éditoriales surchargent APRÈS coup ce que le tableau a fourni.
for (const [sid, desc] of Object.entries(DESCRIPTION_OVERRIDES)) presFor(sid).description = desc;
// …et ABSORBENT le post-it qu'elles reprennent mot pour mot : ce texte vit
// désormais dans l'en-tête de zone, le laisser AUSSI comme nœud le dirait deux
// fois. On ne retire que le doublon EXACT, dans SA branche (une description qui
// REFORMULE son post-it ne l'efface pas — il faudrait alors le désigner à part).
let overrideAbsorbed = 0;
for (const k of kept) {
  const desc = DESCRIPTION_OVERRIDES[k.sectionId];
  if (desc && (k.text || '').trim() === desc.trim()) { promoted.add(k.item.id); overrideAbsorbed++; }
}
if (!overrideAbsorbed && Object.keys(DESCRIPTION_OVERRIDES).length)
  warn(`descriptions éditoriales : aucun post-it absorbé — un doublon peut réapparaître sur la carte si un texte a été recopié.`);
// Retrait des post-its promus en en-tête (titres + « Cette carte mentale… » +
// cartes nommées + questions de branche + question de recherche globale). Ils
// vivent désormais dans l'en-tête de zone, plus sur la carte. Le tronc « Vue
// d'ensemble » n'entre jamais dans la boucle ci-dessus (continue sur s_frame) :
// ses éventuels énoncés interrogatifs, eux, restent des nœuds sur la carte.
for (let i = kept.length - 1; i >= 0; i--) if (promoted.has(kept[i].item.id)) kept.splice(i, 1);
report.kept = kept.length;
report.presentationsPromoted = promoted.size;
report.presentationsZones = Object.keys(presentations).length;

// Les heures complètes ne quittent jamais le build. Elles servent seulement à
// produire plus bas un ordre normalisé et stable, puis disparaissent.
const createdMsByNode = new Map(kept.map(k => [k.item.id, Date.parse(k.item.createdAt)]));

// ══════════════════════════════════════════════════════ 5. Les nœuds

const keptIds = new Set(kept.map(k => k.item.id));

const nodes = SECTIONS.map(s => ({
  id: s.id,
  kind: 'section',
  label: s.name,
  fullText: s.name,
  sectionColor: s.color,
  regard: null,
  regardColor: null,
  links: [],
  image: null,
  size: SIZE_SECTION,
}));

for (const k of kept) {
  const isImage = k.item.type === 'image';
  // Les titres « x … » du cadre perdent leur marqueur dans l'ÉTIQUETTE — le
  // texte intégral, lui, reste celui du tableau, marqueur compris.
  const labelText = k.nature === 'titre' ? k.text.replace(/^x\s+/i, '') : k.text;
  const label = isImage && !k.text ? 'Image' : labelOf(labelText || 'Image');
  nodes.push({
    id: k.item.id,
    kind: isImage ? 'image' : 'item',
    itemType: k.item.type,
    nature: k.nature,
    label,
    fullText: k.text,
    sectionColor: sectionById.get(k.sectionId).color,
    regard: k.regard?.name ?? null,
    regardKey: k.regard?.key ?? null,
    regardColor: k.regard?.color ?? null,
    sousTheme: k.sousTheme?.key ?? null,
    sousThemeColor: k.sousTheme?.color ?? null,
    periode: k.periode?.key ?? null,
    periodeColor: k.periode?.color ?? null,
    forme: k.forme,
    formeColor: formeById.get(k.forme).color,
    // Le JOUR d'écriture, jamais l'heure (voir PERIODES).
    date: k.item.createdAt ? String(k.item.createdAt).slice(0, 10) : null,
    links: linksOf(k.item),
    image: isImage ? `assets/${k.item.id}.jpg` : null,
    section: k.sectionId,
    // size/degree/pos : posés plus bas, une fois les arêtes connues
  });
}

const nodeById = new Map(nodes.map(n => [n.id, n]));

// ══════════════════════════════════════════════════════ 6. Les arêtes

const edges = [];
const seen = new Set();
const createdMsByEdge = new WeakMap();
/**
 * `dir` — l'ORIENTATION du trait, telle qu'elle est sur le tableau :
 *   0  aucune pointe : un rapprochement sans sens de lecture
 *   1  pointe à l'arrivée : source → cible
 *  -1  pointe au départ : cible → source (le trait a été tiré à l'envers)
 *   2  pointe aux deux bouts : réciproque
 *
 * ⚠ Ce n'est PAS un graphe orienté qu'on rétablirait : la moitié des traits
 * ne porte aucune pointe (le décompte des quatre états vit dans census.dirs),
 * et c'est une donnée, pas un oubli. Les quatre états coexistent et se
 * dessinent tels quels. Ce que la flèche SIGNIFIAIT pour les auteur·rices —
 * dérivation, réponse, hypothèse — reste inconnu : on restitue le geste, pas
 * son sens (fiche méthode § 4).
 *
 * `dashed` — le pointillé du tableau (census.dottedConnectors). Même règle :
 * conservé sans qu'on prétende savoir ce qu'il voulait dire.
 */
const addEdge = (a, b, type, dir = 0, dashed = false, createdAt = null) => {
  if (a === b) return false;
  const key = [a, b].sort().join('|') + '|' + type;
  if (seen.has(key)) return false;
  seen.add(key);
  const e = { source: a, target: b, type };
  if (dir) e.dir = dir;          // absent = non orienté : le cas le plus fréquent
  if (dashed) e.dashed = 1;      // absent = trait plein
  edges.push(e);
  const ms = typeof createdAt === 'number' ? createdAt : Date.parse(createdAt);
  if (Number.isFinite(ms)) createdMsByEdge.set(e, ms);
  return true;
};

/** Les pointes d'un connecteur -> l'un des quatre états de `dir`. */
function dirOf(style) {
  const s = style || {};
  const start = s.startStrokeCap && s.startStrokeCap !== 'none';
  const end = s.endStrokeCap && s.endStrokeCap !== 'none';
  if (start && end) return 2;
  if (end) return 1;
  if (start) return -1;
  return 0;
}

// 6a. Les connecteurs : les traits VRAIMENT tracés à la main sur le tableau.
//     Leur DIRECTION (les pointes de flèche) et leur STYLE (le pointillé) sont
//     CONSERVÉS tels quels — `dir` et `dashed` posés par addEdge, dessinés par
//     la page (fiche méthode § 4) — sans qu'on prétende en connaître le SENS.
//     Le graphe n'est pas pour autant « orienté » : la moitié des traits ne
//     porte aucune pointe (census.dirs), les quatre états coexistent, et rien
//     n'est rétabli ni normalisé.
let danglingConnectors = 0;
for (const c of raw.connectors) {
  const a = c.startItem?.id, b = c.endItem?.id;
  if (!a || !b) { danglingConnectors++; continue; }
  if (!keptIds.has(a) || !keptIds.has(b)) { danglingConnectors++; continue; }
  addEdge(a, b, 'connector', dirOf(c.style), (c.style || {}).strokeStyle === 'dotted', c.createdAt);
}

// 6b. Les fils « même texte » : un post-it répété ailleurs sur le tableau est le
//     même propos tenu deux fois. On enfile chaque groupe (chaîne, pas clique) :
//     la clique dirait la même chose en O(n²) traits.
const byConcept = new Map();
for (const k of kept) {
  const key = conceptKey(k.text);
  if (!key) continue;
  if (!byConcept.has(key)) byConcept.set(key, []);
  byConcept.get(key).push(k.item.id);
}
for (const group of byConcept.values()) {
  for (let i = 0; i < group.length - 1; i++) {
    // Ce lien n'a pas été tracé dans Miro : il devient déductible au moment où
    // le second des deux textes existe. Lui attribuer une autre date inventerait
    // un geste éditorial qui n'a jamais eu lieu.
    const inferredAt = Math.max(createdMsByNode.get(group[i]), createdMsByNode.get(group[i + 1]));
    addEdge(group[i], group[i + 1], 'concept', 0, false, inferredAt);
  }
}

// 6c. La partition chronologique de l'introduction. Un connecteur manuel ne
// peut paraître avant ses deux extrémités, même si l'export source portait une
// incohérence d'horloge : sa date effective est donc le maximum des trois.
const introEvents = [];
for (const n of nodes) {
  if (n.kind === 'section') continue; // amers présents en filigrane dès l'ouverture
  const ms = createdMsByNode.get(n.id);
  if (!Number.isFinite(ms)) continue;
  introEvents.push({ ms, kind: 0, key: `n:${n.id}`, target: n });
}
for (const e of edges) {
  const ms = Math.max(
    createdMsByEdge.get(e) ?? -Infinity,
    createdMsByNode.get(e.source) ?? -Infinity,
    createdMsByNode.get(e.target) ?? -Infinity,
  );
  if (!Number.isFinite(ms)) continue;
  const pair = [e.source, e.target].sort().join('|');
  introEvents.push({ ms, kind: 1, key: `e:${pair}:${e.type}`, target: e });
}
introEvents.sort((a, b) => a.ms - b.ms || a.kind - b.kind || a.key.localeCompare(b.key));
if (introEvents.length) {
  const first = introEvents[0].ms, last = introEvents[introEvents.length - 1].ms;
  const timeDen = Math.log1p(Math.max(0, last - first) / DAY_MS) || 1;
  const rankDen = Math.max(1, introEvents.length - 1);
  introEvents.forEach((ev, i) => {
    const rankU = i / rankDen;
    const timeU = Math.log1p(Math.max(0, ev.ms - first) / DAY_MS) / timeDen;
    ev.target.intro = Number((INTRO_RANK_WEIGHT * rankU + INTRO_TIME_WEIGHT * timeU).toFixed(6));
  });
}

// 6d. La gravité : un ressort de chaque post-it vers sa section. Elle ne sert
//     qu'à la simulation ci-dessous — elle est entièrement redéductible de
//     `n.section`, donc elle n'est PAS expédiée au navigateur.
const gravity = kept.map(k => ({ source: k.sectionId, target: k.item.id }));

// 6e. Degré = ce qui se voit (connecteurs + même texte). La gravité ne compte
//     pas : elle n'est pas un lien du tableau, c'est un artifice de mise en page.
const degree = new Map(nodes.map(n => [n.id, 0]));
for (const e of edges) {
  degree.set(e.source, degree.get(e.source) + 1);
  degree.set(e.target, degree.get(e.target) + 1);
}
for (const n of nodes) {
  if (n.kind === 'section') continue;
  n.degree = degree.get(n.id);
  n.size = Math.min(SIZE_MAX, SIZE_BASE + SIZE_PER_DEGREE * n.degree);
}

// ══════════════════════════════════════════════════════ 7. Disposition « miro »

// Le tableau, à plat, à l'échelle de la scène. Transformation affine : ce que
// l'œil voit est la géographie que les auteur·rices ont composée à la main.
{
  const xs = kept.map(k => k.x), ys = kept.map(k => k.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = MIRO_SPAN_X / (maxX - minX);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const rand = rng(SEED);

  for (const k of kept) {
    const n = nodeById.get(k.item.id);
    n.pos = {
      miro: [(k.x - cx) * scale, -(k.y - cy) * scale, (rand() * 2 - 1) * MIRO_JITTER_Z],
      constellation: null,
    };
  }
  // Une section se pose au barycentre des siens.
  for (const s of SECTIONS) {
    const mine = kept.filter(k => k.sectionId === s.id).map(k => nodeById.get(k.item.id));
    const n = nodeById.get(s.id);
    const mx = mine.reduce((a, m) => a + m.pos.miro[0], 0) / mine.length;
    const my = mine.reduce((a, m) => a + m.pos.miro[1], 0) / mine.length;
    n.pos = { miro: [mx, my, 0], constellation: null };
  }
}

// ══════════════════════════════════════════════════════ 8. Disposition « constellation »

/**
 * Le tableau délié de sa géographie : ce qui rapproche n'est plus le voisinage
 * sur le mur, c'est le lien. Les sections tiennent une sphère de Fibonacci —
 * fixes, ce sont les amers. Les post-its se placent par relaxation : les traits
 * tirent, la gravité retient près de sa section, tout le monde se repousse.
 *
 * À graine fixe : le fichier produit est le même à chaque exécution.
 */
{
  const rand = rng(SEED + 1);
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));

  // 8a. Les sections, fixes.
  SECTIONS.forEach((s, i) => {
    const yn = SECTIONS.length === 1 ? 0 : 1 - (2 * i) / (SECTIONS.length - 1);
    const ring = Math.sqrt(Math.max(0, 1 - yn * yn));
    const th = i * GOLDEN;
    nodeById.get(s.id).pos.constellation = [
      ring * CONST_R_XZ * Math.cos(th),
      yn * CONST_R_Y,
      ring * CONST_R_XZ * Math.sin(th),
    ];
  });

  // 8b. Les post-its, relâchés.
  const sim = kept.map(k => nodeById.get(k.item.id));
  const idx = new Map(sim.map((n, i) => [n.id, i]));
  const px = new Float64Array(sim.length), py = new Float64Array(sim.length), pz = new Float64Array(sim.length);
  // Déplacement accumulé sur UNE itération, remis à zéro à chaque tour. Garder
  // une vitesse d'un tour sur l'autre amplifie chaque à-coup au lieu de le
  // dissiper : la simulation part alors à l'infini (mesuré : 1e+109).
  const dxs = new Float64Array(sim.length), dys = new Float64Array(sim.length), dzs = new Float64Array(sim.length);

  // Départ : en petit nuage autour de sa section, jamais pile dessus (une
  // superposition exacte n'a pas de direction de fuite).
  sim.forEach((n, i) => {
    const c = nodeById.get(n.section).pos.constellation;
    px[i] = c[0] + (rand() * 2 - 1) * 12;
    py[i] = c[1] + (rand() * 2 - 1) * 12;
    pz[i] = c[2] + (rand() * 2 - 1) * 12;
  });

  const springs = [];
  for (const e of edges) {
    const a = idx.get(e.source), b = idx.get(e.target);
    if (a === undefined || b === undefined) continue; // une section : traitée en gravité
    const s = e.type === 'connector' ? SPRING_CONNECTOR : SPRING_CONCEPT;
    springs.push({ a, b, rest: s.rest, k: s.k });
  }
  const grav = gravity.map(g => ({ i: idx.get(g.target), c: nodeById.get(g.source).pos.constellation }));

  for (let it = 0; it < ITERS; it++) {
    dxs.fill(0); dys.fill(0); dzs.fill(0);

    // Répulsion, toutes paires. ~600 nœuds -> ~180k paires : large pour un build.
    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        let dx = px[i] - px[j], dy = py[i] - py[j], dz = pz[i] - pz[j];
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > CUTOFF2) continue;
        if (d2 < 1e-9) {  // pile au même point : aucune direction de fuite
          dx = rand() - 0.5; dy = rand() - 0.5; dz = rand() - 0.5;
          d2 = dx * dx + dy * dy + dz * dz;
        }
        const d = Math.max(Math.sqrt(d2), MIN_SEP);
        const f = REPULSE / (d * d * d);   // (vecteur/d) × (1/d²) : inverse carré
        dxs[i] += dx * f; dys[i] += dy * f; dzs[i] += dz * f;
        dxs[j] -= dx * f; dys[j] -= dy * f; dzs[j] -= dz * f;
      }
    }
    // Ressorts des liens : un trait tire, un texte répété tire moins.
    for (const s of springs) {
      const dx = px[s.b] - px[s.a], dy = py[s.b] - py[s.a], dz = pz[s.b] - pz[s.a];
      const d = Math.max(Math.hypot(dx, dy, dz), 1e-6);
      const f = (d - s.rest) * s.k / d;
      dxs[s.a] += dx * f; dys[s.a] += dy * f; dzs[s.a] += dz * f;
      dxs[s.b] -= dx * f; dys[s.b] -= dy * f; dzs[s.b] -= dz * f;
    }
    // Gravité : chacun reste dans le voisinage de sa section.
    for (const g of grav) {
      const dx = g.c[0] - px[g.i], dy = g.c[1] - py[g.i], dz = g.c[2] - pz[g.i];
      const d = Math.max(Math.hypot(dx, dy, dz), 1e-6);
      const f = (d - GRAV_REST) * GRAV_K / d;
      dxs[g.i] += dx * f; dys[g.i] += dy * f; dzs[g.i] += dz * f;
    }
    // Avance : on suit la force, mais d'un pas BORNÉ qui refroidit. C'est ce
    // plafond qui rend la relaxation incapable de diverger, quelle que soit la
    // violence d'une force ponctuelle.
    const step = STEP_START * Math.pow(STEP_END / STEP_START, it / (ITERS - 1));
    for (let i = 0; i < sim.length; i++) {
      const d = Math.hypot(dxs[i], dys[i], dzs[i]);
      if (d < 1e-9) continue;
      const s = Math.min(d, step) / d;
      px[i] += dxs[i] * s; py[i] += dys[i] * s; pz[i] += dzs[i] * s;
    }
  }

  sim.forEach((n, i) => { n.pos.constellation = [px[i], py[i], pz[i]]; });
}

// ══════════════════════════════════════════════════════ 9. Routage « circuit »

/**
 * Le tracé ORTHOGONAL de la cartographie — l'allure d'un circuit imprimé.
 *
 * Le routeur lui-même vit dans circuit-router.mjs, parce que la PAGE l'appelle
 * aussi : le recentrage calcule ses positions à la volée et doit router chez le
 * visiteur. Deux copies auraient dérivé au premier réglage, et la cartographie
 * et le recentrage auraient dessiné deux circuits différents en prétendant
 * suivre la même règle.
 *
 * Pourquoi ici, et pas seulement dans le navigateur : les positions `miro` sont
 * FIGÉES dans graph.json, donc leur routage l'est aussi. Le calculer une fois au
 * build, c'est un coût payé par le développeur et jamais par le visiteur — et
 * c'est reproductible, donc vérifiable.
 *
 * ⚠ Ce que ce tracé NE dit PAS : un coude n'a aucun sens. Il ne signale ni
 * détour, ni étape, ni hiérarchie — c'est un évitement, décidé par un compte de
 * croisements. Seules les EXTRÉMITÉS d'un trait portent du sens ; le chemin
 * entre elles est une commodité de lecture. La fiche le dit avec ces mots.
 */
const { routes: miroRoutes, report: circuitReport } = routeCircuit(
  nodes.map(n => ({ id: n.id, x: n.pos.miro[0], y: n.pos.miro[1], r: n.size })),
  edges.map(e => ({ source: e.source, target: e.target, rank: e.type === 'connector' ? 0 : 1 })),
  {},
  true,   // le build MESURE aussi le tracé direct : la fiche compare les deux
);
{
  // Deux décimales : au-delà, on expédierait du bruit de calcul. La
  // cartographie fait 320 unités de large — le centième d'unité est déjà bien
  // en deçà du pixel, à tout zoom praticable.
  const r2 = v => Math.round(v * 100) / 100;
  for (let i = 0; i < edges.length; i++) {
    const r = miroRoutes[i];
    if (r) edges[i].route = Array.from(r, r2);
  }
}

// ══════════════════════════════════════════════════════ 10. Écriture

const round = v => Math.round(v * 1000) / 1000;
for (const n of nodes) {
  n.pos.miro = n.pos.miro.map(round);
  n.pos.constellation = n.pos.constellation.map(round);
  n.size = Math.round(n.size * 1000) / 1000;
}

// ─────────────────────────────────────────────── Le protocole, dit par le build
/**
 * `method` : les paramètres de dérivation ET le recensement du build, expédiés
 * au navigateur pour que la fiche « à propos & méthode » les AFFICHE au lieu de
 * les recopier. Un protocole recopié à la main dans une page se désynchronise au
 * premier réglage — et une méthode fausse est pire qu'une méthode absente.
 *
 * Ce bloc ne pèse qu'à peine plus d'un kilo-octet et ne concerne que la fiche :
 * aucun code de rendu ne le lit.
 */
const dropCensus = [...report.dropped.reduce((m, d) => {
  const why = d.why.replace(/\s*\(.*\)/, '');
  return m.set(why, (m.get(why) || 0) + 1);
}, new Map())].sort((a, b) => b[1] - a[1]).map(([why, n]) => ({ why, n }));

const edgeCounts = { connector: 0, concept: 0 };
for (const e of edges) edgeCounts[e.type]++;

const natureCensus = {};
for (const n of nodes) {
  if (n.kind === 'section') continue;
  natureCensus[n.nature] = (natureCensus[n.nature] || 0) + 1;
}

const formeCensus = {};
for (const n of nodes) {
  if (n.kind === 'section') continue;
  formeCensus[n.forme] = (formeCensus[n.forme] || 0) + 1;
}

const periodeCensus = {};
for (const n of nodes) {
  if (n.kind === 'section') continue;
  periodeCensus[n.periode || '(sans date)'] = (periodeCensus[n.periode || '(sans date)'] || 0) + 1;
}
const dates = kept.map(k => k.item.createdAt).filter(Boolean).sort();
const datedCount = dates.length;

// Direction et style des connecteurs — désormais CONSERVÉS (voir addEdge). Le
// recensement porte donc sur les arêtes retenues, pas sur l'export brut : c'est
// ce que le visiteur a sous les yeux qu'il faut pouvoir compter.
const dirCensus = { none: 0, forward: 0, backward: 0, both: 0 };
let dottedEdges = 0;
for (const e of edges) {
  if (e.type !== 'connector') continue;
  dirCensus[e.dir === 1 ? 'forward' : e.dir === -1 ? 'backward' : e.dir === 2 ? 'both' : 'none']++;
  if (e.dashed) dottedEdges++;
}
const arrowConnectors = dirCensus.forward + dirCensus.backward + dirCensus.both;
const dottedConnectors = dottedEdges;

/**
 * L'ARBORESCENCE, MESURÉE — et non recopiée dans la fiche.
 *
 * C'est l'affirmation la plus forte du site (« le tableau est deux corpus, et
 * le tronc précède les branches ») : elle doit donc être la mieux tenue à jour.
 * Elle vivait en chiffres écrits à la main dans le § 10 de la fiche, ce que la
 * règle de la maison interdit — un nombre en dur ment dès le prochain export.
 *
 * Trois mesures, dans cet ordre :
 *  - la SÉPARATION : où passent les liens (dans le tronc, dans les branches, ou
 *    à travers) et, pour ceux qui traversent, de quelle espèce ils sont. Le
 *    point n'est pas qu'il y ait peu de traversées, c'est qu'AUCUNE ne soit un
 *    trait tracé à la main : `crossConnector` doit rester à 0, et s'il change
 *    un jour, c'est la thèse du § 10 qu'il faut réécrire, pas ce compte.
 *  - l'ANTÉRIORITÉ : parmi les énoncés présents des deux côtés, combien sont
 *    plus anciens côté tronc. ⚠ Elle se mesure sur l'horodatage COMPLET, seul
 *    assez fin pour départager (au jour, 76 des 129 paires sont ex æquo et la
 *    mesure ne dit plus rien). L'heure sert donc au calcul sans jamais être
 *    publiée — `n.date` reste tronquée au jour, et la fiche le dit.
 *  - les SILENCES : les plus grands écarts entre deux créations consécutives,
 *    ceux qui justifient les bornes de PERIODES.
 */
const inFrameById = new Map(kept.map(k => [k.item.id, k.sectionId === 's_frame']));
const arbre = { troncLinks: 0, brancheLinks: 0, crossLinks: 0, crossConnector: 0, crossConcept: 0 };
for (const e of edges) {
  const a = inFrameById.get(e.source), b = inFrameById.get(e.target);
  if (a === undefined || b === undefined) continue;   // arête vers une section : il n'y en a pas
  if (a && b) arbre.troncLinks++;
  else if (!a && !b) arbre.brancheLinks++;
  else {
    arbre.crossLinks++;
    if (e.type === 'connector') arbre.crossConnector++; else arbre.crossConcept++;
  }
}
arbre.troncNodes = kept.filter(k => k.sectionId === 's_frame').length;
arbre.brancheNodes = kept.length - arbre.troncNodes;

// Antériorité, sur l'horodatage complet (voir ci-dessus).
{
  const groups = new Map();
  for (const k of kept) {
    const key = conceptKey(k.text);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(k);
  }
  let both = 0, troncFirst = 0;
  for (const g of groups.values()) {
    const T = g.filter(k => k.sectionId === 's_frame').map(k => k.item.createdAt).filter(Boolean).sort();
    const B = g.filter(k => k.sectionId !== 's_frame').map(k => k.item.createdAt).filter(Boolean).sort();
    if (!T.length || !B.length) continue;
    both++;
    if (T[0] < B[0]) troncFirst++;
  }
  arbre.sharedStatements = both;
  arbre.troncOlder = troncFirst;
}

// Combien de post-its du tronc précèdent le tout premier post-it de bloc.
{
  const chrono = kept.filter(k => k.item.createdAt)
    .sort((a, b) => a.item.createdAt < b.item.createdAt ? -1 : 1);
  const i = chrono.findIndex(k => k.sectionId !== 's_frame');
  arbre.troncBeforeFirstBranche = i < 0 ? chrono.length : i;
  arbre.firstBrancheDay = i < 0 ? null : chrono[i].item.createdAt.slice(0, 10);
}

// Les silences de l'archive : les 4 plus grands écarts entre deux créations.
const silences = (() => {
  const t = dates.map(d => new Date(d).getTime()).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < t.length; i++) gaps.push((t[i] - t[i - 1]) / 3600000);
  return gaps.sort((a, b) => b - a).slice(0, 4).map(h => Math.round(h));
})();

/**
 * L'ÉTIREMENT de la composante géante — son diamètre en sauts. La fiche s'en
 * sert pour justifier l'espacement adaptatif des couronnes du recentrage
 * (« min(26, 300 / profondeur) ») : le chiffre doit donc être celui du graphe,
 * pas un souvenir. Excentricité maximale sur la plus grande composante ;
 * un BFS par nœud sur l'ensemble des arêtes, le coût est invisible dans un build.
 */
const graphSpan = (() => {
  const adj = new Map(kept.map(k => [k.item.id, []]));
  for (const e of edges) {
    if (!adj.has(e.source) || !adj.has(e.target)) continue;
    adj.get(e.source).push(e.target);
    adj.get(e.target).push(e.source);
  }
  const seen = new Set();
  let biggest = [];
  for (const id of adj.keys()) {
    if (seen.has(id)) continue;
    const comp = [id]; seen.add(id);
    for (let i = 0; i < comp.length; i++) for (const j of adj.get(comp[i])) if (!seen.has(j)) { seen.add(j); comp.push(j); }
    if (comp.length > biggest.length) biggest = comp;
  }
  let diameter = 0;
  for (const start of biggest) {
    const d = new Map([[start, 0]]);
    const q = [start];
    for (let i = 0; i < q.length; i++) {
      for (const j of adj.get(q[i])) if (!d.has(j)) { d.set(j, d.get(q[i]) + 1); q.push(j); }
    }
    for (const v of d.values()) if (v > diameter) diameter = v;
  }
  return { giant: biggest.length, diameter };
})();

// Longueur médiane du texte : citée par la fiche comme état du corpus.
const textMedian = (() => {
  const L = kept.map(k => k.text.length).filter(n => n > 0).sort((a, b) => a - b);
  if (!L.length) return 0;
  const m = L.length >> 1;
  return L.length % 2 ? L[m] : Math.round((L[m - 1] + L[m]) / 2);
})();

const method = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: { items: raw.items.length, connectors: raw.connectors.length },
  census: {
    kept: report.kept,
    dropped: dropCensus,
    danglingConnectors,
    arrowConnectors, dottedConnectors, dirs: dirCensus,
    unknownFillCount: [...unknownFills.values()].reduce((a, b) => a + b, 0),
    unknownFillKinds: unknownFills.size,
    unknownFrameFillCount: [...unknownFrameFills.values()].reduce((a, b) => a + b, 0),
    unknownFrameFillKinds: unknownFrameFills.size,
    edges: edgeCounts,
    gravitySprings: gravity.length,
    natures: natureCensus,
    formes: formeCensus,
    periodes: periodeCensus,
    dated: datedCount,
    firstDay: dates[0]?.slice(0, 10) ?? null,
    lastDay: dates[dates.length - 1]?.slice(0, 10) ?? null,
    arbre,
    silencesHours: silences,
    giantDiameter: graphSpan.diameter,
    textMedian,
    // ⚠ SANS le temps de calcul : `graph.json` doit être reproductible au bit
    // près (voir SEED), et une durée mesurée change à chaque exécution. Elle a
    // sa place dans le rapport de fin de build, qui se lit, pas dans le fichier
    // expédié, qui se compare. Le déterminisme s'est cassé exactement ainsi une
    // fois — deux empreintes différentes pour un graphe identique.
    circuit: (({ ms, ...rest }) => rest)(circuitReport),
  },
  params: {
    offBoardDist: OFF_BOARD_DIST,
    sectionAnchors: anchored.reduce((a, s) => a + s.anchors.length, 0),
    paratextFontMin: PARATEXT_FONT_MIN,
    citationMinLen: CITATION_MIN_LEN, citationMinCover: CITATION_MIN_COVER,
    labelKeepUnder: LABEL_KEEP_UNDER, labelCutAt: LABEL_CUT_AT,
    sizeBase: SIZE_BASE, sizePerDegree: SIZE_PER_DEGREE, sizeMax: SIZE_MAX,
    introChronology: {
      events: introEvents.length,
      rankWeight: INTRO_RANK_WEIGHT,
      timeWeight: INTRO_TIME_WEIGHT,
      timeScale: 'log1p(days)',
      source: 'createdAt only · modifiedAt excluded',
    },
    miroSpanX: MIRO_SPAN_X, miroJitterZ: MIRO_JITTER_Z,
    constRxz: CONST_R_XZ, constRy: CONST_R_Y,
    seed: SEED, iters: ITERS,
    repulse: REPULSE, minSep: MIN_SEP, cutoff: Math.sqrt(CUTOFF2),
    gravRest: GRAV_REST, gravK: GRAV_K,
    springConnector: SPRING_CONNECTOR, springConcept: SPRING_CONCEPT,
    stepStart: STEP_START, stepEnd: STEP_END,
    // Relus sur le routeur partagé, jamais recopiés (voir circuit-router.mjs).
    routePoints: ROUTE.points, routeChamfer: ROUTE.chamfer, routeSplits: ROUTE.splits,
    routeCandidates: candidateCount(),
    routeWeights: { cross: ROUTE.wCross, overlap: ROUTE.wOverlap, node: ROUTE.wNode, len: ROUTE.wLen },
  },
};

const graph = {
  // Ce fichier est un PRODUIT de build-graph.mjs. Ne pas l'éditer à la main :
  // la prochaine exécution effacerait la correction. Corriger la règle, ou Miro.
  generatedBy: 'build-graph.mjs',
  boardId: raw.board_id,
  nodes,
  edges,
  sections: SECTIONS.map(({ id, name, color }) => ({ id, name, color })),
  // Les présentations de branche, remontées en en-tête de panneau de zone
  // (build § « PRÉSENTATIONS de branche ») : { sectionId → {category,title,description,question} }.
  presentations,
  regards: REGARDS.map(({ key, name, color }) => ({ key, name, color })),
  sousThemes: SOUS_THEMES.map(({ key, name, color }) => ({ key, name, color })),
  periodes: PERIODES.map(({ key, name, color, hint }) => ({ key, name, color, hint })),
  formes: FORMES.map(({ key, name, color }) => ({ key, name, color })),
  neutralRegardColor: NEUTRAL_REGARD_COLOR,
  method,
};

writeFileSync(OUT, JSON.stringify(graph));

// ══════════════════════════════════════════════════════ 11. Ce que le build a à dire

console.log(`\n  graph.json — ${nodes.length} nœuds, ${edges.length} arêtes, ${(JSON.stringify(graph).length / 1024).toFixed(0)} Ko\n`);
console.log(`  ${report.kept} items retenus sur ${raw.items.length}. Jetés :`);
for (const { why, n } of dropCensus) console.log(`    ${String(n).padStart(3)}  ${why}`);

console.log(`\n  Arêtes : ${edgeCounts.connector} connecteurs · ${edgeCounts.concept} « même texte »`);
if (danglingConnectors) console.log(`    ${danglingConnectors} connecteurs ignorés (une extrémité jetée)`);
console.log(`    orientation conservée : ${dirCensus.forward} vers l'avant · ${dirCensus.backward} vers l'arrière · ${dirCensus.both} réciproques · ${dirCensus.none} SANS pointe`);
console.log(`    ${dottedConnectors} pointillés conservés — le geste est restitué, son sens reste inconnu`);
console.log(`  Introduction : ${introEvents.length} événements de création ordonnés · ${Math.round(INTRO_RANK_WEIGHT * 100)} % rang + ${Math.round(INTRO_TIME_WEIGHT * 100)} % temps logarithmique`);
console.log(`  Gravité : ${gravity.length} ressorts item→section, consommés par la simulation, non expédiés.`);
{
  const c = circuitReport;
  const gain = c.straightCross ? Math.round(100 * (1 - c.circuitCross / c.straightCross)) : 0;
  const gainN = c.straightNodeHits ? Math.round(100 * (1 - c.nodeHits / c.straightNodeHits)) : 0;
  console.log(`\n  Circuit : ${c.straightCross} croisements en tracé direct → ${c.circuitCross} en orthogonal (${gain} % de moins)`);
  console.log(`            ${c.straightNodeHits} nœuds rasés en direct → ${c.nodeHits} en orthogonal (${gainN} % de moins)`);
  console.log(`    ${c.elbows} coudes posés · ${c.overlaps} recouvrements · ${c.passes} reprises (${c.moves} arêtes déplacées à la dernière) · ${(c.ms / 1000).toFixed(1)} s`);
  console.log(`    (glouton : la minimisation exacte est NP-difficile — ce chiffre n'est pas l'optimum, c'est ce qu'on a obtenu)`);
  // Un routage qui aggrave la lecture n'a aucune raison d'exister : mieux vaut
  // que le build le dise que de laisser le visiteur trouver l'option inutile.
  if (c.circuitCross >= c.straightCross) {
    console.warn(`    ⚠ Le circuit ne croise pas moins que la ligne droite. L'option ne sert alors à rien : revoir les poids, ou la retirer.`);
  }
}

console.log(`\n  Sections (${SECTIONS.length}) :`);
for (const s of SECTIONS) {
  const c = nodes.filter(n => n.kind !== 'section' && n.section === s.id).length;
  console.log(`    ${String(c).padStart(3)}  ${s.name}`);
}

console.log(`\n  Natures : ${Object.entries(natureCensus).map(([k, v]) => `${k} ${v}`).join(' · ')}`);

console.log(`\n  Formes (« Comment ? ») :`);
for (const f of FORMES) {
  const c = formeCensus[f.key] || 0;
  console.log(`    ${String(c).padStart(3)} (${String(Math.round(100 * c / report.kept)).padStart(2)} %)  ${f.name}`);
}
console.log(`    citation : passage cité ≥ ${CITATION_MIN_LEN} car. OU ≥ ${Math.round(100 * CITATION_MIN_COVER)} % du post-it`);
console.log(`    (heuristique assumée : les guillemets de MENTION — « restes humains » — restent des notes)`);

console.log(`\n  Temps (${datedCount}/${report.kept} items datés, du ${dates[0]?.slice(0, 10)} au ${dates[dates.length - 1]?.slice(0, 10)}) :`);
for (const p of PERIODES) {
  const c = periodeCensus[p.key] || 0;
  console.log(`    ${String(c).padStart(3)} (${String(Math.round(100 * c / report.kept)).padStart(2)} %)  ${p.name} — ${p.hint}`);
}

const themed = nodes.filter(n => n.kind !== 'section' && n.sousTheme).length;
const frameCount = nodes.filter(n => n.kind !== 'section' && n.section === 's_frame').length;
console.log(`  Sous-thèmes du cadre : ${themed}/${frameCount} classés`);
if (unknownFrameFills.size) {
  const total = [...unknownFrameFills.values()].reduce((a, b) => a + b, 0);
  console.warn(`  ⚠ ${total} items du cadre portent une couleur sans sous-thème (aucun titre « x … » ne la revendique) :`);
  for (const [c, n] of [...unknownFrameFills].sort((a, b) => b[1] - a[1])) console.warn(`    ${String(n).padStart(3)}  ${c}`);
}

if (unknownFills.size) {
  const total = [...unknownFills.values()].reduce((a, b) => a + b, 0);
  console.warn(`\n  ⚠ ${total} post-its hors cadre portent une couleur absente de la table des regards — « non classés » :`);
  for (const [c, n] of [...unknownFills].sort((a, b) => b[1] - a[1])) console.warn(`    ${String(n).padStart(3)}  ${c}`);
  console.warn('    (Ajouter la couleur en alias d\'un regard ci-dessus si elle en désigne un.)');
}

console.log(`\n  L'arbre (tronc = le cadre, branches = les 13 blocs) :`);
console.log(`    ${arbre.troncNodes} post-its au tronc · ${arbre.brancheNodes} aux branches`);
console.log(`    liens : ${arbre.troncLinks} internes au tronc · ${arbre.brancheLinks} internes aux branches · ${arbre.crossLinks} traversants`);
console.log(`    dont traversants : ${arbre.crossConnector} connecteur(s) tracé(s) à la main · ${arbre.crossConcept} fils « même texte »`);
if (arbre.crossConnector > 0) {
  console.warn(`    ⚠ ${arbre.crossConnector} trait tracé à la main franchit la frontière tronc/branches.`);
  console.warn(`      La fiche (§ 10) affirme qu'AUCUN ne le fait : c'est la thèse qu'il faut revoir, pas ce compte.`);
}
console.log(`    ${arbre.troncBeforeFirstBranche} post-its de tronc précèdent le 1er post-it de bloc (${arbre.firstBrancheDay})`);
console.log(`    antériorité : ${arbre.troncOlder}/${arbre.sharedStatements} énoncés présents des deux côtés sont plus anciens au tronc`);
console.log(`    (mesurée sur l'horodatage complet — au jour, la moitié serait ex æquo ; l'heure n'est jamais publiée)`);
console.log(`  Étirement de la composante géante : ${graphSpan.diameter} sauts (sur ${graphSpan.giant} post-its)`);
console.log(`  Silences de l'archive (h) : ${silences.join(', ')}`);
console.log(`  Texte médian : ${textMedian} caractères`);

const noRegard = nodes.filter(n => n.kind !== 'section' && n.section !== 's_frame' && !n.regardKey).length;
const horsCadre = nodes.filter(n => n.kind !== 'section' && n.section !== 's_frame').length;
const isolated = nodes.filter(n => n.kind !== 'section' && n.degree === 0).length;
const withLinks = nodes.filter(n => n.links.length).length;
const links = nodes.reduce((a, n) => a + n.links.length, 0);
console.log(`\n  État du corpus :`);
console.log(`    ${noRegard} nœuds hors cadre sans regard (${(100 * noRegard / horsCadre).toFixed(0)} % du hors-cadre ; le cadre n'a pas de regards, il a des sous-thèmes)`);
console.log(`    ${isolated} nœuds isolés (degré 0)`);
console.log(`    ${links} références sur ${withLinks} nœuds`);
for (const w of report.warnings) console.warn(`  ⚠ ${w}`);
console.log();
