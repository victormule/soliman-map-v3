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

export const SEMANTIC_LEXICON_VERSION = '2026-07-22.5';
