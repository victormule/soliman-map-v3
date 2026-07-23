/**
 * Maintient les étiquettes silencieuses pendant le rejeu d'une URL profonde,
 * mais garantit leur libération si l'utilisateur reprend la main et annule le
 * dernier vol de caméra (clic, touche, molette ou geste tactile).
 */
export function armUrlLabelRelease(target, onRelease, timeout = 15000) {
  const events = ['pointerdown', 'click', 'keydown', 'wheel', 'touchstart'];
  let armed = true;
  let timer = null;

  const release = () => {
    if (!armed) return;
    armed = false;
    events.forEach(type => target.removeEventListener(type, release, true));
    if (timer !== null) clearTimeout(timer);
    onRelease();
  };

  events.forEach(type => target.addEventListener(type, release, true));
  timer = setTimeout(release, timeout);
  return release;
}
