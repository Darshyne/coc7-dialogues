/**
 * Simple Quest integration: dialogue choices can grant and update quests,
 * fully client-side (no GM online), by writing into a quest journal the
 * PLAYER OWNS. Simple Quest routes non-owner objective updates through a
 * GM socket — owning the journal sidesteps that entirely.
 *
 * Authoring model:
 *   - The Keeper writes TEMPLATE quest pages (type simple-quest.quest) in
 *     any journal players can observe (the anti-spoiler pattern — journal
 *     Observer, pages None — works here too: page data still reaches the
 *     client).
 *   - A choice's `quest` field carries directives (separated by `;`):
 *       give:PAGE_UUID                 copy the template into the player's
 *                                      quest log, status In Progress
 *                                      (idempotent — given once)
 *       status:PAGE_UUID|done          done | failed | progress | hidden
 *       objective:PAGE_UUID|text|done  done | undone | failed — `text` is
 *                                      the objective line's text (matched
 *                                      the way Simple Quest slugifies it)
 *     PAGE_UUID is always the TEMPLATE page's UUID; the player's copy is
 *     found through the coc7-dialogues.questSource flag stamped on it.
 *
 * The player's quest log: a journal the user OWNS, carrying the
 * coc7-dialogues.questLog flag — or named "Quêtes — {nom}" (character or
 * user name) as a flagless convention. If none exists, we try to create
 * one next to the template's journal (works when the Keeper granted the
 * "Create Journal Entries" permission; otherwise a warning tells the
 * player to ask the Keeper).
 */

import { MODULE_ID } from './constants.js';
import { getPlayerActor } from './player.js';

/** Jingle played (locally) when a quest is granted. */
const GIVE_SOUND = `modules/${MODULE_ID}/asset/secret_nearby.ogg`;

const STATUS = { progress: 0, done: 1, completed: 1, failed: 2, hidden: -1, undiscovered: -1 };
const OBJECTIVE = { undone: 0, done: 1, checked: 1, failed: 2 };

/** Mirror of Simple Quest's objective key derivation. */
function objectiveKey(text) {
  return String(text ?? '').trim().slice(0, 50).slugify({ strict: true });
}

/** The player's own quest journal, or null. */
export function findQuestLog() {
  const names = new Set([`Quêtes — ${getPlayerActor()?.name}`, `Quêtes — ${game.user.name}`]);
  return game.journal.find(j => j.isOwner && !j.compendium
    && (j.getFlag(MODULE_ID, 'questLog') === true || names.has(j.name))) ?? null;
}

/**
 * Find the player's copy of a template quest.
 * @param {string} templateUuid
 * @returns {JournalEntryPage|null}
 */
export function findGivenQuest(templateUuid) {
  const log = findQuestLog();
  return log?.pages.find(p => p.getFlag(MODULE_ID, 'questSource') === templateUuid) ?? null;
}

/** Find or create the player's quest log. @param {JournalEntry} [nearJournal] */
export async function ensureQuestLog(nearJournal = null) {
  const existing = findQuestLog();
  if ( existing ) return existing;
  const name = `Quêtes — ${getPlayerActor()?.name ?? game.user.name}`;
  try {
    return await JournalEntry.create({
      name,
      folder: nearJournal?.folder?.id ?? null,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
      flags: { [MODULE_ID]: { questLog: true } }
    });
  } catch(err) {
    console.warn(`${MODULE_ID} | cannot create quest log:`, err);
    return null;
  }
}

/**
 * GM helper: create (or flag) a quest log for a given user.
 * @param {User|string} user      user or user name/id
 * @param {JournalEntry} [journal]  existing journal to mark instead of creating
 */
export async function createQuestLogFor(user, journal = null) {
  if ( typeof user === 'string' ) user = game.users.get(user) ?? game.users.getName(user);
  if ( !user ) throw new Error('User not found');
  if ( journal ) {
    await journal.setFlag(MODULE_ID, 'questLog', true);
    await journal.update({ ownership: { ...journal.ownership, [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } });
    return journal;
  }
  return JournalEntry.create({
    name: `Quêtes — ${user.character?.name ?? user.name}`,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    flags: { [MODULE_ID]: { questLog: true } }
  });
}

/* -------------------------------------------- */

/**
 * Apply a `quest` directive string (see file header). Directives run in
 * order; a failing directive warns and does not block the following ones.
 * @param {string} directive
 */
export async function applyQuestDirectives(directive) {
  const terms = String(directive ?? '').split(';').map(t => t.trim()).filter(Boolean);
  for ( const term of terms ) {
    try {
      await applyOne(term);
    } catch(err) {
      console.error(`${MODULE_ID} | quest directive "${term}" failed:`, err);
      ui.notifications.warn(game.i18n.format('COC7DIALOGUES.Warn.QuestFailed', { term }));
    }
  }
}

async function applyOne(term) {
  const m = term.match(/^(give|status|objective)\s*:\s*(.+)$/i);
  if ( !m ) return ui.notifications.warn(game.i18n.format('COC7DIALOGUES.Warn.QuestBadDirective', { term }));
  const op = m[1].toLowerCase();
  const parts = m[2].split('|').map(p => p.trim());
  const uuid = parts[0];
  const template = await fromUuid(uuid);
  if ( !template || template.documentName !== 'JournalEntryPage' || template.type !== 'simple-quest.quest' ) {
    return ui.notifications.warn(game.i18n.format('COC7DIALOGUES.Warn.QuestNoTemplate', { uuid }));
  }

  if ( op === 'give' ) {
    if ( findGivenQuest(uuid) ) return; // already given
    const log = await ensureQuestLog(template.parent);
    if ( !log ) return ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.QuestNoLog'));
    const data = template.toObject();
    delete data._id;
    data.system.status = STATUS.progress;
    foundry.utils.setProperty(data, `flags.${MODULE_ID}.questSource`, uuid);
    data.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
    await log.createEmbeddedDocuments('JournalEntryPage', [data]);
    // Discovery jingle — local to this player, on the interface channel so it
    // follows their Interface volume slider.
    foundry.audio.AudioHelper.play({ src: GIVE_SOUND, volume: 0.8, channel: 'interface' }, false)
      .catch(err => console.warn(`${MODULE_ID} | quest sound failed:`, err));
    return ui.notifications.info(game.i18n.format('COC7DIALOGUES.Info.QuestGiven', { name: template.name }));
  }

  const page = findGivenQuest(uuid);
  if ( !page ) return ui.notifications.warn(game.i18n.format('COC7DIALOGUES.Warn.QuestNotGiven', { name: template.name }));

  if ( op === 'status' ) {
    const status = STATUS[(parts[1] ?? '').toLowerCase()];
    if ( status === undefined ) return ui.notifications.warn(game.i18n.format('COC7DIALOGUES.Warn.QuestBadDirective', { term }));
    await page.update({ 'system.status': status });
    return ui.notifications.info(game.i18n.format('COC7DIALOGUES.Info.QuestUpdated', { name: page.name }));
  }

  if ( op === 'objective' ) {
    const state = OBJECTIVE[(parts[2] ?? 'done').toLowerCase()];
    if ( state === undefined || !parts[1] ) return ui.notifications.warn(game.i18n.format('COC7DIALOGUES.Warn.QuestBadDirective', { term }));
    const key = objectiveKey(parts[1]);
    const merged = { ...(page.system.objectiveState ?? {}), [key]: state };
    await page.update({ 'system.objectiveState': merged });
    return ui.notifications.info(game.i18n.format('COC7DIALOGUES.Info.QuestUpdated', { name: page.name }));
  }
}
