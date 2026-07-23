/**
 * Relations lexicales contrôlées.
 *
 * Ce fichier ne cherche pas à couvrir le vocabulaire du corpus mot par mot.
 * Il contient seulement des relations dont le type peut être affirmé
 * explicitement. Le moteur complète ces amorces pour chaque terme par des
 * proximités morphologiques, distributionnelles et des cooccurrences calculées
 * dans le corpus courant.
 *
 * `weight` est une proximité ordinale, jamais une probabilité.
 */
const LEXICON = {
  soliman: [
    ['soliman','identity',1,'soliman'], ['soliman al-halabi','alias',.98,'al-halabi'],
    ['al-halabi','alias',.96,'al-halabi'], ['halabi','alias',.94,'al-halabi'],
    ['soleyman','alias',.92,'al-halabi'],
  ],
  halabi: [
    ['halabi','identity',1,'al-halabi'], ['al-halabi','alias',.98,'al-halabi'],
    ['soliman','alias',.94,'soliman'], ['soliman al-halabi','alias',.96,'soliman'],
  ],
  cadavre: [
    ['cadavre','identity',1,'cadavre'], ['corps mort','equivalent',.96,'cadavre'],
    ['depouille','equivalent',.92,'depouille'], ['depouille humaine','equivalent',.92,'depouille'],
    ['restes humains','near',.84,'restes humains'], ['reste humain','near',.84,'restes humains'],
    ['corps','hypernym',.72,'corps'], ['squelette','material',.64,'squelette'],
    ['ossement','material',.58,'squelette'], ['ossements','material',.58,'squelette'],
    ['crane','part',.50,'squelette'],
  ],
  corps: [
    ['corps','identity',1,'corps'], ['corps mort','near',.92,'corps'],
    ['depouille','near',.86,'depouille'], ['cadavre','near',.82,'cadavre'],
    ['restes humains','near',.82,'restes humains'], ['reste humain','near',.82,'restes humains'],
    ['squelette','material',.68,'squelette'], ['ossement','part',.56,'squelette'], ['crane','part',.54,'squelette'],
  ],
  squelette: [
    ['squelette','identity',1,'squelette'], ['ossement','equivalent',.86,'squelette'],
    ['ossements','equivalent',.86,'squelette'], ['crane','part',.72,'squelette'],
    ['corps','whole',.68,'corps'], ['cadavre','near',.64,'cadavre'],
    ['depouille','near',.62,'depouille'], ['restes humains','near',.60,'restes humains'],
  ],
  depouille: [
    ['depouille','identity',1,'depouille'], ['depouille humaine','identity',1,'depouille'],
    ['cadavre','equivalent',.92,'cadavre'], ['corps mort','equivalent',.92,'cadavre'],
    ['restes humains','near',.84,'restes humains'], ['corps','near',.76,'corps'],
    ['squelette','material',.62,'squelette'],
  ],
  musee: [
    ['musee','identity',1,'musee'], ['museum','equivalent',.96,'musee'],
    ['museal','derivative',.86,'museal'], ['museale','derivative',.86,'museal'],
    ['museographie','practice',.68,'museographie'], ['collection','near',.62,'collection'],
    ['exposition','practice',.58,'exposition'],
  ],
  restitution: [
    ['restitution','identity',1,'restitution'], ['restituer','derivative',.94,'restitution'],
    ['rapatriement','near',.82,'rapatriement'], ['retour','near',.68,'retour'],
    ['rendre','near',.62,'retour'], ['inhumation','associated',.56,'inhumation'],
  ],
  conservation: [
    ['conservation','identity',1,'conservation'], ['conserver','derivative',.94,'conservation'],
    ['preservation','near',.84,'preservation'], ['preserver','derivative',.84,'preservation'],
    ['stockage','practice',.58,'stockage'],
  ],
  dignite: [
    ['dignite','identity',1,'dignite'], ['respect','near',.72,'respect'],
    ['decence','near',.72,'respect'], ['integrite','near',.62,'integrite'],
    ['ethique','associated',.56,'ethique'], ['deontologie','associated',.56,'ethique'],
  ],

  // ── Extension 2026-07-23 : les termes FRÉQUENTS du corpus reçoivent le même
  //    traitement contrôlé que les 9 pivots. Curé À LA MAIN, borné, défendable —
  //    poids ORDINAUX, jamais des probabilités. Les mots-outils (selon, est-ce,
  //    place, général, question…) et un nom propre non résolu (robert) sont
  //    LAISSÉS au traitement automatique (morphologie + stats du corpus) : leur
  //    inventer des synonymes serait du bruit, l'inverse du but.
  restes: [
    ['restes','identity',1,'restes humains'], ['restes humains','equivalent',.98,'restes humains'],
    ['reste humain','equivalent',.94,'restes humains'], ['ossements','near',.70,'squelette'],
    ['depouille','near',.72,'depouille'], ['corps','near',.60,'corps'], ['cadavre','near',.58,'cadavre'],
  ],
  humain: [
    ['humain','identity',1,'humain'], ['humaine','derivative',.96,'humain'], ['humains','derivative',.96,'humain'],
    ['etre humain','near',.80,'humain'], ['personne','near',.64,'personne'], ['restes humains','associated',.56,'restes humains'],
  ],
  humains: [
    ['humains','identity',1,'humain'], ['humain','equivalent',.96,'humain'],
    ['restes humains','near',.82,'restes humains'], ['personne','near',.58,'personne'],
  ],
  respect: [
    ['respect','identity',1,'respect'], ['respecter','derivative',.94,'respect'], ['respectueux','derivative',.86,'respect'],
    ['decence','equivalent',.80,'respect'], ['dignite','near',.74,'dignite'], ['ethique','associated',.54,'ethique'],
  ],
  droit: [
    ['droit','identity',1,'droit'], ['droits','derivative',.96,'droit'], ['juridique','near',.74,'droit'],
    ['legal','near',.70,'droit'], ['loi','near',.66,'droit'], ['ethique','associated',.48,'ethique'],
  ],
  personne: [
    ['personne','identity',1,'personne'], ['personnes','derivative',.96,'personne'], ['individu','equivalent',.80,'personne'],
    ['humain','near',.64,'humain'], ['corps','associated',.50,'corps'], ['dignite','associated',.50,'dignite'],
  ],
  image: [
    ['image','identity',1,'image'], ['images','derivative',.96,'image'], ['representation','near',.76,'image'],
    ['photographie','near',.64,'image'], ['iconographie','near',.60,'image'], ['recit','associated',.50,'recit'],
  ],
  objet: [
    ['objet','identity',1,'objet'], ['objets','derivative',.96,'objet'], ['artefact','near',.68,'objet'],
    ['chose','near',.58,'objet'], ['sacre','associated',.54,'sacre'], ['collection','associated',.50,'collection'],
  ],
  kleber: [
    ['kleber','identity',1,'kleber'], ['general kleber','equivalent',.96,'kleber'], ['jean-baptiste kleber','equivalent',.90,'kleber'],
    ['soliman','associated',.60,'soliman'], ['meurtre','associated',.58,'meurtre'], ['assassinat','associated',.56,'meurtre'],
  ],
  ceremonie: [
    ['ceremonie','identity',1,'ceremonie'], ['ceremonies','derivative',.96,'ceremonie'], ['rite','near',.74,'rituel'],
    ['rituel','near',.72,'rituel'], ['funeraire','associated',.60,'funeraire'], ['inhumation','associated',.54,'inhumation'],
    ['restitution','associated',.50,'restitution'],
  ],
  crane: [
    ['crane','identity',1,'squelette'], ['cranes','equivalent',.96,'squelette'], ['squelette','whole',.72,'squelette'],
    ['ossement','near',.68,'squelette'], ['restes humains','near',.60,'restes humains'], ['phrenologie','associated',.50,'phrenologie'],
  ],
  cranes: [
    ['cranes','identity',1,'squelette'], ['crane','equivalent',.96,'squelette'], ['squelette','whole',.70,'squelette'],
    ['ossements','near',.66,'squelette'], ['restes humains','near',.60,'restes humains'],
  ],
  mort: [
    ['mort','identity',1,'mort'], ['morts','derivative',.90,'mort'], ['deces','equivalent',.80,'mort'],
    ['corps mort','near',.72,'cadavre'], ['cadavre','associated',.60,'cadavre'], ['funeraire','associated',.50,'funeraire'],
  ],
  exposition: [
    ['exposition','identity',1,'exposition'], ['expositions','derivative',.96,'exposition'], ['exposer','derivative',.88,'exposition'],
    ['monstration','near',.74,'exposition'], ['museographie','near',.62,'museographie'], ['musee','associated',.60,'musee'],
  ],
  rituel: [
    ['rituel','identity',1,'rituel'], ['rituels','derivative',.96,'rituel'], ['rite','equivalent',.86,'rituel'],
    ['ceremonie','near',.74,'ceremonie'], ['funeraire','associated',.60,'funeraire'], ['symbolique','associated',.50,'symbolique'],
  ],
  symbolique: [
    ['symbolique','identity',1,'symbolique'], ['symbole','derivative',.86,'symbolique'], ['symbolisme','derivative',.80,'symbolique'],
    ['rituel','associated',.52,'rituel'], ['sacre','associated',.50,'sacre'],
  ],
  collection: [
    ['collection','identity',1,'collection'], ['collections','derivative',.96,'collection'], ['musee','near',.68,'musee'],
    ['conservation','associated',.60,'conservation'], ['exposition','associated',.56,'exposition'], ['objet','associated',.50,'objet'],
  ],
  collections: [
    ['collections','identity',1,'collection'], ['collection','equivalent',.98,'collection'], ['musee','near',.66,'musee'],
    ['conservation','associated',.58,'conservation'],
  ],
  naturalisation: [
    ['naturalisation','identity',1,'naturalisation'], ['naturaliser','derivative',.88,'naturalisation'], ['taxidermie','near',.70,'naturalisation'],
    ['conservation','associated',.56,'conservation'], ['corps','associated',.48,'corps'],
  ],
  inhumation: [
    ['inhumation','identity',1,'inhumation'], ['inhumer','derivative',.88,'inhumation'], ['enterrement','equivalent',.82,'inhumation'],
    ['sepulture','near',.76,'inhumation'], ['funeraire','associated',.62,'funeraire'], ['restitution','associated',.50,'restitution'],
  ],
  ethique: [
    ['ethique','identity',1,'ethique'], ['ethiques','derivative',.94,'ethique'], ['deontologie','near',.78,'ethique'],
    ['moral','near',.70,'ethique'], ['dignite','associated',.56,'dignite'], ['respect','associated',.50,'respect'],
  ],
  vie: [
    ['vie','identity',1,'vie'], ['vivant','derivative',.80,'vie'], ['vivante','derivative',.80,'vie'],
    ['mort','associated',.50,'mort'], ['dignite','associated',.44,'dignite'],
  ],
  politique: [
    ['politique','identity',1,'politique'], ['politiques','derivative',.94,'politique'], ['pouvoir','near',.62,'politique'],
    ['etat','associated',.60,'etat'],
  ],
  etat: [
    ['etat','identity',1,'etat'], ['etats','derivative',.88,'etat'], ['gouvernement','near',.74,'etat'],
    ['nation','near',.66,'etat'], ['syrien','associated',.60,'syrien'], ['restitution','associated',.56,'restitution'],
    ['politique','associated',.50,'politique'],
  ],
  histoire: [
    ['histoire','identity',1,'histoire'], ['historique','derivative',.86,'histoire'], ['historien','associated',.60,'historien'],
    ['memoire','near',.62,'memoire'], ['recit','near',.58,'recit'],
  ],
  funeraire: [
    ['funeraire','identity',1,'funeraire'], ['funeraires','derivative',.96,'funeraire'], ['funerailles','near',.78,'funeraire'],
    ['inhumation','associated',.62,'inhumation'], ['ceremonie','associated',.60,'ceremonie'], ['rituel','associated',.54,'rituel'],
  ],
  funeraires: [
    ['funeraires','identity',1,'funeraire'], ['funeraire','equivalent',.96,'funeraire'], ['funerailles','near',.76,'funeraire'],
    ['inhumation','associated',.60,'inhumation'],
  ],
  regard: [
    ['regard','identity',1,'regard'], ['regards','derivative',.96,'regard'], ['point de vue','equivalent',.80,'regard'],
    ['perspective','near',.70,'regard'],
  ],
  quai: [
    ['quai','identity',1,'quai branly'], ['quai branly','equivalent',.92,'quai branly'], ['branly','associated',.88,'quai branly'],
    ['musee','near',.54,'musee'],
  ],
  branly: [
    ['branly','identity',1,'quai branly'], ['quai branly','equivalent',.96,'quai branly'], ['musee du quai branly','equivalent',.94,'quai branly'],
    ['quai','associated',.86,'quai branly'], ['musee','near',.58,'musee'],
  ],
  syrien: [
    ['syrien','identity',1,'syrien'], ['syrienne','derivative',.94,'syrien'], ['syrie','near',.86,'syrien'],
    ['etat','associated',.60,'etat'], ['restitution','associated',.56,'restitution'],
  ],
  icom: [
    ['icom','identity',1,'icom'], ['conseil international des musees','equivalent',.90,'icom'], ['deontologie','associated',.58,'ethique'],
    ['musee','associated',.58,'musee'], ['ethique','associated',.50,'ethique'],
  ],
  conditionnement: [
    ['conditionnement','identity',1,'conditionnement'], ['conditionner','derivative',.88,'conditionnement'], ['stockage','near',.74,'stockage'],
    ['conservation','associated',.62,'conservation'], ['reserve','near',.60,'stockage'],
  ],
  pratiques: [
    ['pratiques','identity',1,'pratique'], ['pratique','equivalent',.96,'pratique'], ['pratiquer','derivative',.80,'pratique'],
    ['museographie','associated',.50,'museographie'],
  ],
  musees: [
    ['musees','identity',1,'musee'], ['musee','equivalent',.98,'musee'], ['museal','derivative',.84,'museal'],
    ['collection','near',.60,'collection'],
  ],
};

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[’]/g, "'").trim();
}

export function lexicalSeedsFor(query) {
  const q = norm(query);
  const rows = LEXICON[q] || [[q, 'identity', 1, q]];
  return rows.map(([term, relation, weight, zone]) => ({
    term: norm(term), relation, weight, zone: norm(zone), source: 'controlled',
  }));
}

export function relationIsSynonym(relation) {
  return relation === 'alias' || relation === 'equivalent';
}

export function relationIsEquivalent(relation) {
  return relation === 'identity' || relationIsSynonym(relation) || relation === 'derivative';
}

export const SEMANTIC_LEXICON_VERSION = '2026-07-23.1';
