/**
 * Routage orbital 3D, déterministe et collectif.
 *
 * Une première passe donne à chaque lien une courbe orientée vers l'extérieur.
 * Une relaxation commune sépare ensuite les courbes trop proches. Les nœuds
 * restent strictement fixes et la relaxation demeure attachée à l'orbite
 * initiale : elle aère le réseau sans inventer une nouvelle géographie.
 */

export const ORBIT = Object.freeze({
  baseBend: 0.15,
  coreBend: 0.27,
  coreSpan: 0.60,
  corePadding: 7,
  maxLift: 38,
  maxTwist: 0.78,
  lanes: 11,
  repulsionIterations: 20,
  repulsionRadiusRatio: 0.48,
  repulsionRadiusMin: 3.4,
  repulsionRadiusMax: 8,
  repulsionStrength: 0.56,
  repulsionTether: 0.045,
  repulsionMaxStep: 0.78,
  repulsionMaxShift: 12,
  repulsionRelativeShift: 0.75,
  repulsionPadding: 1.5,
  samples: Object.freeze([0.18, 0.34, 0.50, 0.66, 0.82]),
});

function hash32(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const clamp01 = x => clamp(x, 0, 1);
const xyz = (p, axis) => Array.isArray(p) || ArrayBuffer.isView(p)
  ? p[axis]
  : p[axis === 0 ? 'x' : axis === 1 ? 'y' : 'z'];

/** La route est indépendante du sens éditorial éventuel de la flèche. */
export function makeOrbitRoute(sourceId, targetId) {
  const forward = sourceId <= targetId;
  const key = forward ? `${sourceId}\u0000${targetId}` : `${targetId}\u0000${sourceId}`;
  const hash = hash32(key);
  const half = Math.floor(ORBIT.lanes / 2);
  const lane = (hash % ORBIT.lanes) - half;
  const laneUnit = lane / half;
  const liftScale = 0.88 + ((hash >>> 8) % 25) / 100;
  // Le signe compense le retournement de la corde : stocker la même arête dans
  // l'autre sens produit exactement la même courbe géométrique.
  const twist = laneUnit * ORBIT.maxTwist * (forward ? 1 : -1);
  return Object.freeze({
    kind: 'orbit', hash, twist,
    cosTwist: Math.cos(twist), sinTwist: Math.sin(twist), liftScale,
  });
}

/**
 * Déport au milieu de l'orbite initiale. Il est toujours perpendiculaire à la
 * corde. Les routes relaxées portent déjà leur déport final et passent par le
 * chemin court en tête de fonction.
 */
export function orbitOffset(a, b, route, out = [0, 0, 0]) {
  if (route && Number.isFinite(route.offsetX)) {
    out[0] = route.offsetX; out[1] = route.offsetY; out[2] = route.offsetZ;
    return out;
  }

  const ax = xyz(a, 0), ay = xyz(a, 1), az = xyz(a, 2);
  const bx = xyz(b, 0), by = xyz(b, 1), bz = xyz(b, 2);
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len2 = dx*dx + dy*dy + dz*dz;
  const len = Math.sqrt(len2);
  if (!route || route.kind !== 'orbit' || len < 1e-9) {
    out[0] = 0; out[1] = 0; out[2] = 0;
    return out;
  }

  const ux = dx/len, uy = dy/len, uz = dz/len;
  const mx = (ax+bx)/2, my = (ay+by)/2, mz = (az+bz)/2;
  // Direction radiale rendue perpendiculaire à la corde : le déport écarte
  // le lien du cœur sans le faire glisser le long de lui-même.
  const along = mx*ux + my*uy + mz*uz;
  let ox = mx - along*ux, oy = my - along*uy, oz = mz - along*uz;
  let on = Math.hypot(ox, oy, oz);
  if (on < 1e-7) {
    // Corde presque diamétrale : un axe tiré du hash tranche de manière stable.
    const pick = route.hash % 3;
    let rx = pick === 0 ? 1 : 0, ry = pick === 1 ? 1 : 0, rz = pick === 2 ? 1 : 0;
    if (Math.abs(rx*ux + ry*uy + rz*uz) > 0.9) {
      rx = 0; ry = pick === 2 ? 1 : 0; rz = pick === 2 ? 0 : 1;
    }
    ox = uy*rz - uz*ry; oy = uz*rx - ux*rz; oz = ux*ry - uy*rx;
    on = Math.hypot(ox, oy, oz);
  }
  ox /= on; oy /= on; oz /= on;

  // Second axe du plan perpendiculaire à la corde, puis rotation par voie.
  const qx = uy*oz - uz*oy, qy = uz*ox - ux*oz, qz = ux*oy - uy*ox;
  const c = route.cosTwist, s = route.sinTwist;
  const nx = ox*c + qx*s, ny = oy*c + qy*s, nz = oz*c + qz*s;

  const closestT = clamp01(-(ax*dx + ay*dy + az*dz) / len2);
  const cx = ax + dx*closestT, cy = ay + dy*closestT, cz = az + dz*closestT;
  const coreDistance = Math.hypot(cx, cy, cz);
  const core = 1 - clamp01(coreDistance / (ORBIT.coreSpan*len + ORBIT.corePadding));
  const lift = Math.min(ORBIT.maxLift, len * (ORBIT.baseBend + ORBIT.coreBend*core)) * route.liftScale;
  out[0] = nx*lift; out[1] = ny*lift; out[2] = nz*lift;
  return out;
}

function positionGetter(positions) {
  if (typeof positions === 'function') return positions;
  if (positions instanceof Map) return id => positions.get(id);
  return id => positions[id];
}

function edgeKey(edge) {
  const a = String(edge.source), b = String(edge.target);
  const pair = a <= b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
  // Le type distingue notamment la rare paire portant un connecteur ET un lien
  // conceptuel. Aucun index de tableau : réordonner le JSON ne change rien.
  return `${pair}\u0000${edge.type || ''}\u0000${edge.id || ''}`;
}

function fallbackDirection(keyA, keyB, sampleA, sampleB) {
  const forward = keyA <= keyB;
  const key = forward
    ? `${keyA}\u0001${sampleA}\u0001${keyB}\u0001${sampleB}`
    : `${keyB}\u0001${sampleB}\u0001${keyA}\u0001${sampleA}`;
  const h = hash32(key);
  const z = (((h & 0xffff) / 0xffff) * 2) - 1;
  const a = ((h >>> 16) / 0xffff) * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z*z));
  const sign = forward ? 1 : -1;
  return [Math.cos(a)*r*sign, Math.sin(a)*r*sign, z*sign];
}

// Les dispositions de ce projet restent très loin de ±512 cellules. Empaqueter
// les trois coordonnées dans un Number évite des millions de chaînes temporaires
// pendant la relaxation. Le repli texte garde le routeur valable au-delà.
function cellKey(x,y,z) {
  if (x>=-512 && x<512 && y>=-512 && y<512 && z>=-512 && z<512) {
    return (x+512)*1048576+(y+512)*1024+(z+512);
  }
  return `${x},${y},${z}`;
}

/**
 * Calcule les orbites d'un graphe entier, dans le même ordre que `edges`.
 *
 * La répulsion se fait sur cinq échantillons intérieurs par courbe, au moyen
 * d'une grille spatiale. Elle voit donc tous les liens, mais son coût reste
 * proche de O(E). Le déport obtenu est projeté perpendiculairement à sa corde,
 * rappelé vers l'orbite initiale et plafonné : les extrémités et la géographie
 * des nœuds ne peuvent jamais dériver.
 */
export function relaxOrbitRoutes(edges, positions, options = {}) {
  const getPosition = positionGetter(positions);
  const records = [];
  const result = new Array(edges.length).fill(null);

  edges.forEach((edge, index) => {
    const a = getPosition(edge.source), b = getPosition(edge.target);
    if (!a || !b) return;
    const ax=xyz(a,0), ay=xyz(a,1), az=xyz(a,2);
    const bx=xyz(b,0), by=xyz(b,1), bz=xyz(b,2);
    const dx=bx-ax, dy=by-ay, dz=bz-az;
    const len=Math.hypot(dx,dy,dz);
    const route=makeOrbitRoute(String(edge.source), String(edge.target));
    if (len < 1e-9) { result[index]=route; return; }
    const base=orbitOffset(a,b,route,[0,0,0]);
    records.push({
      edge, index, key: edgeKey(edge), route,
      ax,ay,az,bx,by,bz, ux:dx/len,uy:dy/len,uz:dz/len,len,
      bx0:base[0],by0:base[1],bz0:base[2], ox:base[0],oy:base[1],oz:base[2],
      fx:0,fy:0,fz:0,
    });
  });
  records.sort((a,b) => a.key.localeCompare(b.key));
  if (!records.length) return result;

  const lengths=records.map(r=>r.len).sort((a,b)=>a-b);
  const median=lengths[Math.floor(lengths.length/2)];
  const radius=options.radius ?? clamp(
    median*ORBIT.repulsionRadiusRatio,
    ORBIT.repulsionRadiusMin,
    ORBIT.repulsionRadiusMax,
  );
  const iterations=options.iterations ?? ORBIT.repulsionIterations;
  const strength=options.strength ?? ORBIT.repulsionStrength;
  const tether=options.tether ?? ORBIT.repulsionTether;
  const maxStep=options.maxStep ?? Math.min(ORBIT.repulsionMaxStep, radius*0.24);
  const radius2=radius*radius;
  const samples=options.samples || ORBIT.samples;

  for (let iteration=0; iteration<iterations; iteration++) {
    const points=[];
    const grid=new Map();
    for (let ri=0;ri<records.length;ri++) {
      const r=records[ri];
      r.fx=r.fy=r.fz=0;
      for (let si=0;si<samples.length;si++) {
        const t=samples[si], bell=4*t*(1-t);
        const p={
          ri,si,bell,
          x:r.ax+(r.bx-r.ax)*t+r.ox*bell,
          y:r.ay+(r.by-r.ay)*t+r.oy*bell,
          z:r.az+(r.bz-r.az)*t+r.oz*bell,
        };
        const pi=points.push(p)-1;
        const gx=Math.floor(p.x/radius), gy=Math.floor(p.y/radius), gz=Math.floor(p.z/radius);
        p.gx=gx; p.gy=gy; p.gz=gz;
        const cell=cellKey(gx,gy,gz);
        let bucket=grid.get(cell);
        if (!bucket) grid.set(cell,bucket=[]);
        bucket.push(pi);
      }
    }

    for (let i=0;i<points.length;i++) {
      const p=points[i], a=records[p.ri];
      for (let gx=p.gx-1;gx<=p.gx+1;gx++) for (let gy=p.gy-1;gy<=p.gy+1;gy++) for (let gz=p.gz-1;gz<=p.gz+1;gz++) {
        const bucket=grid.get(cellKey(gx,gy,gz));
        if (!bucket) continue;
        for (const j of bucket) {
          if (j<=i) continue;
          const q=points[j];
          if (q.ri===p.ri) continue;
          const b=records[q.ri];
          let dx=p.x-q.x, dy=p.y-q.y, dz=p.z-q.z;
          const d2=dx*dx+dy*dy+dz*dz;
          if (d2>=radius2) continue;
          let d=Math.sqrt(d2);
          if (d<1e-8) {
            [dx,dy,dz]=fallbackDirection(a.key,b.key,p.si,q.si);
            d=1;
          } else { dx/=d; dy/=d; dz/=d; }
          const penetration=1-Math.sqrt(d2)/radius;
          const force=strength*penetration*penetration;
          a.fx+=dx*force*p.bell; a.fy+=dy*force*p.bell; a.fz+=dz*force*p.bell;
          b.fx-=dx*force*q.bell; b.fy-=dy*force*q.bell; b.fz-=dz*force*q.bell;
        }
      }
    }

    const cooling=1-0.35*(iteration/Math.max(1,iterations-1));
    for (const r of records) {
      // Rappel élastique à l'orbite individuelle : la répulsion ne crée jamais
      // une géographie autonome des liens.
      let dx=(r.fx-(r.ox-r.bx0)*tether)*cooling;
      let dy=(r.fy-(r.oy-r.by0)*tether)*cooling;
      let dz=(r.fz-(r.oz-r.bz0)*tether)*cooling;
      // Aucun glissement le long de la corde.
      const along=dx*r.ux+dy*r.uy+dz*r.uz;
      dx-=along*r.ux; dy-=along*r.uy; dz-=along*r.uz;
      const dn=Math.hypot(dx,dy,dz);
      if (dn>maxStep) { const s=maxStep/dn; dx*=s;dy*=s;dz*=s; }
      r.ox+=dx; r.oy+=dy; r.oz+=dz;

      // Plafond de déformation relatif à la longueur, lui-même borné.
      let sx=r.ox-r.bx0, sy=r.oy-r.by0, sz=r.oz-r.bz0;
      const sn=Math.hypot(sx,sy,sz);
      const maxShift=Math.min(
        ORBIT.repulsionMaxShift,
        r.len*ORBIT.repulsionRelativeShift+ORBIT.repulsionPadding,
      );
      if (sn>maxShift) {
        const s=maxShift/sn;
        r.ox=r.bx0+sx*s; r.oy=r.by0+sy*s; r.oz=r.bz0+sz*s;
      }
    }
  }

  for (const r of records) {
    result[r.index]=Object.freeze({
      ...r.route,
      offsetX:r.ox, offsetY:r.oy, offsetZ:r.oz,
      repelled:true, repulsionRadius:radius,
    });
  }
  return result;
}

/**
 * Point de la courbe orbitale au paramètre t∈[0,1]. `out` peut être un objet
 * {x,y,z} ou un tableau, afin que le rendu réutilise ses objets de travail.
 */
export function orbitPoint(a, b, route, t, out = [0, 0, 0]) {
  const ax=xyz(a,0), ay=xyz(a,1), az=xyz(a,2);
  const bx=xyz(b,0), by=xyz(b,1), bz=xyz(b,2);
  let x=ax+(bx-ax)*t, y=ay+(by-ay)*t, z=az+(bz-az)*t;

  if (route?.kind==='orbit' && t>0 && t<1) {
    const offset=orbitOffset(a,b,route,[0,0,0]);
    const bell=4*t*(1-t);
    x+=offset[0]*bell; y+=offset[1]*bell; z+=offset[2]*bell;
  }

  if (Array.isArray(out) || ArrayBuffer.isView(out)) { out[0]=x;out[1]=y;out[2]=z; }
  else { out.x=x;out.y=y;out.z=z; }
  return out;
}
