/**
 * The full-screen dialogue overlay: blurred scene, NPC portrait on the
 * left, the NPC's line and the investigator's choices on the right.
 *
 * Purely local (only the clicking user sees it) and purely client-side —
 * it reads the journal, writes state flags on the player's own actor, and
 * never needs a GM online.
 */

import { MODULE_ID, PAGE_TYPE, SETTING_BLUR, SETTING_TYPEWRITER, SETTING_TYPEWRITER_SPEED } from './constants.js';
import { applyPlaceholders, describeActor, getPlayerActor } from './player.js';
import { applySet, checkCondition, getStateOwner, markVisited } from './state.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

let current = null; // the single open DialogueApp, if any

/* -------------------------------------------- */
/*  Public entry points                         */
/* -------------------------------------------- */

/**
 * Open a dialogue from a Region behavior (click on the region).
 * @param {RegionBehavior} behavior
 */
export async function openDialogueFromBehavior(behavior) {
  const sys = behavior.system;
  let journal = null;
  if ( sys.journal ) journal = await fromUuid(sys.journal);
  if ( !journal || journal.documentName !== 'JournalEntry' ) {
    return ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.NoJournal'));
  }
  return openDialogue(journal, { speaker: sys.displayName, portrait: sys.portrait || '' });
}

/**
 * Open a dialogue on a journal.
 * @param {JournalEntry} journal
 * @param {object} [options]
 * @param {string} [options.speaker]      default NPC name
 * @param {string} [options.portrait]     default portrait path
 * @param {string} [options.startPageId]  page id to start on (default: first dialogue page)
 * @returns {Promise<DialogueApp|null>}
 */
export async function openDialogue(journal, { speaker = '', portrait = '', startPageId = null } = {}) {
  if ( !journal.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) ) {
    ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.NoPermission'));
    return null;
  }
  const start = startPageId ? journal.pages.get(startPageId) : firstDialoguePage(journal);
  if ( !start || start.type !== PAGE_TYPE ) {
    ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.NoStartNode'));
    return null;
  }
  if ( current ) await current.close();
  current = new DialogueApp({ journal, speaker, portrait, page: start });
  await current.render({ force: true });
  return current;
}

/** @param {JournalEntry} journal */
export function firstDialoguePage(journal) {
  return journal.pages.contents
    .filter(p => p.type === PAGE_TYPE)
    .sort((a, b) => a.sort - b.sort)[0] ?? null;
}

/* -------------------------------------------- */
/*  Application                                 */
/* -------------------------------------------- */

export class DialogueApp extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor({ journal, speaker, portrait, page }) {
    super({ id: `${MODULE_ID}-overlay` });
    this.journal = journal;
    this.defaultSpeaker = speaker || journal.name;
    this.defaultPortrait = portrait;
    this.page = page;
    this.who = describeActor(getPlayerActor());
    this.owner = getStateOwner();
  }

  static DEFAULT_OPTIONS = {
    classes: ['coc7-dialogues-overlay'],
    window: { frame: false, positioned: false },
    actions: {
      choose: DialogueApp.#onChoose,
      end: DialogueApp.#onEnd,
      skip: DialogueApp.#onSkip
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/dialogue.hbs` }
  };

  /** Bound keydown listener. */
  #keyHandler = event => this.#handleKey(event);
  /** Typewriter state. */
  #typing = null;

  /* -------------------------------------------- */

  async _prepareContext() {
    const sys = this.page.system;
    const TextEditor = foundry.applications.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
    const enriched = await TextEditor.enrichHTML(sys.text ?? '', { secrets: false, relativeTo: this.page });
    const text = applyPlaceholders(enriched, this.who);

    const choices = [];
    (sys.choices ?? []).forEach((c, index) => {
      if ( !checkCondition(c.condition, this.journal, this.owner) ) return;
      choices.push({ index, label: applyPlaceholders(c.label, this.who), key: choices.length + 1 });
    });

    return {
      speaker: sys.speaker || this.defaultSpeaker,
      portrait: sys.portrait || this.defaultPortrait,
      text,
      choices,
      noChoices: choices.length === 0,
      blur: game.settings.get(MODULE_ID, SETTING_BLUR),
      typewriter: game.settings.get(MODULE_ID, SETTING_TYPEWRITER)
    };
  }

  /* -------------------------------------------- */

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    document.addEventListener('keydown', this.#keyHandler);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.classList.toggle('no-blur', !context.blur);
    // Record the visit (fire and forget — the flag write must never block the UI).
    markVisited(this.page.uuid, this.owner).catch(err => console.error(`${MODULE_ID} |`, err));
    if ( context.typewriter ) this.#startTypewriter();
  }

  async _onClose(options) {
    await super._onClose(options);
    document.removeEventListener('keydown', this.#keyHandler);
    this.#stopTypewriter(false);
    if ( current === this ) current = null;
  }

  /* -------------------------------------------- */
  /*  Navigation                                  */
  /* -------------------------------------------- */

  /**
   * Move to another node of the same journal.
   * @param {string} pageId
   */
  async goTo(pageId) {
    const next = this.journal.pages.get(pageId);
    if ( !next || next.type !== PAGE_TYPE ) {
      ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.MissingTarget'));
      return this.close();
    }
    this.page = next;
    this.#stopTypewriter(false);
    await this.render();
  }

  static async #onChoose(event, target) {
    const index = Number(target.dataset.index);
    const choice = this.page.system.choices?.[index];
    if ( !choice ) return;
    target.disabled = true;
    await applySet(choice.set, this.owner);
    if ( choice.target ) return this.goTo(choice.target);
    return this.close();
  }

  static async #onEnd() {
    return this.close();
  }

  static #onSkip() {
    if ( this.#typing ) this.#stopTypewriter(true);
  }

  #handleKey(event) {
    if ( event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement ) return;
    if ( event.key === 'Escape' ) {
      event.preventDefault();
      event.stopPropagation();
      return this.close();
    }
    if ( this.#typing && (event.key === ' ' || event.key === 'Enter') ) {
      event.preventDefault();
      return this.#stopTypewriter(true);
    }
    const n = Number(event.key);
    if ( Number.isInteger(n) && n >= 1 && n <= 9 ) {
      const btn = this.element.querySelector(`[data-action="choose"][data-key="${n}"]`)
        ?? (n === 1 ? this.element.querySelector('[data-action="end"]') : null);
      if ( btn ) { event.preventDefault(); btn.click(); }
    }
  }

  /* -------------------------------------------- */
  /*  Typewriter                                  */
  /* -------------------------------------------- */

  #startTypewriter() {
    const box = this.element.querySelector('.dialogue-text');
    const choices = this.element.querySelector('.dialogue-choices');
    if ( !box ) return;
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ( (n = walker.nextNode()) ) nodes.push({ node: n, full: n.textContent });
    if ( !nodes.length ) return;
    for ( const e of nodes ) e.node.textContent = '';
    choices?.classList.add('pending');
    box.classList.add('typing');
    const cps = Math.max(5, Number(game.settings.get(MODULE_ID, SETTING_TYPEWRITER_SPEED)) || 40);
    const interval = 1000 / cps;
    let ni = 0, ci = 0;
    const state = { nodes, box, choices, timer: null };
    this.#typing = state;
    const tick = () => {
      if ( this.#typing !== state ) return;
      const e = nodes[ni];
      if ( !e ) return this.#stopTypewriter(true);
      ci++;
      e.node.textContent = e.full.slice(0, ci);
      if ( ci >= e.full.length ) { ni++; ci = 0; }
      state.timer = setTimeout(tick, interval);
    };
    tick();
  }

  #stopTypewriter(reveal) {
    const state = this.#typing;
    if ( !state ) return;
    clearTimeout(state.timer);
    this.#typing = null;
    if ( reveal ) for ( const e of state.nodes ) e.node.textContent = e.full;
    state.box?.classList.remove('typing');
    state.choices?.classList.remove('pending');
  }
}
