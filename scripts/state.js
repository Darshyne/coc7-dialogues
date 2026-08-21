/**
 * Dialogue state: which nodes have been visited and which named variables
 * ("vars") were set by choices — all stored in flags so the MCP connector
 * can read/reset them.
 *
 * Storage owner: the player's actor when they own it (normal case), else
 * the User document (GM without a character, or a player without one).
 */

import { MODULE_ID, FLAG_VISITED, FLAG_VARS } from './constants.js';
import { getPlayerActor } from './player.js';
import { findActorItem } from './items.js';

/** @returns {Document} the document carrying this user's dialogue state. */
export function getStateOwner() {
  const actor = getPlayerActor();
  if ( actor?.isOwner ) return actor;
  return game.user;
}

/** @returns {Record<string, number>} */
export function getVisited(owner = getStateOwner()) {
  return foundry.utils.deepClone(owner.getFlag(MODULE_ID, FLAG_VISITED) ?? {});
}

/** @returns {Record<string, boolean>} */
export function getVars(owner = getStateOwner()) {
  return foundry.utils.deepClone(owner.getFlag(MODULE_ID, FLAG_VARS) ?? {});
}

/**
 * Record a visit to a node.
 * @param {string} pageUuid
 */
export async function markVisited(pageUuid, owner = getStateOwner()) {
  const visited = getVisited(owner);
  // Flag keys can't contain dots — UUIDs do. Store a safe key.
  const key = safeKey(pageUuid);
  visited[key] = (visited[key] ?? 0) + 1;
  await owner.setFlag(MODULE_ID, FLAG_VISITED, visited);
}

/** @param {string} pageUuid */
export function timesVisited(pageUuid, owner = getStateOwner()) {
  return getVisited(owner)[safeKey(pageUuid)] ?? 0;
}

/**
 * Apply a "set" directive: comma/space separated var names, `!name` unsets.
 * @param {string} directive
 */
export async function applySet(directive, owner = getStateOwner()) {
  const terms = splitTerms(directive);
  if ( !terms.length ) return;
  const vars = getVars(owner);
  for ( const t of terms ) {
    if ( t.startsWith('!') ) delete vars[t.slice(1)];
    else vars[t] = true;
  }
  await owner.setFlag(MODULE_ID, FLAG_VARS, vars);
}

/**
 * Evaluate a condition directive against the current state.
 * Terms (all must hold — AND):
 *   name            var is set
 *   !name           var is not set
 *   visited:ID      node with that page id/uuid was visited (in the same journal, id is enough)
 *   !visited:ID
 *   item:Name       the player's actor carries an item with that name
 *   !item:Name
 * @param {string} directive
 * @param {JournalEntry} journal   used to resolve bare page ids
 * @returns {boolean}
 */
export function checkCondition(directive, journal, owner = getStateOwner()) {
  const terms = splitTerms(directive);
  if ( !terms.length ) return true;
  const vars = getVars(owner);
  const visited = getVisited(owner);
  for ( let t of terms ) {
    let negate = false;
    if ( t.startsWith('!') ) { negate = true; t = t.slice(1); }
    let value;
    if ( t.toLowerCase().startsWith('visited:') ) {
      const ref = t.slice('visited:'.length);
      const uuid = ref.includes('.') ? ref : journal?.pages.get(ref)?.uuid;
      value = uuid ? (visited[safeKey(uuid)] ?? 0) > 0 : false;
    } else if ( t.toLowerCase().startsWith('item:') ) {
      value = !!findActorItem(getPlayerActor(), t.slice('item:'.length));
    } else {
      value = !!vars[t];
    }
    if ( negate ? value : !value ) return false;
  }
  return true;
}

/** Wipe this user's dialogue state (GM tool / debugging). */
export async function resetState(owner = getStateOwner()) {
  await owner.unsetFlag(MODULE_ID, FLAG_VISITED);
  await owner.unsetFlag(MODULE_ID, FLAG_VARS);
}

function splitTerms(s) {
  // Comma/semicolon separated ONLY — terms may contain spaces (item:Nom
  // avec espaces). Whitespace was dropped as a separator in 0.7.0.
  return String(s ?? '').split(/[,;]+/).map(t => t.trim()).filter(Boolean);
}

function safeKey(uuid) {
  return String(uuid).replaceAll('.', '_');
}
