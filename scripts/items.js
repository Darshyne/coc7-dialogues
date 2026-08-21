/**
 * Inventory side of dialogue choices: condition token `item:Name` (see
 * state.js#checkCondition) and per-choice `items` directives:
 *   take:Name        remove one from the player's inventory (decrements
 *                    system.quantity, deletes at 0) — "hand the quest item
 *                    to the NPC"
 *   give:Name|UUID   add a copy of a world/compendium Item to the player
 * Several directives separated by `;`. All client-side: the player owns
 * their actor, so no GM is needed.
 */

import { MODULE_ID } from './constants.js';
import { getPlayerActor } from './player.js';

const norm = s => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Find an item on the actor by (accent/case-insensitive) name. */
export function findActorItem(actor, name) {
  const n = norm(name);
  if ( !actor || !n ) return null;
  return actor.items.find(i => norm(i.name) === n) ?? null;
}

/** Does the current player's actor carry this item? */
export function hasItem(name) {
  return !!findActorItem(getPlayerActor(), name);
}

/** Apply an `items` directive string (see file header). */
export async function applyItemDirectives(directive) {
  const actor = getPlayerActor();
  const terms = String(directive ?? '').split(';').map(t => t.trim()).filter(Boolean);
  for ( const term of terms ) {
    try {
      await applyOne(actor, term);
    } catch(err) {
      console.error(`${MODULE_ID} | item directive "${term}" failed:`, err);
      ui.notifications.warn(game.i18n.format('COC7DIALOGUES.Warn.ItemFailed', { term }));
    }
  }
}

async function applyOne(actor, term) {
  const m = term.match(/^(take|give)\s*:\s*(.+)$/i);
  if ( !m ) return ui.notifications.warn(game.i18n.format('COC7DIALOGUES.Warn.ItemBadDirective', { term }));
  if ( !actor ) return ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.NoActorItem'));
  const op = m[1].toLowerCase();
  const ref = m[2].trim();

  if ( op === 'take' ) {
    const item = findActorItem(actor, ref);
    if ( !item ) return ui.notifications.warn(game.i18n.format('COC7DIALOGUES.Warn.ItemMissing', { name: ref }));
    const qty = Number(item.system?.quantity) || 1;
    if ( qty > 1 ) await item.update({ 'system.quantity': qty - 1 });
    else await item.delete();
    return ui.notifications.info(game.i18n.format('COC7DIALOGUES.Info.ItemTaken', { name: item.name }));
  }

  // give: UUID (Item or compendium entry) or world-item name
  let doc = null;
  if ( ref.includes('.') ) doc = await fromUuid(ref);
  doc ??= game.items.find(i => norm(i.name) === norm(ref)) ?? null;
  if ( !doc || doc.documentName !== 'Item' ) {
    return ui.notifications.warn(game.i18n.format('COC7DIALOGUES.Warn.ItemNoSource', { name: ref }));
  }
  const data = doc.toObject();
  delete data._id;
  await actor.createEmbeddedDocuments('Item', [data]);
  return ui.notifications.info(game.i18n.format('COC7DIALOGUES.Info.ItemGiven', { name: doc.name }));
}
