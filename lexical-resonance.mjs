import { lexicalSeedsFor, relationIsEquivalent, relationIsSynonym, SEMANTIC_LEXICON_VERSION } from './semantic-lexicon.mjs';

/**
 * Cartographie du champ lexical — v4.1.
 *
 * Le moteur sépare cinq voies d'accès au sous-corpus :
 *   1. mot exact ;
 *   2. synonymie / équivalence contrôlée ;
 *   3. proximité lexicale morphologique ou distributionnelle ;
 *   4. cooccurrence statistique dans le corpus ;
 *   5. prolongement contextuel à preuves multiples.
 *
 * Les couleurs éditoriales ne participent jamais au calcul. Les copies exactes
 * restent visibles mais ne multiplient ni les fréquences ni les masses.
 */

const RAW_STOPWORDS = (
  'les des une aux ces cet cette dans pour par sur sous avec sans chez entre vers apres avant ' +
  'plus plusieurs moins tres tout tous toute toutes comme mais donc ainsi alors aussi autre autres bien cela celui celle ceux celles ' +
  'dont elle elles ils eux nous vous leur leurs notre nos votre vos son ses mes mon ton tes qui que quoi quel quelle quels quelles ' +
  'est sont etre ete etait etaient sera seront avoir ont avait avaient aura fait faire faite faits peut peuvent pouvoir doit ' +
  'doivent deja encore jamais toujours souvent peu beaucoup trop pas non oui meme memes fois etc lors lorsque quand comment ' +
  'parce car puis ici tant soit'
).split(/\s+/).filter(Boolean);

// Exclusions uniquement méthodologiques. Aucun nom propre ni terme du corpus
// n'est exclu a priori : il peut constituer une zone pertinente pour un autre mot.
const RAW_CONTEXT_EXCLUSIONS = (
  'article image photo question recherche exemple general maniere different lieu chose element point cadre ' +
  'notamment ayant bonne cesse present admis devient ' +
  'faire fait ainsi aussi plus autre cette comme dont avec dans pour sur sans entre'
).split(/\s+/).filter(Boolean);

const PHRASE_EDGE_WORDS = new Set(
  'de du des le la les un une et ou a au aux en dans sur sous pour par avec sans chez entre vers'.split(/\s+/)
);

export const RESONANCE_DEFAULTS = Object.freeze({
  maxFamilies: 9,
  maxTermsPerFamily: 12,
  maxLexicalSeeds: 18,
  maxInducedLexicalSeeds: 12,
  maxCooccurrenceTerms: 48,
  minSemanticDf: 2,
  minPhraseDf: 2,
  maxPhraseDfRatio: 0.32,
  contextWindow: 5,
  minSharedContexts: 2,
  minCooccurrenceSupport: 2,
  minCooccurrenceScore: 0.24,
  minLexicalDocumentWeight: 0.42,
  minContextualScore: 0.20,
  minExtensionTerms: 2,
  minIndependentEvidence: 2,
  maxExtensionsPerFamily: 72,
  maxIncludedCanonicalDocuments: 280,
  familyRadiusNear: 42,
  familyRadiusFar: 126,
  zoneSpreadBase: 13,
  zoneSpreadPerSqrtMass: 5.8,
  depth3d: 74,
  constellationLobeSpread: 18,
  constellationRadialBand: 34,
  bridgeThreshold: 0.74,
});

export function normalizeFrench(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’]/g, "'");
}

/** Normalisation conservatrice ; ce n'est pas une lemmatisation. */
export function morphologyKey(token) {
  let w = normalizeFrench(token).replace(/^[-']+|[-']+$/g, '');
  if (w.length < 3) return w;
  if (w.endsWith('eaux') && w.length > 5) w = w.slice(0, -1);
  else if (w.endsWith('aux') && w.length > 5) w = w.slice(0, -3) + 'al';
  else if (w.endsWith('ies') && w.length > 5) w = w.slice(0, -1);
  else if (w.endsWith('ees') && w.length > 5) w = w.slice(0, -1);
  else if (w.endsWith('es') && w.length > 5) w = w.slice(0, -1);
  else if (w.endsWith('s') && !/[piuoas]s$/.test(w) && !w.endsWith('ss') && w.length > 4) w = w.slice(0, -1);
  return w;
}

const normalizedSet = words => new Set(words.map(morphologyKey).filter(Boolean));
const DEFAULT_STOPWORDS = normalizedSet(RAW_STOPWORDS);
const CONTEXT_EXCLUSIONS = normalizedSet(RAW_CONTEXT_EXCLUSIONS);

export function tokenizeResonance(text, { stopwords = DEFAULT_STOPWORDS } = {}) {
  return normalizeFrench(text)
    .replace(/https?:\/\/\S+|www\.\S+/g, ' ')
    .split(/[^a-z0-9'-]+/)
    .map(w => w.replace(/^(l|d|j|n|s|t|c|m|qu|jusqu|lorsqu|puisqu)'/, '').replace(/^[-']+|[-']+$/g, ''))
    .filter(w => w.length >= 3 && !/^\d+$/.test(w))
    .map(morphologyKey)
    .filter(w => w.length >= 3 && !stopwords.has(w));
}

function surfaceSequence(text) {
  const src = normalizeFrench(text).replace(/https?:\/\/\S+|www\.\S+/g, ' ');
  const out = [];
  const re = /[a-z0-9]+(?:'[a-z0-9]+)?/g;
  let m;
  while ((m = re.exec(src))) {
    const raw = m[0];
    if (/^\d+$/.test(raw)) continue;
    const apostrophe = raw.indexOf("'");
    if (apostrophe > 0) {
      const prefix = raw.slice(0, apostrophe);
      const rest = raw.slice(apostrophe + 1);
      if (prefix === 'j') out.push('je');
      else if (prefix === 'm') out.push('me');
      else if (prefix === 't') out.push('te');
      else if (prefix === 's') out.push('se');
      if (rest) out.push(morphologyKey(rest));
    } else out.push(morphologyKey(raw));
  }
  return out.filter(Boolean);
}

function surfaceForms(text) {
  const forms = new Set(surfaceSequence(text));
  const src = normalizeFrench(text).replace(/https?:\/\/\S+|www\.\S+/g, ' ');
  const re = /[a-z0-9]+(?:[-'][a-z0-9]+)+/g;
  let match;
  while ((match = re.exec(src))) {
    const compound = morphologyKey(match[0]);
    if (compound) forms.add(compound);
    match[0].split(/[-']/).map(morphologyKey).filter(Boolean).forEach(part => forms.add(part));
  }
  return forms;
}

function phraseKey(text) {
  return normalizeFrench(text).replace(/[^a-z0-9'-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function canonicalText(node) {
  return normalizeFrench(node.fullText || node.label || '')
    .replace(/https?:\/\/\S+|www\.\S+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function hash32(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round = (x, n = 4) => { const p = 10 ** n; return Math.round(x * p) / p; };

function intersectSize(A, B) {
  let n = 0;
  const [small, large] = A.size <= B.size ? [A, B] : [B, A];
  small.forEach(v => { if (large.has(v)) n++; });
  return n;
}

function jaccard(A, B) {
  if (!A.size && !B.size) return 1;
  const inter = intersectSize(A, B);
  return inter / Math.max(1, A.size + B.size - inter);
}

function corpusNodes(nodes) {
  const paratext = new Set(['titre', 'question', 'meta']);
  return nodes.filter(n => n.kind !== 'section' && !paratext.has(n.nature));
}

function recurringPhrases(sequence) {
  const phrases = new Set();
  for (let size = 2; size <= 3; size++) {
    for (let i = 0; i + size <= sequence.length; i++) {
      const part = sequence.slice(i, i + size);
      if (!part.every(Boolean)) continue;
      if (PHRASE_EDGE_WORDS.has(part[0]) || PHRASE_EDGE_WORDS.has(part[part.length - 1])) continue;
      if (part.filter(w => w.length >= 3 && !DEFAULT_STOPWORDS.has(w)).length < 2) continue;
      const value = part.join(' ');
      if (value.length >= 7) phrases.add(value);
    }
  }
  return phrases;
}

const MODEL_CACHE = new WeakMap();

function buildCorpusModel(nodes, options = {}) {
  if (!options.stopwords && MODEL_CACHE.has(nodes)) return MODEL_CACHE.get(nodes);
  const corpus = corpusNodes(nodes);
  const canonicalGroups = new Map();
  corpus.forEach(n => {
    const key = canonicalText(n) || `id:${n.id}`;
    if (!canonicalGroups.has(key)) canonicalGroups.set(key, []);
    canonicalGroups.get(key).push(n.id);
  });

  const canonicalOf = new Map();
  canonicalGroups.forEach(ids => {
    ids.sort();
    ids.forEach(id => canonicalOf.set(id, ids[0]));
  });

  const docs = new Map();
  const canonicalDocs = new Map();
  const docsByTerm = new Map();
  const docsBySurfaceTerm = new Map();
  const phraseCounts = new Map();

  corpus.forEach(n => {
    const text = n.fullText || n.label || '';
    const sequence = surfaceSequence(text);
    const tokens = new Set(tokenizeResonance(text, options));
    const surfaces = surfaceForms(text);
    const canonicalId = canonicalOf.get(n.id);
    const doc = {
      node: n, canonicalId, sequence, tokens, surfaceTokens: surfaces,
      normalized: phraseKey(text), phraseCandidates: recurringPhrases(sequence), phrases: new Set(), units: new Set(tokens),
    };
    docs.set(n.id, doc);
    if (n.id !== canonicalId) return;
    canonicalDocs.set(canonicalId, doc);
    tokens.forEach(t => {
      if (!docsByTerm.has(t)) docsByTerm.set(t, new Set());
      docsByTerm.get(t).add(canonicalId);
    });
    surfaces.forEach(t => {
      if (!docsBySurfaceTerm.has(t)) docsBySurfaceTerm.set(t, new Set());
      docsBySurfaceTerm.get(t).add(canonicalId);
    });
    doc.phraseCandidates.forEach(p => phraseCounts.set(p, (phraseCounts.get(p) || 0) + 1));
  });

  const N = canonicalDocs.size;
  const docsByPhrase = new Map();
  canonicalDocs.forEach((doc, id) => {
    doc.phraseCandidates.forEach(p => {
      const df = phraseCounts.get(p) || 0;
      if (df < (options.minPhraseDf || RESONANCE_DEFAULTS.minPhraseDf)) return;
      if (df > N * (options.maxPhraseDfRatio || RESONANCE_DEFAULTS.maxPhraseDfRatio)) return;
      doc.phrases.add(p); doc.units.add(p);
      if (!docsByPhrase.has(p)) docsByPhrase.set(p, new Set());
      docsByPhrase.get(p).add(id);
    });
  });
  // Les copies héritent exactement des unités de leur document canonique.
  docs.forEach((doc, id) => {
    if (id === doc.canonicalId) return;
    const canonical = canonicalDocs.get(doc.canonicalId);
    doc.phrases = canonical.phrases;
    doc.units = canonical.units;
  });

  const targetContextCounts = new Map();
  const targetPairTotals = new Map();
  const contextTotals = new Map();
  let totalContextPairs = 0;
  const radius = options.contextWindow || RESONANCE_DEFAULTS.contextWindow;
  canonicalDocs.forEach(doc => {
    const seq = doc.sequence;
    for (let i = 0; i < seq.length; i++) {
      const target = seq[i];
      if (!target) continue;
      let targetMap = targetContextCounts.get(target);
      if (!targetMap) targetContextCounts.set(target, targetMap = new Map());
      for (let j = Math.max(0, i - radius); j <= Math.min(seq.length - 1, i + radius); j++) {
        if (j === i) continue;
        const context = seq[j];
        if (!context || context === target || context.length < 3 || DEFAULT_STOPWORDS.has(context)) continue;
        targetMap.set(context, (targetMap.get(context) || 0) + 1);
        targetPairTotals.set(target, (targetPairTotals.get(target) || 0) + 1);
        contextTotals.set(context, (contextTotals.get(context) || 0) + 1);
        totalContextPairs++;
      }
    }
  });

  const model = {
    corpus, docs, canonicalDocs, canonicalGroups, canonicalOf,
    docsByTerm, docsBySurfaceTerm, docsByPhrase, phraseCounts,
    targetContextCounts, targetPairTotals, contextTotals, totalContextPairs,
    vectorCache: new Map(), similarityCache: new Map(), scannedUnitCache: new Map(), N,
  };
  if (!options.stopwords) MODEL_CACHE.set(nodes, model);
  return model;
}

function docsForUnit(term, model) {
  const unit = phraseKey(term);
  if (!unit) return new Set();
  if (!unit.includes(' ')) return model.docsBySurfaceTerm.get(morphologyKey(unit)) || new Set();
  if (model.docsByPhrase.has(unit)) return model.docsByPhrase.get(unit);
  if (model.scannedUnitCache.has(unit)) return model.scannedUnitCache.get(unit);
  const escaped = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`);
  const ids = new Set();
  model.canonicalDocs.forEach((doc, id) => { if (re.test(doc.normalized)) ids.add(id); });
  model.scannedUnitCache.set(unit, ids);
  return ids;
}

function docHasUnit(doc, term) {
  const unit = phraseKey(term);
  if (!unit) return false;
  if (!unit.includes(' ')) return doc.surfaceTokens.has(morphologyKey(unit));
  if (doc.phrases.has(unit)) return true;
  const escaped = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(doc.normalized);
}

function ppmiVector(term, model) {
  const key = morphologyKey(term);
  if (model.vectorCache.has(key)) return model.vectorCache.get(key);
  const counts = model.targetContextCounts.get(key) || new Map();
  const total = model.targetPairTotals.get(key) || 0;
  const vector = new Map();
  if (total && model.totalContextPairs) {
    counts.forEach((count, context) => {
      const contextTotal = model.contextTotals.get(context) || 0;
      if (!contextTotal) return;
      const value = Math.log(((count + 0.25) * model.totalContextPairs) / ((total + 0.25) * (contextTotal + 0.25)));
      if (value > 0) vector.set(context, value);
    });
  }
  model.vectorCache.set(key, vector);
  return vector;
}

function contextSimilarity(a, b, model) {
  a = morphologyKey(a); b = morphologyKey(b);
  if (!a || !b || a.includes(' ') || b.includes(' ')) return { score: 0, shared: 0 };
  const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
  if (model.similarityCache.has(key)) return model.similarityCache.get(key);
  let A = ppmiVector(a, model), B = ppmiVector(b, model);
  if (!A.size || !B.size) return { score: 0, shared: 0 };
  const normA = Math.sqrt([...A.values()].reduce((s, x) => s + x * x, 0));
  const normB = Math.sqrt([...B.values()].reduce((s, x) => s + x * x, 0));
  if (A.size > B.size) [A, B] = [B, A];
  let dot = 0, shared = 0;
  A.forEach((x, context) => {
    const y = B.get(context);
    if (y !== undefined) { dot += x * y; shared++; }
  });
  const result = { score: normA && normB ? dot / (normA * normB) : 0, shared };
  model.similarityCache.set(key, result);
  return result;
}

const DERIVATIONAL_SUFFIXES = [
  'isations','isation','itions','ition','ations','ation','ements','ement','iques','ique',
  'ateurs','ateur','atrices','atrice','ables','able','ibles','ible','ismes','isme',
  'istes','iste','ites','ite','ures','ure','ances','ance','ences','ence','eurs','eur',
  'euses','euse','ments','ment','er','ir','re','al','el','if','ive','ite',
];

function derivationalRoots(term) {
  const w = morphologyKey(term);
  const roots = new Set([w]);
  for (const suffix of DERIVATIONAL_SUFFIXES) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) roots.add(w.slice(0, -suffix.length));
  }
  return roots;
}

function commonPrefixLength(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function morphologicalSimilarity(a, b) {
  a = morphologyKey(a); b = morphologyKey(b);
  if (!a || !b || a === b || a.includes(' ') || b.includes(' ')) return a === b ? 1 : 0;
  const A = derivationalRoots(a), B = derivationalRoots(b);
  let sharedRoot = 0;
  A.forEach(x => { if (B.has(x)) sharedRoot = Math.max(sharedRoot, x.length); });
  const prefix = commonPrefixLength(a, b);
  const minLen = Math.min(a.length, b.length);
  if (sharedRoot >= 5) return clamp(0.66 + 0.04 * Math.min(5, sharedRoot - 4), 0, 0.90);
  if (prefix >= 5 && prefix / minLen >= 0.62) return clamp(0.48 + 0.42 * (prefix / minLen), 0, 0.86);
  if (prefix >= 4 && prefix / minLen >= 0.78) return 0.62;
  return 0;
}

function cooccurrenceStats(A, B, N) {
  const local = intersectSize(A, B);
  if (!local || !A.size || !B.size || !N) return { local: 0, npmi: 0, coverage: 0 };
  const pxy = (local + 0.25) / (N + 0.5);
  const px = (A.size + 0.5) / (N + 1);
  const py = (B.size + 0.5) / (N + 1);
  const pmi = Math.log(pxy / (px * py));
  const npmi = clamp(pmi / Math.max(1e-9, -Math.log(pxy)), -1, 1);
  return { local, npmi, coverage: local / A.size };
}

function dedupeSeeds(rows) {
  const byTerm = new Map();
  rows.forEach(row => {
    const term = phraseKey(row.term);
    if (!term) return;
    const normalized = { ...row, term, zone: phraseKey(row.zone || term) };
    const previous = byTerm.get(term);
    if (!previous || normalized.weight > previous.weight || (normalized.weight === previous.weight && normalized.source === 'controlled')) {
      byTerm.set(term, normalized);
    }
  });
  return [...byTerm.values()];
}

function induceLexicalSeeds(focal, model, opts) {
  const directDocs = docsForUnit(focal, model);
  const controlled = lexicalSeedsFor(focal).map(seed => ({
    ...seed,
    relationClass: seed.relation === 'identity' ? 'direct'
      : relationIsSynonym(seed.relation) ? 'synonym' : 'lexical',
    nuclear: seed.relation === 'identity' || seed.relation === 'alias',
    evidenceLabel: seed.relation === 'alias' ? 'alias contrôlé'
      : relationIsSynonym(seed.relation) ? 'synonymie / équivalence contrôlée'
        : relationIsEquivalent(seed.relation) ? 'forme dérivée contrôlée' : 'relation lexicale contrôlée',
    docs: docsForUnit(seed.term, model),
  }));

  const candidates = [];
  const focalDf = directDocs.size;
  const threshold = focalDf < 3 ? 0.36 : focalDf < 6 ? 0.31 : focalDf < 15 ? 0.27 : 0.235;
  model.docsBySurfaceTerm.forEach((ids, term) => {
    if (term === focal || term.length < 3 || ids.size < opts.minSemanticDf || ids.size > model.N * 0.55) return;
    if (DEFAULT_STOPWORDS.has(term) || CONTEXT_EXCLUSIONS.has(term)) return;
    const morph = morphologicalSimilarity(focal, term);
    const sim = contextSimilarity(focal, term, model);
    const cooc = cooccurrenceStats(directDocs, ids, model.N);
    const support = clamp(Math.log1p(Math.min(focalDf || 1, ids.size)) / Math.log(9), 0, 1);
    if (morph >= 0.62 && (sim.score >= 0.07 || cooc.local > 0)) {
      candidates.push({ term, relation: 'derivative', relationClass: 'lexical',
        weight: clamp(0.58 + 0.30 * morph + 0.12 * sim.score, 0, 0.92), zone: term,
        source: 'morphology', evidenceLabel: 'proximité morphologique', docs: ids,
        distributional: sim.score, sharedContexts: sim.shared, morphology: morph });
    } else if (sim.score >= threshold && sim.shared >= Math.max(opts.minSharedContexts, focalDf >= 6 ? 3 : 2)
      && cooc.coverage < 0.45 && cooc.npmi < 0.28) {
      const weight = clamp(0.50 + 0.34 * sim.score + 0.10 * support + 0.06 * Math.max(0, cooc.npmi), 0, 0.88);
      candidates.push({ term, relation: 'distributional', relationClass: 'lexical', weight, zone: term,
        source: 'corpus-distribution', evidenceLabel: 'proximité lexicale distributionnelle', docs: ids,
        distributional: sim.score, sharedContexts: sim.shared, morphology: morph });
    }
  });

  // Les expressions récurrentes contenant le mot focal sont des formes de
  // déploiement lexical ; elles ne sont jamais déclarées synonymes exacts.
  model.docsByPhrase.forEach((ids, phrase) => {
    const parts = phrase.split(' ');
    const contains = parts.includes(focal) || parts.some(part => morphologicalSimilarity(focal, part) >= 0.72);
    if (!contains) return;
    const weight = clamp(0.66 + 0.08 * Math.log1p(ids.size), 0, 0.88);
    candidates.push({ term: phrase, relation: 'direct-expression', relationClass: 'direct', weight, zone: phrase,
      source: 'corpus-phrase', evidenceLabel: 'expression directe attestée', docs: ids,
      distributional: 0, sharedContexts: 0, morphology: 0 });
  });

  candidates.sort((a, b) => b.weight - a.weight || (b.distributional || 0) - (a.distributional || 0)
    || b.docs.size - a.docs.size || a.term.localeCompare(b.term, 'fr'));
  const induced = candidates.slice(0, opts.maxInducedLexicalSeeds);
  const seeds = dedupeSeeds([...controlled, ...induced]);
  const identity = seeds.find(s => s.relationClass === 'direct') || {
    term: focal, relation: 'identity', relationClass: 'direct', weight: 1, zone: focal,
    source: 'query', evidenceLabel: 'mot exact', docs: directDocs,
  };
  const others = seeds.filter(s => s.term !== identity.term)
    .sort((a, b) => b.weight - a.weight || b.docs.size - a.docs.size || a.term.localeCompare(b.term, 'fr'))
    .slice(0, Math.max(0, opts.maxLexicalSeeds - 1));
  return [identity, ...others];
}

function pickCooccurrenceTerms(focal, directDocs, lexicalSeeds, model, opts) {
  // La cooccurrence reste une relation statistique au mot focal. Seules les
  // équivalences contrôlées très fortes peuvent compléter un noyau trop rare ;
  // les hyperonymes et proximités générales ne diffusent pas leur contexte ici.
  const anchorWeights = new Map();
  directDocs.forEach(id => anchorWeights.set(id, 1));
  lexicalSeeds.filter(seed => seed.relationClass === 'synonym'
    && seed.source === 'controlled' && relationIsEquivalent(seed.relation) && seed.weight >= 0.86)
    .forEach(seed => seed.docs.forEach(id => anchorWeights.set(id, Math.max(anchorWeights.get(id) || 0, 0.76))));
  const anchorDocs = new Set(anchorWeights.keys());
  const lexicalTerms = new Set(lexicalSeeds.map(seed => seed.term));
  const rows = [];
  const visit = (term, ids, isPhrase) => {
    if (!ids.size || lexicalTerms.has(term) || term === focal) return;
    if (!isPhrase && (term.length < 3 || DEFAULT_STOPWORDS.has(term) || CONTEXT_EXCLUSIONS.has(term))) return;
    if (ids.size > model.N * 0.48) return;
    let weightedLocal = 0, localDocs = 0, directLocal = 0;
    ids.forEach(id => {
      const weight = anchorWeights.get(id) || 0;
      if (weight > 0) { weightedLocal += weight; localDocs++; }
      if (directDocs.has(id)) directLocal++;
    });
    const minimum = anchorDocs.size < 4 ? 1 : opts.minCooccurrenceSupport;
    if (localDocs < minimum) return;
    const stats = cooccurrenceStats(anchorDocs, ids, model.N);
    if (stats.npmi <= 0.03) return;
    const specificity = Math.log((model.N + 0.5) / (ids.size + 0.5)) / Math.log(model.N + 1);
    const support = clamp(localDocs / Math.max(3, Math.sqrt(anchorDocs.size)), 0, 1);
    const directCoverage = directLocal / Math.max(1, directDocs.size);
    const score = clamp(
      0.46 * Math.max(0, stats.npmi)
      + 0.22 * stats.coverage
      + 0.14 * support
      + 0.10 * specificity
      + 0.08 * directCoverage, 0, 1);
    if (score < opts.minCooccurrenceScore) return;
    rows.push({ term, relation: 'cooccurrence', relationClass: 'cooccurrence', zone: term,
      source: 'corpus-cooccurrence', evidenceLabel: 'cooccurrence statistique', docs: ids,
      local: localDocs, directLocal, weightedLocal, df: ids.size, lift: stats.npmi,
      specificity, coverage: stats.coverage, directCoverage, score, weight: score, isPhrase });
  };
  model.docsByTerm.forEach((ids, term) => visit(term, ids, false));
  model.docsByPhrase.forEach((ids, term) => visit(term, ids, true));
  return rows.sort((a, b) => b.score - a.score || b.directLocal - a.directLocal
    || b.local - a.local || a.term.localeCompare(b.term, 'fr'))
    .slice(0, opts.maxCooccurrenceTerms);
}

function fieldTermImportance(term) {
  const phrasePenalty = term.term.includes(' ') ? 0.72 : 1;
  if (term.relationClass === 'direct') return phrasePenalty * 0.72 * Math.log1p(term.docs.size);
  if (term.relationClass === 'synonym') {
    return phrasePenalty * 1.32 * (0.90 + 0.60 * term.weight) * Math.log1p(term.docs.size);
  }
  if (term.relationClass === 'lexical') {
    const sourceFactor = term.source === 'controlled' ? 1.16
      : term.source === 'morphology' ? 1.02
      : term.source === 'corpus-distribution' ? 0.76 : 0.88;
    return phrasePenalty * sourceFactor * (0.82 + 0.58 * term.weight) * Math.log1p(term.docs.size);
  }
  const directSupport = term.directLocal || 0;
  const support = Math.log1p(2.2 * directSupport + (term.local || 0));
  return phrasePenalty * (0.56 + 0.76 * term.score) * support;
}

function termSimilarity(a, b, model) {
  const doc = jaccard(a.docs, b.docs);
  const context = (!a.term.includes(' ') && !b.term.includes(' ')) ? contextSimilarity(a.term, b.term, model).score : 0;
  const sameClass = a.relationClass === b.relationClass ? 0.08 : 0;
  const lexicalOverlap = a.term.includes(b.term) || b.term.includes(a.term) ? 0.18 : 0;
  return clamp(0.62 * doc + 0.20 * context + sameClass + lexicalOverlap, 0, 1);
}

function buildFamilies(fieldTerms, anchorCount, model, opts) {
  if (!fieldTerms.length) return [];
  let pool = fieldTerms.filter(t => t.docs.size && !t.nuclear);
  const nonDirect = pool.filter(t => t.relationClass !== 'direct');
  if (nonDirect.length >= 2) pool = nonDirect;
  // Les expressions composées restent des descripteurs de zone, mais un mot
  // simple est préféré comme centre dès que le corpus en offre assez. Cela
  // évite de transformer chaque syntagme rare en territoire autonome.
  const singleTerms = pool.filter(t => !t.term.includes(' '));
  if (singleTerms.length >= 2) pool = singleTerms;
  pool = [...pool].sort((a, b) => fieldTermImportance(b) - fieldTermImportance(a)
    || b.docs.size - a.docs.size || a.term.localeCompare(b.term, 'fr'));
  const adaptiveMax = clamp(Math.round(Math.log2(Math.max(2, anchorCount + 1))) + 2, 2, opts.maxFamilies);
  // Les termes fortement attestés avec le focal doivent pouvoir devenir des
  // zones, même s'ils partagent une partie de leurs documents. C'est ce qui
  // permet de lire séparément, par exemple, corps / squelette / syrien autour
  // de Soliman, au lieu de les fondre dans un seul paquet.
  const priority = [
    ...pool.filter(t => t.relationClass === 'synonym' && t.source === 'controlled' && t.weight >= 0.80)
      .sort((a, b) => b.weight - a.weight || b.docs.size - a.docs.size),
    ...pool.filter(t => t.relationClass === 'cooccurrence' && (t.directLocal || 0) >= 2)
      .sort((a, b) => b.directLocal - a.directLocal || b.score - a.score || a.term.localeCompare(b.term, 'fr'))
      .slice(0, 5),
    ...pool,
  ];
  const seeds = [];
  const seenTerms = new Set();
  for (const candidate of priority) {
    if (seenTerms.has(candidate.term)) continue;
    seenTerms.add(candidate.term);
    const nearest = seeds.length ? Math.max(...seeds.map(seed => termSimilarity(candidate, seed, model))) : 0;
    const priorityTerm = candidate.relationClass === 'cooccurrence' && (candidate.directLocal || 0) >= 2;
    if (!seeds.length || nearest < (priorityTerm ? 0.86 : 0.72)) seeds.push(candidate);
    if (seeds.length >= adaptiveMax) break;
  }
  if (!seeds.length) seeds.push(fieldTerms[0]);

  const families = seeds.map((seed, i) => ({
    id: `f${i + 1}`, label: seed.term, seed: seed.term,
    seedRelationClass: seed.relationClass, seedRelation: seed.relation,
    seedWeight: seed.weight ?? seed.score ?? 0, seedLocal: seed.directLocal ?? seed.local ?? seed.docs.size,
    terms: [], occurrenceIds: new Set(), directIds: new Set(), synonymIds: new Set(), lexicalIds: new Set(),
    cooccurrenceIds: new Set(), extensionIds: new Set(), strength: 0, mass: 0,
    affinity: 0, center2d: [0, 0, 0], center3d: [0, 0, 0],
    directSupport: 0, synonymSupport: 0, lexicalSupport: 0, cooccurrenceSupport: 0,
  }));

  const termsForFamilies = fieldTerms.filter(term => !term.nuclear && term.relationClass !== 'direct');
  (termsForFamilies.length ? termsForFamilies : fieldTerms.filter(term => !term.nuclear)).forEach(term => {
    let best = 0, bestScore = -1;
    seeds.forEach((seed, i) => {
      const score = termSimilarity(term, seed, model) + (term.term === seed.term ? 1 : 0);
      if (score > bestScore) { bestScore = score; best = i; }
    });
    families[best].terms.push({ ...term, familyWeight: fieldTermImportance(term) });
  });

  families.forEach(family => {
    family.terms.sort((a, b) => (b.term === family.seed) - (a.term === family.seed)
      || b.familyWeight - a.familyWeight || a.term.localeCompare(b.term, 'fr'));
    family.terms = family.terms.slice(0, opts.maxTermsPerFamily);
    family.strength = family.terms.reduce((sum, term) => sum + term.familyWeight, 0);
  });
  return families;
}

function familyFit(doc, family) {
  const matched = family.terms.filter(term => docHasUnit(doc, term.term));
  if (!matched.length) return { score: 0, matched: [], synonymMatched: [], lexicalMatched: [], cooccurrenceMatched: [] };
  const maxWeight = Math.max(1e-9, ...family.terms.map(t => t.familyWeight));
  const weighted = matched.reduce((sum, term) => sum + term.familyWeight / maxWeight, 0);
  const denominator = family.terms.slice(0, 6).reduce((sum, term) => sum + term.familyWeight / maxWeight, 0) || 1;
  const seedBonus = docHasUnit(doc, family.seed) ? 0.30 : 0;
  const score = clamp(0.58 * (weighted / denominator) + 0.30 * Math.min(1, matched.length / 3) + seedBonus, 0, 1);
  return {
    score,
    matched: matched.map(t => t.term),
    synonymMatched: matched.filter(t => t.relationClass === 'synonym').map(t => t.term),
    lexicalMatched: matched.filter(t => t.relationClass === 'lexical').map(t => t.term),
    cooccurrenceMatched: matched.filter(t => t.relationClass === 'cooccurrence').map(t => t.term),
  };
}

function bestFamilies(doc, families) {
  let best = null, second = null;
  families.forEach(family => {
    const fit = familyFit(doc, family);
    const row = { family, fit };
    if (!best || fit.score > best.fit.score) { second = best; best = row; }
    else if (!second || fit.score > second.fit.score) second = row;
  });
  return { best, second };
}

function adjacencyEvidence(edges, model) {
  const adj = new Map();
  for (const edge of edges || []) {
    const source = model.canonicalOf.get(edge.source);
    const target = model.canonicalOf.get(edge.target);
    if (!source || !target || source === target) continue;
    if (!adj.has(source)) adj.set(source, new Set());
    if (!adj.has(target)) adj.set(target, new Set());
    adj.get(source).add(target); adj.get(target).add(source);
  }
  return adj;
}

function relationLabel(type) {
  if (type === 'direct') return 'mot exact';
  if (type === 'synonym') return 'synonymie / équivalence';
  if (type === 'lexical') return 'proximité lexicale';
  if (type === 'cooccurrence') return 'cooccurrence';
  return 'prolongement contextuel';
}

function assignCanonicalDocuments(model, focal, directDocs, lexicalSeeds, cooccurrenceTerms, families, opts) {
  const assignments = new Map();
  const synonyms = lexicalSeeds.filter(seed => seed.relationClass === 'synonym' && seed.weight >= opts.minLexicalDocumentWeight);
  const lexical = lexicalSeeds.filter(seed => seed.relationClass === 'lexical' && seed.weight >= opts.minLexicalDocumentWeight);
  const cooccurrence = cooccurrenceTerms.filter(term => term.score >= opts.minCooccurrenceScore);

  model.canonicalDocs.forEach((doc, id) => {
    const direct = directDocs.has(id);
    const synonymMatches = synonyms.filter(seed => docHasUnit(doc, seed.term));
    const lexicalMatches = lexical.filter(seed => docHasUnit(doc, seed.term));
    const cooccurrenceMatches = cooccurrence.filter(term => docHasUnit(doc, term.term));
    const bestSynonym = synonymMatches.sort((a, b) => b.weight - a.weight)[0] || null;
    const bestLexical = lexicalMatches.sort((a, b) => b.weight - a.weight)[0] || null;
    const bestCooccurrence = cooccurrenceMatches.sort((a, b) => b.score - a.score)[0] || null;
    const cooccurrenceEvidence = cooccurrenceMatches.slice(0, 2).reduce((sum, term) => sum + term.score, 0);
    const cooccurrenceQualified = !!bestCooccurrence && (bestCooccurrence.score >= 0.52
      || (cooccurrenceMatches.length >= 2 && cooccurrenceEvidence >= 0.58)
      || (bestCooccurrence.isPhrase && bestCooccurrence.score >= 0.38));
    let relationClass = null;
    if (direct) relationClass = 'direct';
    else if (bestSynonym) relationClass = 'synonym';
    else if (bestLexical) relationClass = 'lexical';
    else if (cooccurrenceQualified) relationClass = 'cooccurrence';
    if (!relationClass) return;

    const { best, second } = bestFamilies(doc, families);
    const relevance = relationClass === 'direct' ? 1
      : relationClass === 'synonym' ? clamp(0.76 + 0.23 * bestSynonym.weight, 0, 0.995)
        : relationClass === 'lexical' ? clamp(0.58 + 0.38 * bestLexical.weight, 0, 0.96)
          : clamp(0.44 + 0.38 * bestCooccurrence.score + 0.08 * Math.min(1, cooccurrenceMatches.length / 3), 0, 0.90);
    const bridge = best && second && second.fit.score >= best.fit.score * opts.bridgeThreshold;
    const seed = relationClass === 'synonym' ? bestSynonym
      : relationClass === 'lexical' ? bestLexical : null;
    assignments.set(id, {
      canonicalId: id,
      type: relationClass === 'direct' ? 'occurrence' : relationClass,
      relationClass, relationLabel: relationLabel(relationClass),
      familyId: best?.fit.score > 0 ? best.family.id : null,
      secondaryFamilyId: bridge ? second.family.id : null,
      score: round(best?.fit.score || 0), relevance: round(relevance),
      matchedTerms: best?.fit.matched || [],
      synonymTerms: synonymMatches.slice(0, 5).map(item => item.term),
      lexicalTerms: lexicalMatches.slice(0, 5).map(item => item.term),
      cooccurrenceTerms: cooccurrenceMatches.slice(0, 5).map(term => term.term),
      seedTerm: seed?.term || (relationClass === 'cooccurrence' ? bestCooccurrence?.term : focal),
      seedRelation: seed?.relation || (relationClass === 'cooccurrence' ? 'cooccurrence' : 'identity'),
      evidence: {
        direct,
        synonym: round(bestSynonym?.weight || 0),
        synonymSource: bestSynonym?.source || null,
        lexical: round(bestLexical?.weight || 0),
        lexicalSource: bestLexical?.source || null,
        distributional: round(bestLexical?.distributional || 0),
        cooccurrence: round(bestCooccurrence?.score || 0),
        cooccurrenceLift: round(bestCooccurrence?.lift || 0),
        graph: 0,
      },
    });
  });

  const adj = adjacencyEvidence(opts.edges, model);
  const assignedIds = new Set(assignments.keys());
  const extensionsByFamily = new Map(families.map(f => [f.id, []]));
  model.canonicalDocs.forEach((doc, id) => {
    if (assignedIds.has(id)) return;
    let best = null, second = null;
    families.forEach(family => {
      const fit = familyFit(doc, family);
      if (!fit.matched.length) return;
      const neighbors = adj.get(id) || new Set();
      let linked = 0;
      neighbors.forEach(other => { if (assignedIds.has(other)) linked++; });
      const graph = clamp(linked / 2, 0, 1);
      const multiTerm = fit.matched.length >= opts.minExtensionTerms;
      const activeChannels = Number(fit.synonymMatched.length > 0)
        + Number(fit.lexicalMatched.length > 0) + Number(fit.cooccurrenceMatched.length > 0);
      const mixedChannels = activeChannels >= 2;
      const phraseEvidence = fit.matched.some(term => term.includes(' '));
      const graphEvidence = graph > 0;
      const evidenceCount = Number(multiTerm) + Number(mixedChannels) + Number(phraseEvidence) + Number(graphEvidence);
      if (evidenceCount < opts.minIndependentEvidence) return;
      const relevance = clamp(0.66 * fit.score + 0.20 * graph + 0.08 * Number(mixedChannels) + 0.06 * Number(phraseEvidence), 0, 1);
      if (relevance < opts.minContextualScore) return;
      const row = { family, fit, graph, evidenceCount, relevance };
      if (!best || relevance > best.relevance) { second = best; best = row; }
      else if (!second || relevance > second.relevance) second = row;
    });
    if (best) extensionsByFamily.get(best.family.id).push({ id, ...best, second });
  });

  extensionsByFamily.forEach(rows => {
    rows.sort((a, b) => b.relevance - a.relevance || a.id.localeCompare(b.id));
    rows.slice(0, opts.maxExtensionsPerFamily).forEach(row => {
      const bridge = row.second && row.second.relevance >= row.relevance * opts.bridgeThreshold;
      assignments.set(row.id, {
        canonicalId: row.id, type: 'extension', relationClass: 'contextual', relationLabel: relationLabel('contextual'),
        familyId: row.family.id, secondaryFamilyId: bridge ? row.second.family.id : null,
        score: round(row.fit.score), relevance: round(row.relevance), matchedTerms: row.fit.matched,
        synonymTerms: row.fit.synonymMatched, lexicalTerms: row.fit.lexicalMatched,
        cooccurrenceTerms: row.fit.cooccurrenceMatched,
        seedTerm: row.family.seed, seedRelation: 'contextual-propagation',
        evidence: { direct: false, synonym: 0, lexical: 0, cooccurrence: 0, graph: round(row.graph), independent: row.evidenceCount },
      });
    });
  });

  return assignments;
}

function capCanonicalAssignments(assignments, opts) {
  if (assignments.size <= opts.maxIncludedCanonicalDocuments) return assignments;
  const priority = { direct: 5, synonym: 4, lexical: 3, cooccurrence: 2, contextual: 1 };
  const rows = [...assignments.entries()].sort((a, b) =>
    (priority[b[1].relationClass] - priority[a[1].relationClass])
    || b[1].relevance - a[1].relevance || a[0].localeCompare(b[0]));
  const direct = rows.filter(([, row]) => row.relationClass === 'direct');
  const others = rows.filter(([, row]) => row.relationClass !== 'direct');
  const kept = new Map(direct);
  for (const entry of others) {
    if (kept.size >= opts.maxIncludedCanonicalDocuments) break;
    kept.set(entry[0], entry[1]);
  }
  return kept;
}

function expandAssignments(canonicalAssignments, families, model) {
  const assignments = new Map();
  families.forEach(f => {
    f.occurrenceIds.clear(); f.directIds.clear(); f.synonymIds.clear(); f.lexicalIds.clear();
    f.cooccurrenceIds.clear(); f.extensionIds.clear();
  });
  const byFamily = new Map(families.map(f => [f.id, f]));
  canonicalAssignments.forEach((row, canonicalId) => {
    const key = canonicalText(model.canonicalDocs.get(canonicalId).node) || `id:${canonicalId}`;
    const ids = model.canonicalGroups.get(key) || [canonicalId];
    ids.forEach(id => {
      const copy = { ...row, canonicalId, evidence: { ...row.evidence }, matchedTerms: [...row.matchedTerms],
        synonymTerms: [...(row.synonymTerms || [])], lexicalTerms: [...row.lexicalTerms], cooccurrenceTerms: [...row.cooccurrenceTerms] };
      assignments.set(id, copy);
      const family = byFamily.get(copy.familyId);
      if (!family) return;
      if (copy.relationClass === 'direct') { family.directIds.add(id); family.occurrenceIds.add(id); }
      else if (copy.relationClass === 'synonym') { family.synonymIds.add(id); family.occurrenceIds.add(id); }
      else if (copy.relationClass === 'lexical') { family.lexicalIds.add(id); family.occurrenceIds.add(id); }
      else if (copy.relationClass === 'cooccurrence') { family.cooccurrenceIds.add(id); family.occurrenceIds.add(id); }
      else family.extensionIds.add(id);
    });
  });
  return assignments;
}

function pruneFamilies(families, assignments) {
  const kept = families.filter(f => f.occurrenceIds.size + f.extensionIds.size > 0);
  const valid = new Set(kept.map(f => f.id));
  assignments.forEach(row => {
    if (row.familyId && !valid.has(row.familyId)) row.familyId = null;
    if (row.secondaryFamilyId && !valid.has(row.secondaryFamilyId)) row.secondaryFamilyId = null;
  });
  return kept;
}

function canonicalCount(ids, docs) {
  return new Set([...ids].map(id => docs.get(id)?.canonicalId || id)).size;
}

function familyMass(family, docs) {
  return canonicalCount(new Set([...family.occurrenceIds, ...family.extensionIds]), docs);
}

function weightedAngles(families) {
  const weights = families.map(f => Math.max(1.45, Math.sqrt(f.mass)));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = -Math.PI / 2;
  return weights.map(weight => {
    const span = Math.PI * 2 * weight / total;
    const center = cursor + span / 2;
    cursor += span;
    return { center, span };
  });
}

function relationBand(relationClass) {
  if (relationClass === 'direct') return 0;
  if (relationClass === 'synonym') return 0.22;
  if (relationClass === 'lexical') return 0.43;
  if (relationClass === 'cooccurrence') return 0.72;
  return 1;
}

function relationRadialOffset(relationClass, opts) {
  if (relationClass === 'direct') return 0;
  if (relationClass === 'synonym') return opts.constellationRadialBand * 0.22;
  if (relationClass === 'lexical') return opts.constellationRadialBand * 0.46;
  if (relationClass === 'cooccurrence') return opts.constellationRadialBand * 0.74;
  return opts.constellationRadialBand;
}

function normalize3(v) {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

function cross3(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}

function familyDirection(index, count, angle) {
  // Répartition sphérique déterministe, inspirée de la constellation d'origine.
  // L'azimut conserve l'ordre des territoires de la carte ; l'élévation évite
  // toute pile de plans et donne à chaque zone un véritable quartier de ciel.
  const golden = Math.PI * (3 - Math.sqrt(5));
  const z = count <= 1 ? 0 : 1 - 2 * ((index + 0.5) / count);
  const radial = Math.sqrt(Math.max(0, 1 - z*z));
  const azimuth = angle + index * golden * 0.42;
  return normalize3([Math.cos(azimuth) * radial, Math.sin(azimuth) * radial, z]);
}

function familyBasis(direction) {
  const reference = Math.abs(direction[2]) < 0.82 ? [0, 0, 1] : [0, 1, 0];
  const tangentA = normalize3(cross3(reference, direction));
  const tangentB = normalize3(cross3(direction, tangentA));
  return { tangentA, tangentB };
}

function retainedDegreeMap(analysis, opts) {
  const included = new Set(analysis.assignments.keys());
  const degree = new Map([...included].map(id => [id, 0]));
  for (const edge of opts.edges || []) {
    if (!included.has(edge.source) || !included.has(edge.target)) continue;
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  }
  const max = Math.max(1, ...degree.values());
  degree.forEach((value, id) => degree.set(id, value / max));
  return degree;
}

function placeZoneRows(rows, family, analysis, opts, positions2d, positions3d) {
  if (!rows.length) return;
  const spread = opts.zoneSpreadBase + opts.zoneSpreadPerSqrtMass * Math.sqrt(Math.max(1, family.mass));
  const phi = Math.PI * (3 - Math.sqrt(5));
  const directionLength = Math.hypot(family.center2d[0], family.center2d[1]) || 1;
  const ux = family.center2d[0] / directionLength, uy = family.center2d[1] / directionLength;
  const direction3d = normalize3(family.direction3d || family.center3d || [ux, uy, 0]);
  const { tangentA, tangentB } = familyBasis(direction3d);
  const degreeMap = analysis._retainedDegree || new Map();
  const groups = new Map();
  rows.forEach(row => {
    if (!groups.has(row.canonicalId)) groups.set(row.canonicalId, []);
    groups.get(row.canonicalId).push(row);
  });
  const canonicalRows = [...groups.values()].map(copies => copies.sort((a, b) => a.id.localeCompare(b.id)))
    .sort((a, b) => relationBand(a[0].relationClass) - relationBand(b[0].relationClass)
      || b[0].relevance - a[0].relevance || a[0].canonicalId.localeCompare(b[0].canonicalId));

  canonicalRows.forEach((copies, i) => {
    const row = copies[0];
    const band = relationBand(row.relationClass);
    const u = (i + 0.5) / canonicalRows.length;
    const localR = spread * Math.sqrt(u) * (0.50 + 0.32 * band + 0.18 * (1 - row.relevance));
    const localA = i * phi + (hash32(row.canonicalId) % 1000) / 1000 * 0.30;
    const outwardShift = spread * (band - 0.26) * 0.48;
    let x = family.center2d[0] + ux * outwardShift + Math.cos(localA) * localR;
    let y = family.center2d[1] + uy * outwardShift + Math.sin(localA) * localR * 0.72;
    if (row.secondaryFamilyId) {
      const other = analysis.families.find(f => f.id === row.secondaryFamilyId);
      if (other) { x = x * 0.76 + other.center2d[0] * 0.24; y = y * 0.76 + other.center2d[1] * 0.24; }
    }

    // En constellation, la voie de rattachement devient une distance radiale
    // à l'intérieur du lobe, non un étage horizontal. La connexité documentaire
    // resserre les nœuds structurants vers l'axe du lobe ; les nœuds marginaux
    // occupent son enveloppe. La 3D porte donc deux lectures simultanées :
    // éloignement sémantique et intégration dans les relations du tableau.
    const degree = degreeMap.get(row.canonicalId) || 0;
    const radial = family.radius3d + relationRadialOffset(row.relationClass, opts)
      + opts.constellationRadialBand * 0.18 * (1 - row.relevance);
    const lobeSpread = opts.constellationLobeSpread
      + 0.70 * spread * (0.45 + 0.55 * (1 - degree));
    const theta = localA + (hash32(row.canonicalId + ':orbit') % 1000) / 1000 * 0.85;
    const shell = lobeSpread * Math.sqrt(u) * (0.48 + 0.52 * (1 - degree));
    let p3 = [
      direction3d[0] * radial + tangentA[0] * Math.cos(theta) * shell + tangentB[0] * Math.sin(theta) * shell,
      direction3d[1] * radial + tangentA[1] * Math.cos(theta) * shell + tangentB[1] * Math.sin(theta) * shell,
      direction3d[2] * radial + tangentA[2] * Math.cos(theta) * shell + tangentB[2] * Math.sin(theta) * shell,
    ];
    if (row.secondaryFamilyId) {
      const other = analysis.families.find(f => f.id === row.secondaryFamilyId);
      if (other?.center3d) p3 = p3.map((v, axis) => v * 0.80 + other.center3d[axis] * 0.20);
    }

    const copyRadius = Math.min(5.2, 1.5 + 0.72 * Math.sqrt(copies.length));
    copies.forEach((copy, copyIndex) => {
      const a = copyIndex * phi;
      const r = copyIndex ? copyRadius * Math.sqrt(copyIndex / Math.max(1, copies.length - 1)) : 0;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      const cp3 = [
        p3[0] + tangentA[0] * Math.cos(a) * r + tangentB[0] * Math.sin(a) * r,
        p3[1] + tangentA[1] * Math.cos(a) * r + tangentB[1] * Math.sin(a) * r,
        p3[2] + tangentA[2] * Math.cos(a) * r + tangentB[2] * Math.sin(a) * r,
      ];
      positions2d.set(copy.id, [round(px, 3), round(py, 3), 0]);
      positions3d.set(copy.id, cp3.map(v => round(v, 3)));
      const assignment = analysis.assignments.get(copy.id);
      if (assignment) {
        assignment.semanticRadius = round(radial, 3);
        assignment.graphIntegration = round(degree, 3);
      }
    });
  });
}

export function buildResonanceLayout(allNodes, analysis, options = {}) {
  const opts = { ...RESONANCE_DEFAULTS, ...options };
  const positions2d = new Map(), positions3d = new Map();
  analysis.families.forEach(f => {
    f.mass = familyMass(f, analysis._docs);
    const directMatches = analysis.occurrenceIds.filter(id => {
      const doc = analysis._docs.get(id);
      return doc && docHasUnit(doc, f.seed);
    });
    f.directSupport = directMatches.length;
    f.effectiveDirectSupport = new Set(directMatches.map(id => analysis._docs.get(id)?.canonicalId || id)).size;
    f.synonymSupport = canonicalCount(f.synonymIds, analysis._docs);
    f.lexicalSupport = canonicalCount(f.lexicalIds, analysis._docs);
    f.cooccurrenceSupport = canonicalCount(f.cooccurrenceIds, analysis._docs);
  });

  const maxDirect = Math.max(1, ...analysis.families.map(f => f.effectiveDirectSupport));
  const maxSynonym = Math.max(1, ...analysis.families.map(f => f.synonymSupport));
  const maxLexical = Math.max(1, ...analysis.families.map(f => f.lexicalSupport));
  const maxCooccurrence = Math.max(1, ...analysis.families.map(f => f.cooccurrenceSupport));
  const maxStrength = Math.max(1e-9, ...analysis.families.map(f => f.strength));
  analysis.families.forEach(f => {
    const seedNear = f.seedRelationClass === 'synonym' ? f.seedWeight
      : f.seedRelationClass === 'lexical' ? 0.82 * f.seedWeight
        : f.seedRelationClass === 'cooccurrence' ? 0.55 * f.seedWeight : 1;
    f.affinity = round(clamp(
      0.48 * (f.effectiveDirectSupport / maxDirect)
      + 0.18 * (f.synonymSupport / maxSynonym)
      + 0.13 * (f.lexicalSupport / maxLexical)
      + 0.12 * (f.cooccurrenceSupport / maxCooccurrence)
      + 0.06 * seedNear
      + 0.03 * (f.strength / maxStrength), 0, 1));
  });
  analysis.families.sort((a, b) => b.affinity - a.affinity || b.mass - a.mass || a.label.localeCompare(b.label, 'fr'));
  const angles = weightedAngles(analysis.families);
  analysis.families.forEach((family, i) => {
    const distance = opts.familyRadiusFar - (opts.familyRadiusFar - opts.familyRadiusNear) * family.affinity;
    const angle = angles[i].center;
    family.center2d = [round(Math.cos(angle) * distance, 3), round(Math.sin(angle) * distance, 3), 0];
    family.direction3d = familyDirection(i, analysis.families.length, angle);
    family.radius3d = distance;
    family.center3d = family.direction3d.map(v => round(v * distance, 3));
  });
  analysis._retainedDegree = retainedDegreeMap(analysis, opts);

  const byFamily = new Map(analysis.families.map(f => [f.id, []]));
  analysis.assignments.forEach((row, id) => {
    if (row.familyId && byFamily.has(row.familyId)) byFamily.get(row.familyId).push({ id, ...row });
  });
  analysis.families.forEach(family => placeZoneRows(byFamily.get(family.id), family, analysis, opts, positions2d, positions3d));

  // Documents retenus sans zone stable : noyau neutre, ordonné par voie
  // de rattachement. Ils restent visibles, mais ne fabriquent pas une famille
  // artificielle.
  const unassigned = [...analysis.assignments].filter(([id]) => !positions2d.has(id));
  unassigned.sort((a, b) => relationBand(a[1].relationClass) - relationBand(b[1].relationClass)
    || b[1].relevance - a[1].relevance || a[0].localeCompare(b[0]));
  unassigned.forEach(([id, row], i) => {
    const a = i * Math.PI * (3 - Math.sqrt(5));
    const band = relationBand(row.relationClass);
    const r = 16 + 20 * band + 3.5 * Math.sqrt(i + 1);
    const sphereZ = 1 - 2 * ((i + 0.5) / Math.max(1, unassigned.length));
    const sphereR = Math.sqrt(Math.max(0, 1 - sphereZ*sphereZ));
    const radial = 26 + relationRadialOffset(row.relationClass, opts) + 5 * Math.sqrt(i + 1);
    positions2d.set(id, [round(Math.cos(a) * r, 3), round(Math.sin(a) * r, 3), 0]);
    positions3d.set(id, [round(Math.cos(a) * sphereR * radial, 3), round(Math.sin(a) * sphereR * radial, 3), round(sphereZ * radial, 3)]);
    row.semanticRadius = round(radial, 3);
    row.graphIntegration = 0;
  });

  const included = new Set(analysis.assignments.keys());
  const outsideIds = allNodes.filter(n => n.kind !== 'section' && !included.has(n.id)).map(n => n.id).sort();
  outsideIds.forEach(id => { positions2d.set(id, [0, 0, 0]); positions3d.set(id, [0, 0, 0]); });
  allNodes.filter(n => n.kind === 'section').forEach(n => { positions2d.set(n.id, [0, 0, 0]); positions3d.set(n.id, [0, 0, 0]); });

  return {
    positions2d, positions3d, peripheralCount: outsideIds.length, outsideIds,
    familyCenters2d: new Map(analysis.families.map(f => [f.id, f.center2d])),
    familyCenters3d: new Map(analysis.families.map(f => [f.id, f.center3d])),
    depthAxis: null,
    constellationMeaning: {
      radial: 'distance au centre = éloignement sémantique et voie de rattachement',
      lobe: 'chaque zone 2D devient un quartier de ciel volumique',
      integration: 'proximité de l’axe du lobe = intégration dans les relations documentaires retenues',
    },
  };
}

export function analyzeResonance(nodes, query, options = {}) {
  const opts = { ...RESONANCE_DEFAULTS, ...options };
  const raw = String(query || '').trim();
  if (!raw || /[\s"|]/.test(raw) || raw.startsWith('-')) return { ok: false, reason: 'single-term-required', query: raw };
  const focal = morphologyKey(raw);
  if (!focal) return { ok: false, reason: 'single-term-required', query: raw };

  const model = buildCorpusModel(nodes, opts);
  const directCanonical = docsForUnit(focal, model);
  if (!directCanonical.size) return { ok: false, reason: 'absent', query: raw, focal, occurrenceCount: 0 };

  const lexicalSeeds = induceLexicalSeeds(focal, model, opts);
  const cooccurrenceTerms = pickCooccurrenceTerms(focal, directCanonical, lexicalSeeds, model, opts);
  const fieldTerms = [...lexicalSeeds, ...cooccurrenceTerms];
  const anchorCanonical = new Set(directCanonical);
  lexicalSeeds.filter(s => (s.relationClass === 'synonym' || s.relationClass === 'lexical')
    && s.weight >= opts.minLexicalDocumentWeight).forEach(s => s.docs.forEach(id => anchorCanonical.add(id)));
  cooccurrenceTerms.forEach(t => t.docs.forEach(id => anchorCanonical.add(id)));

  let families = buildFamilies(fieldTerms, anchorCanonical.size, model, opts);
  let canonicalAssignments = assignCanonicalDocuments(model, focal, directCanonical, lexicalSeeds, cooccurrenceTerms, families, opts);
  canonicalAssignments = capCanonicalAssignments(canonicalAssignments, opts);
  let assignments = expandAssignments(canonicalAssignments, families, model);
  families = pruneFamilies(families, assignments);
  // Une famille supprimée peut laisser un rattachement nul ; cela ne supprime
  // jamais le document direct, seulement sa prétendue sous-catégorie.

  const occurrenceIds = model.corpus.filter(n => directCanonical.has(model.canonicalOf.get(n.id))).map(n => n.id).sort();
  const anchorIds = [...assignments].filter(([, row]) => row.relationClass !== 'contextual').map(([id]) => id).sort();
  const directCount = [...assignments.values()].filter(a => a.relationClass === 'direct').length;
  const synonymCount = [...assignments.values()].filter(a => a.relationClass === 'synonym').length;
  const lexicalCount = [...assignments.values()].filter(a => a.relationClass === 'lexical').length;
  const cooccurrenceCount = [...assignments.values()].filter(a => a.relationClass === 'cooccurrence').length;
  const extensionCount = [...assignments.values()].filter(a => a.relationClass === 'contextual').length;
  const effectiveDirectCount = directCanonical.size;
  const effectiveSynonymCount = [...canonicalAssignments.values()].filter(a => a.relationClass === 'synonym').length;
  const effectiveLexicalCount = [...canonicalAssignments.values()].filter(a => a.relationClass === 'lexical').length;
  const effectiveCooccurrenceCount = [...canonicalAssignments.values()].filter(a => a.relationClass === 'cooccurrence').length;
  const effectiveExtensionCount = [...canonicalAssignments.values()].filter(a => a.relationClass === 'contextual').length;
  const confidence = effectiveDirectCount === 1 ? 'exploratory' : effectiveDirectCount < 4 ? 'developing' : 'supported';

  const analysis = {
    ok: true, query: raw, focal,
    occurrenceCount: occurrenceIds.length, effectiveOccurrenceCount: effectiveDirectCount,
    directCount, synonymCount, lexicalCount, cooccurrenceCount, extensionCount,
    equivalentCount: synonymCount, associatedCount: lexicalCount + cooccurrenceCount,
    effectiveSynonymCount, effectiveLexicalCount, effectiveCooccurrenceCount, effectiveExtensionCount,
    anchorCount: anchorIds.length, effectiveAnchorCount: canonicalAssignments.size - effectiveExtensionCount,
    occurrenceIds, anchorIds, seeds: lexicalSeeds, cooccurrenceTerms,
    confidence, families, assignments, corpusSize: model.corpus.length,
    effectiveCorpusSize: model.N, excludedCount: model.corpus.length - assignments.size,
    method: {
      model: 'corpus-semantic-field-v4.1', morphology: 'conservative-rules',
      controlledLexiconVersion: SEMANTIC_LEXICON_VERSION,
      corpusDistributionalSimilarity: true, corpusCooccurrence: true,
      recurringPhrases: true, canonicalDuplicates: true, outsideZoneHidden: true,
      relationClasses: ['direct', 'synonym', 'lexical', 'cooccurrence', 'contextual'],
      depthAxis: 'relation-evidence', maxFamilies: opts.maxFamilies,
      minIndependentEvidence: opts.minIndependentEvidence,
    },
    _docs: model.docs,
    _directCanonical: directCanonical,
  };
  analysis.layout = buildResonanceLayout(nodes, analysis, opts);
  return analysis;
}

export function serializableResonance(analysis) {
  if (!analysis?.ok) return analysis;
  return {
    ok: true, query: analysis.query, focal: analysis.focal,
    occurrenceCount: analysis.occurrenceCount, effectiveOccurrenceCount: analysis.effectiveOccurrenceCount,
    directCount: analysis.directCount, synonymCount: analysis.synonymCount, lexicalCount: analysis.lexicalCount,
    cooccurrenceCount: analysis.cooccurrenceCount, extensionCount: analysis.extensionCount,
    effectiveSynonymCount: analysis.effectiveSynonymCount, effectiveLexicalCount: analysis.effectiveLexicalCount,
    effectiveCooccurrenceCount: analysis.effectiveCooccurrenceCount,
    effectiveExtensionCount: analysis.effectiveExtensionCount,
    anchorCount: analysis.anchorCount, effectiveAnchorCount: analysis.effectiveAnchorCount,
    occurrenceIds: analysis.occurrenceIds, anchorIds: analysis.anchorIds,
    seeds: analysis.seeds.map(s => ({ term: s.term, relation: s.relation, relationClass: s.relationClass,
      weight: round(s.weight), zone: s.zone, source: s.source, evidenceLabel: s.evidenceLabel, docs: [...s.docs].sort() })),
    cooccurrenceTerms: analysis.cooccurrenceTerms.map(t => ({ term: t.term, score: round(t.score), local: t.local,
      directLocal: t.directLocal, df: t.df, lift: round(t.lift), coverage: round(t.coverage), docs: [...t.docs].sort() })),
    confidence: analysis.confidence, corpusSize: analysis.corpusSize,
    effectiveCorpusSize: analysis.effectiveCorpusSize, excludedCount: analysis.excludedCount,
    method: analysis.method,
    families: analysis.families.map(f => ({
      id: f.id, label: f.label, affinity: f.affinity, mass: f.mass,
      directSupport: f.directSupport, effectiveDirectSupport: f.effectiveDirectSupport, synonymSupport: f.synonymSupport,
      lexicalSupport: f.lexicalSupport, cooccurrenceSupport: f.cooccurrenceSupport,
      center2d: f.center2d, center3d: f.center3d,
      terms: f.terms.map(t => ({ term: t.term, relationClass: t.relationClass,
        relation: t.relation, weight: round(t.weight ?? t.score ?? 0), docs: t.docs.size })),
      occurrenceIds: [...f.occurrenceIds], directIds: [...f.directIds], synonymIds: [...f.synonymIds],
      lexicalIds: [...f.lexicalIds], cooccurrenceIds: [...f.cooccurrenceIds], extensionIds: [...f.extensionIds],
    })),
    assignments: [...analysis.assignments].map(([id, a]) => ({ id, ...a })),
    layout: {
      peripheralCount: analysis.layout.peripheralCount,
      depthAxis: analysis.layout.depthAxis,
      positions2d: Object.fromEntries(analysis.layout.positions2d),
      positions3d: Object.fromEntries(analysis.layout.positions3d),
    },
  };
}
