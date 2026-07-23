# Le Corps de Soliman al‑Halabi — cartographie interactive

Cartographie interactive d'une carte mentale sur les **restes humains en contexte muséal**,
à partir du cas de Soliman al‑Halabi.

🔗 **En ligne : [soliman-map.netlify.app](https://soliman-map.netlify.app/)**

Le site rejoue une carte mentale (exportée de Miro) sous deux dispositions — une
**cartographie** à plat et une **constellation** en volume — et laisse la parcourir
selon plusieurs axes de lecture (sections, regards, sous‑thèmes, temps, formes,
place dans le raisonnement), avec recherche plein texte, recentrage autour d'un
nœud, tracé de chemins et analyse du champ lexical du corpus.

---

## Lancer en local

Les modules ES interdisent le protocole `file://` : **un serveur statique est
nécessaire**, même en local (ouvrir `index.html` directement ne fonctionne pas).

```bash
npm run serve      # sert le dossier sur http://localhost:3000 (via npx serve)
```

N'importe quel serveur statique convient : `python -m http.server`,
l'extension « Live Server » de VS Code, etc.

Prérequis : **Node ≥ 18** (uniquement pour les scripts ; le site lui‑même
n'exécute que du navigateur).

---

## Reconstruire les données

`graph.json` est un **produit**, jamais une source : il est régénéré intégralement
depuis l'export Miro brut par `build-graph.mjs`. Toutes les règles de dérivation
(sections, regards, couleurs, routage des liens…) vivent dans ce fichier, en clair.

```bash
npm run build      # export_miro.json  ->  graph.json
```

> `export_miro.json` (la source Miro, ~3 Mo) est **gitignoré** : il reste local et
> n'est ni versionné ni déployé. Pour régénérer les données, le déposer à la racine
> puis lancer la commande ci‑dessus. `graph.json`, lui, est versionné : c'est ce que
> le navigateur charge.

---

## Structure du dépôt

```
index.html            L'application entière : structure, styles, et le script module.
graph.json            Données de la carte (produit du build). Chargé au démarrage.
favicon.svg           Icône d'onglet (motif constellation).
netlify.toml          Déploiement : en‑têtes de sécurité (CSP…) et politique de cache.

vendor/               Three.js r160 et ses greffons (OrbitControls, bloom, CSS2D…),
                      copiés localement — aucune dépendance CDN à l'exécution.
assets/               Images du corpus (identifiants Miro stables).

— modules d'exécution (importés par index.html) —
circuit-router.mjs    Routeur orthogonal des liens. Partagé avec le build.
circuit-worker.mjs    Le même routage, hors du fil d'affichage, pour le recentrage.
orbital-router.mjs    Routage orbital 3D de la constellation.
lexical-resonance.mjs  Analyse du champ lexical (résonance entre post‑its).
semantic-lexicon.mjs  Relations lexicales contrôlées (synonymes, équivalences).
url-state.mjs         Décodage tolérant du fragment d'URL partagé.
url-label-gate.mjs    Étiquettes silencieuses pendant le rejeu d'une URL profonde.

— outil de fabrication (hors exécution) —
build-graph.mjs       export_miro.json -> graph.json. Ne pas servir en production.
```

---

## Déploiement

Poussé sur GitHub (`victormule/soliman-map-v3`) et desservi par **Netlify**
(publication de la racine, sans étape de build côté serveur — `graph.json` est
déjà versionné). `netlify.toml` fixe la compression (automatique), le cache et
les en‑têtes de sécurité, dont une **Content‑Security‑Policy** calibrée sur ce
que la page charge réellement. Elle est pour l'instant déployée en
**Report‑Only** (le temps du rodage) : signalée dans la console du navigateur,
elle ne bloque encore rien. Le passage en mode bloquant se fait en retirant le
suffixe `-Report-Only` dans `netlify.toml`, une fois vérifié qu'un parcours
normal ne déclenche aucune violation.

### Image de partage social

Les balises Open Graph du `<head>` pointent vers `og-image.jpg` à la racine
(1351 × 675, format paysage ≈ 2:1) — une capture de la constellation, **déposée** :
elle sert de vignette aux liens partagés (réseaux, messageries, articles). Les
dimensions déclarées dans le `<head>` (`og:image:width/height`) suivent le fichier
réel ; si vous le remplacez, mettez-les à jour en même temps.

---

## Pistes d'amélioration connues

- **Three.js non minifié** (`vendor/three.module.js`, ~1,3 Mo) : passer à un build
  minifié / tree‑shaké réduirait fortement le premier chargement.
- **Polices Google** chargées depuis `fonts.googleapis.com` : les auto‑héberger
  supprimerait la dépendance externe (performance + confidentialité RGPD).
- **Textures** toutes chargées au démarrage : un chargement différé allégerait
  l'ouverture.

---

## Licence

- **Code source : [MIT](LICENSE).**
- **Contenu** (corpus, textes, images, données de la carte mentale) : **tous droits
  réservés**, réutilisation soumise à autorisation. Voir la note en tête de `LICENSE`.

Rendu 3D : [Three.js](https://threejs.org/) (licence MIT), inclus dans `vendor/`.
