/**
 * Décode un fragment d'URL partagé sans jamais laisser une valeur malformée
 * interrompre le chargement de l'application. Un champ invalide est ignoré ;
 * les autres champs du même lien restent utilisables.
 */
function safeDecode(value, field, warn) {
  try {
    return decodeURIComponent(value);
  } catch {
    warn(`[état d’URL] valeur « ${field} » mal encodée, ignorée.`);
    return null;
  }
}

export function parseStateHash(hash, onWarning = message => console.warn(message)) {
  const warn = typeof onWarning === 'function' ? onWarning : () => {};
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return null;

  const out = {};
  raw.split('&').forEach(pair => {
    const eq = pair.indexOf('=');
    if (eq < 0) return;
    const k = pair.slice(0, eq), v = pair.slice(eq + 1);

    if (k === 'n') {
      const decoded = safeDecode(v, 'n', warn);
      if (decoded !== null) out.n = decoded;
    } else if (k === 'm') out.m = v;
    else if (k === 'co') out.co = v;
    // Compatibilité avec l'ancien essai Spectral, remplacé par Orbite.
    else if (k === 'cv') out.cv = v;
    else if (k === 'tr') out.tr = v;
    else if (k === 'sc') out.sc = v;
    else if (k === 'ax') out.ax = v;
    else if (k === 'lb' && (v === '0' || v === '1')) out.labels = v !== '0';
    else if (k === 'lbs' && /^\d{1,3}$/.test(v)) out.labelScale = Math.min(100, parseInt(v, 10));
    else if (k === 'qp' && v === '1') out.searchPinned = true;
    else if (k.startsWith('hide.') || k.startsWith('pin.')) {
      const values = [];
      let invalid = false;
      v.split(',').filter(Boolean).forEach(part => {
        const decoded = safeDecode(part, k, warn);
        if (decoded === null) invalid = true;
        else values.push(decoded);
      });
      // Une liste entièrement corrompue ne doit pas effacer un filtre valide.
      const field = k.startsWith('hide.') ? 'hide' : 'pin';
      const axis = k.slice(field.length + 1);
      if (!invalid || values.length) (out[field] || (out[field] = {}))[axis] = values;
    } else if (k === 'focus') {
      const i = v.indexOf(':');
      if (i > 0) {
        const decoded = safeDecode(v.slice(i + 1), 'focus', warn);
        if (decoded !== null) out.focus = { axis: v.slice(0, i), key: decoded };
      }
    } else if (k === 'q') {
      const decoded = safeDecode(v, 'q', warn);
      if (decoded !== null) out.q = decoded;
    } else if (k === 'lex') {
      const decoded = safeDecode(v, 'lex', warn);
      if (decoded !== null) out.lex = decoded;
    } else if (k === 'ego') {
      const i = v.indexOf(':');
      if (i > 0) {
        const decoded = safeDecode(v.slice(0, i), 'ego', warn);
        if (decoded !== null) out.ego = { id: decoded, depth: parseInt(v.slice(i + 1), 10) };
      }
    } else if (k === 'path') {
      // ⚠ Le séparateur d'étapes « > » fait partie des caractères que les
      // navigateurs RÉÉCRIVENT en %3E dans un fragment (jeu d'échappement des
      // fragments de l'URL Standard) : l'adresse partagée ne contient donc
      // jamais le « > » qu'on a écrit, et un lien « passant par… » revenait
      // amputé de ses étapes. On rétablit le séparateur AVANT tout découpage —
      // les identifiants, numériques, ne peuvent pas contenir ce motif.
      const paths = [];
      v.replace(/%3e/gi, '>').split(';').filter(Boolean).forEach(seg => {
        const i = seg.indexOf(':');
        if (i <= 0) return;
        const origin = safeDecode(seg.slice(0, i), 'path.origin', warn);
        if (origin === null) return;
        const branches = [];
        seg.slice(i + 1).split(',').filter(Boolean).forEach(part => {
          // Une branche = étape>…>arrivée ~ couleur ! variante. « ~c » et « !v »
          // sont optionnels (anciens liens sans eux : c = null, v = 0, couleur
          // réattribuée dans l'ordre du rejeu). On détache d'abord « !v » puis
          // « ~c » (seulement si ce qui suit est un entier), le reste étant la
          // suite d'étapes séparées par « > ».
          let body = part, c = null, vNum = 0;
          const bang = body.lastIndexOf('!');
          if (bang > 0 && /^\d+$/.test(body.slice(bang + 1))) { vNum = parseInt(body.slice(bang + 1), 10); body = body.slice(0, bang); }
          const tilde = body.lastIndexOf('~');
          if (tilde > 0 && /^\d+$/.test(body.slice(tilde + 1))) { c = parseInt(body.slice(tilde + 1), 10); body = body.slice(0, tilde); }
          const stops = [];
          body.split('>').filter(Boolean).forEach(sp => {
            const d = safeDecode(sp, 'path.stop', warn);
            if (d !== null) stops.push(d);
          });
          if (stops.length) branches.push({ stops, c, v: vNum });
        });
        if (branches.length) paths.push({ origin, branches });
      });
      if (paths.length) out.path = paths;
    }
  });

  return Object.keys(out).length ? out : null;
}
