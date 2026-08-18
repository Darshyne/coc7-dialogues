/**
 * Who is talking to the NPC, and how to address them.
 *
 * Identity resolution (first hit wins):
 *   1. game.user.character (the player's assigned investigator)
 *   2. the first controlled token's actor (GM testing from a token)
 *   3. nothing — placeholders fall back to neutral wording.
 *
 * Gender comes from CoC7's free-text `system.infos.sex` field, normalised
 * to "f" / "m" / "" (unknown). Anything else in the world (a different
 * system, an NPC actor) simply yields "".
 */

/**
 * @returns {Actor|null}
 */
export function getPlayerActor() {
  if ( game.user.character ) return game.user.character;
  const controlled = canvas?.tokens?.controlled?.[0]?.actor;
  return controlled ?? null;
}

/**
 * Normalise a free-text sex/gender value into "f", "m" or "".
 * Accepts FR/EN spellings and single letters: F, Femme, Female, Woman,
 * M, H, Homme, Male, Man…
 * @param {string} raw
 * @returns {"f"|"m"|""}
 */
export function normalizeGender(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if ( !s ) return '';
  if ( /^(f|fem|femme|female|woman|w)/.test(s) ) return 'f';
  if ( /^(m|h|homme|male|man)/.test(s) ) return 'm';
  return '';
}

/**
 * @param {Actor|null} actor
 * @returns {{name: string, firstName: string, lastName: string, gender: "f"|"m"|""}}
 */
export function describeActor(actor) {
  const name = actor?.name?.trim() || game.i18n.localize('COC7DIALOGUES.Fallback.Name');
  const parts = name.split(/\s+/);
  const firstName = parts[0] ?? name;
  const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
  const gender = normalizeGender(foundry.utils.getProperty(actor ?? {}, 'system.infos.sex'));
  return { name, firstName, lastName, gender };
}

/**
 * Replace placeholders in a string.
 *
 * Supported:
 *   {nom} / {name}          full actor name
 *   {prenom} / {firstname}  first word of the name
 *   {nomdefamille} / {lastname}
 *   {titre} / {title}       Monsieur / Madame (neutral: nothing) — localised
 *   {a|b}                   masculine|feminine variant, e.g. {il|elle}, {cher|chère}
 *   {a|b|c}                 masculine|feminine|neutral variant
 *
 * Unknown gender picks the third variant when present, else the masculine
 * one (French default agreement).
 *
 * @param {string} text
 * @param {{name: string, firstName: string, lastName: string, gender: string}} who
 * @returns {string}
 */
export function applyPlaceholders(text, who) {
  if ( !text ) return text;
  const g = who.gender;
  const title = g === 'f' ? game.i18n.localize('COC7DIALOGUES.Title.F')
    : g === 'm' ? game.i18n.localize('COC7DIALOGUES.Title.M') : '';
  const simple = {
    nom: who.name, name: who.name,
    prenom: who.firstName, firstname: who.firstName,
    nomdefamille: who.lastName, lastname: who.lastName,
    titre: title, title
  };
  // Never match across tags or nested braces; enricher output ({...} labels)
  // has already been turned into <a> elements by the time we run.
  return text.replace(/\{([^{}<>]+)\}/g, (match, inner) => {
    const key = inner.trim().toLowerCase();
    if ( key in simple ) return simple[key];
    if ( inner.includes('|') ) {
      const [m, f, n] = inner.split('|');
      if ( g === 'f' ) return f ?? m;
      if ( g === 'm' ) return m;
      return n ?? m;
    }
    return match; // unknown placeholder: leave untouched
  });
}
