/**
 * Region behavior `coc7-dialogues.openDocument`: clicking the region opens
 * a journal (or one of its pages) for the clicking user — a poster on the
 * wall, a letter on the desk, a newspaper stand… tokenless, players too.
 *
 * Permission: a player usually has NO right on a Keeper-secret journal
 * (Foundry doesn't even send it to their client). With `grant` enabled the
 * click asks the active GM client, over the module socket, to give the
 * clicker Observer ownership on the journal (and on the page, for a page
 * target) — then the document reaches the client and opens. Without a GM
 * online the player gets a clear warning instead of a silent failure.
 * Revealing is therefore PERMANENT and per player: exactly what an
 * investigator who found a clue expects.
 */

import { MODULE_ID } from './constants.js';

const fields = foundry.data.fields;
const SOCKET = `module.${MODULE_ID}`;
const GRANT_TIMEOUT_MS = 8000;
const pending = new Map(); // requestId → resolve

export class OpenDocumentBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static LOCALIZATION_PREFIXES = ['COC7DIALOGUES.DocumentBehavior'];

  static defineSchema() {
    return {
      // Journal entry OR journal page — validated at click time (no single `type` restriction here).
      document: new fields.DocumentUUIDField({ required: true, blank: false, nullable: true, initial: null }),
      label: new fields.StringField({ required: true, blank: true, initial: '' }),
      grant: new fields.BooleanField({ initial: true }),
      highlight: new fields.StringField({
        required: true, blank: false, initial: 'hover',
        choices: {
          hover: 'COC7DIALOGUES.Behavior.FIELDS.highlight.choices.hover',
          always: 'COC7DIALOGUES.Behavior.FIELDS.highlight.choices.always',
          never: 'COC7DIALOGUES.Behavior.FIELDS.highlight.choices.never'
        }
      }),
      color: new fields.ColorField({ required: false, nullable: true, initial: null })
    };
  }

  /** Click-driven — no region events. */
  static events = {};

  /** Hover label: explicit label, else the document's name (if known to this client), else the region's. */
  get displayName() {
    if ( this.label ) return this.label;
    const doc = this.document ? fromUuidSync(this.document) : null;
    return doc?.name ?? this.region?.name ?? '';
  }
}

/* -------------------------------------------- */
/*  Click                                       */
/* -------------------------------------------- */

/**
 * Open the behavior's document for the current user, asking the GM for
 * Observer permission first when needed and allowed.
 * @param {RegionBehavior} behavior
 */
export async function executeOpenDocument(behavior) {
  const uuid = behavior.system.document;
  if ( !uuid ) return ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.NoDocument'));

  let doc = await fromUuid(uuid);
  if ( doc && !isJournalTarget(doc) ) return ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.NoDocument'));

  // Not visible to this client (or visible but not readable): ask the Keeper.
  if ( !canRead(doc) ) {
    if ( !behavior.system.grant || game.user.isGM ) {
      return ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.DocumentNoPermission'));
    }
    const gm = game.users.activeGM;
    if ( !gm ) return ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.DocumentNoGM'));
    const ok = await requestGrant(uuid);
    if ( !ok ) return ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.DocumentGrantFailed'));
    doc = await waitForDocument(uuid);
    if ( !doc ) return ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.DocumentGrantFailed'));
  }
  return openJournalTarget(doc);
}

function isJournalTarget(doc) {
  return doc.documentName === 'JournalEntry' || doc.documentName === 'JournalEntryPage';
}

function canRead(doc) {
  if ( !doc ) return false;
  if ( doc.documentName === 'JournalEntryPage' ) {
    return doc.parent.testUserPermission(game.user, 'OBSERVER') && doc.testUserPermission(game.user, 'OBSERVER');
  }
  return doc.testUserPermission(game.user, 'OBSERVER');
}

function openJournalTarget(doc) {
  if ( doc.documentName === 'JournalEntryPage' ) {
    return doc.parent.sheet.render(true, { pageId: doc.id });
  }
  return doc.sheet.render(true);
}

/** Poll until the (freshly shared) document reaches this client. */
async function waitForDocument(uuid, tries = 20) {
  for ( let i = 0; i < tries; i++ ) {
    const doc = await fromUuid(uuid);
    if ( doc && canRead(doc) ) return doc;
    await new Promise(r => setTimeout(r, 150));
  }
  return null;
}

/* -------------------------------------------- */
/*  Socket: grant Observer via the active GM    */
/* -------------------------------------------- */

function requestGrant(uuid) {
  const requestId = foundry.utils.randomID();
  return new Promise(resolve => {
    const timer = setTimeout(() => { pending.delete(requestId); resolve(false); }, GRANT_TIMEOUT_MS);
    pending.set(requestId, ok => { clearTimeout(timer); pending.delete(requestId); resolve(ok); });
    game.socket.emit(SOCKET, { action: 'grantDocument', requestId, uuid, userId: game.user.id });
  });
}

/**
 * Socket handler — call from the module's single socket listener.
 * @param {object} data
 * @returns {boolean} whether the message was handled here
 */
export function handleDocumentSocket(data) {
  if ( data?.action === 'grantDocument' ) {
    // Exactly one GM client acts: the active GM.
    if ( game.users.activeGM?.id !== game.user.id ) return true;
    grantObserver(data.uuid, data.userId)
      .then(ok => game.socket.emit(SOCKET, { action: 'grantDocumentDone', requestId: data.requestId, userId: data.userId, ok }))
      .catch(err => {
        console.error(`${MODULE_ID} | grantDocument failed`, err);
        game.socket.emit(SOCKET, { action: 'grantDocumentDone', requestId: data.requestId, userId: data.userId, ok: false });
      });
    return true;
  }
  if ( data?.action === 'grantDocumentDone' ) {
    if ( data.userId !== game.user.id ) return true;
    pending.get(data.requestId)?.(!!data.ok);
    return true;
  }
  return false;
}

/**
 * GM side: give `userId` Observer ownership on the journal (and on the
 * page for a page target, when the page's own ownership would hide it).
 * Never lowers an existing higher level.
 * @param {string} uuid
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function grantObserver(uuid, userId) {
  const doc = await fromUuid(uuid);
  if ( !doc || !isJournalTarget(doc) ) return false;
  const OBS = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  const journal = doc.documentName === 'JournalEntryPage' ? doc.parent : doc;
  const raise = async target => {
    const current = target.ownership[userId] ?? CONST.DOCUMENT_META_OWNERSHIP_LEVELS.DEFAULT;
    const effective = current === CONST.DOCUMENT_META_OWNERSHIP_LEVELS.DEFAULT ? target.ownership.default : current;
    if ( effective >= OBS ) return;
    await target.update({ [`ownership.${userId}`]: OBS });
  };
  await raise(journal);
  if ( doc !== journal ) {
    // Page ownership: DEFAULT (-1) inherits from the journal, which is now fine; only raise an explicit lower level.
    const own = doc.ownership[userId];
    const explicitDefault = doc.ownership.default;
    const inherits = (own ?? CONST.DOCUMENT_META_OWNERSHIP_LEVELS.DEFAULT) === CONST.DOCUMENT_META_OWNERSHIP_LEVELS.DEFAULT
      && explicitDefault === CONST.DOCUMENT_META_OWNERSHIP_LEVELS.DEFAULT;
    if ( !inherits && !doc.testUserPermission(game.users.get(userId), 'OBSERVER') ) {
      await doc.update({ [`ownership.${userId}`]: OBS });
    }
  }
  return true;
}
