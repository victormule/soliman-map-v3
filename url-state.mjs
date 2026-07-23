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
    else if (k === 'qp' && v === '1') out.searchPinned = true;
    else if (k.startsWith('hide.')) {
      const values = [];
      let invalid = false;
      v.split(',').filter(Boolean).forEach(part => {
        const decoded = safeDecode(part, k, warn);
        if (decoded === null) invalid = true;
        else values.push(decoded);
      });
      // Une liste entièrement corrompue ne doit pas effacer un filtre valide.
      if (!invalid || values.length) (out.hide || (out.hide = {}))[k.slice(5)] = values;
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
      const paths = [];
      v.split(';').filter(Boolean).forEach(seg => {
        const i = seg.indexOf(':');
        if (i <= 0) return;
        const origin = safeDecode(seg.slice(0, i), 'path.origin', warn);
        if (origin === null) return;
        const targets = [];
        seg.slice(i + 1).split(',').filter(Boolean).forEach(part => {
          const decoded = safeDecode(part, 'path.target', warn);
          if (decoded !== null) targets.push(decoded);
        });
        if (targets.length) paths.push({ origin, targets });
      });
      if (paths.length) out.path = paths;
    }
  });

  return Object.keys(out).length ? out : null;
}
