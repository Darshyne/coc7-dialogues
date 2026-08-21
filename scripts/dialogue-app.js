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
import { payFromActor } from './money.js';

/** Case/accent/whitespace-insensitive comparison key for free-text answers. */
function normalizeAnswer(s) {
  const noAccents = String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return noAccents.replace(/\s+/g, ' ');
}

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
      skip: DialogueApp.#onSkip,
      submitAnswer: DialogueApp.#onSubmitAnswer,
      cancelAnswer: DialogueApp.#onCancelAnswer
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/dialogue.hbs` }
  };

  /** Bound keydown listener. */
  #keyHandler = event => this.#handleKey(event);
  /** Typewriter state. */
  #typing = null;
  /** Index of the choice awaiting free-text input, or null. */
  #pendingChoice = null;
  /** Last page uuid whose visit was recorded (guards re-renders). */
  #markedUuid = null;

  /* -------------------------------------------- */

  async _prepareContext() {
    const sys = this.page.system;
    const TextEditor = foundry.applications.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
    const enriched = await TextEditor.enrichHTML(sys.text ?? '', { secrets: false, relativeTo: this.page });
    const text = applyPlaceholders(enriched, this.who);

    const choices = [];
    (sys.choices ?? []).forEach((c, index) => {
      if ( !checkCondition(c.condition, this.journal, this.owner) ) return;
      choices.push({
        index,
        label: applyPlaceholders(c.label, this.who),
        key: choices.length + 1,
        cost: c.cost > 0 ? c.cost : null,
        hasAnswer: !!c.answer?.trim()
      });
    });

    const pending = this.#pendingChoice !== null ? sys.choices?.[this.#pendingChoice] : null;
    return {
      speaker: sys.speaker || this.defaultSpeaker,
      portrait: sys.portrait || this.defaultPortrait,
      text,
      choices,
      noChoices: choices.length === 0,
      inputMode: pending ? { index: this.#pendingChoice, label: applyPlaceholders(pending.label, this.who) } : null,
      blur: game.settings.get(MODULE_ID, SETTING_BLUR),
      // No typewriter replay when we merely switch to/from the input row.
      typewriter: game.settings.get(MODULE_ID, SETTING_TYPEWRITER) && (this.page.uuid !== this.#markedUuid)
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
    // Record the visit once per node, not on every re-render (input mode
    // toggles re-render the same node). Fire and forget — the flag write
    // must never block the UI.
    if ( this.page.uuid !== this.#markedUuid ) {
      markVisited(this.page.uuid, this.owner).catch(err => console.error(`${MODULE_ID} |`, err));
    }
    if ( context.typewriter ) this.#startTypewriter();
    this.#markedUuid = this.page.uuid;
    const input = this.element.querySelector('.dialogue-input input');
    if ( input ) {
      input.focus();
      input.addEventListener('keydown', event => {
        event.stopPropagation();
        if ( event.key === 'Enter' ) {
          event.preventDefault();
          this.element.querySelector('[data-action="submitAnswer"]')?.click();
        }
        else if ( event.key === 'Escape' ) {
          event.preventDefault();
          this.element.querySelector('[data-action="cancelAnswer"]')?.click();
        }
      });
    }
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
    this.#pendingChoice = null;
    this.#stopTypewriter(false);
    await this.render();
  }

  static async #onChoose(event, target) {
    const index = Number(target.dataset.index);
    const choice = this.page.system.choices?.[index];
    if ( !choice ) return;
    // Free-text answer expected? Switch to the input row first.
    if ( choice.answer?.trim() ) {
      this.#pendingChoice = index;
      return this.render();
    }
    target.disabled = true;
    return this.#resolveChoice(choice);
  }

  /**
   * Everything that happens once a choice is truly taken: payment, vars,
   * navigation. The failure branch (can't pay) goes to failTarget when set,
   * else stays on the node.
   * @param {object} choice
   */
  async #resolveChoice(choice) {
    this.#pendingChoice = null;
    if ( choice.cost > 0 ) {
      const actor = getPlayerActor();
      const paid = await payFromActor(actor, choice.cost);
      if ( !paid.ok ) {
        const key = { 'no-ledger': 'NoLedger', 'no-actor': 'NoActorMoney', 'insufficient-funds': 'NotEnoughMoney' }[paid.error];
        ui.notifications.warn(game.i18n.format(`COC7DIALOGUES.Warn.${key}`, { cost: choice.cost }));
        if ( paid.error === 'insufficient-funds' && choice.failTarget ) return this.goTo(choice.failTarget);
        return this.render();
      }
      // Leave a trace in chat so the Keeper can audit money moves later.
      foundry.documents.ChatMessage.implementation.create({
        content: game.i18n.format('COC7DIALOGUES.Chat.Paid', { actor: actor.name, cost: choice.cost, npc: this.page.system.speaker || this.defaultSpeaker }),
        speaker: { alias: actor.name }
      }).catch(err => console.error(`${MODULE_ID} |`, err));
    }
    await applySet(choice.set, this.owner);
    if ( choice.target ) return this.goTo(choice.target);
    return this.close();
  }

  static async #onSubmitAnswer() {
    const choice = this.page.system.choices?.[this.#pendingChoice];
    const input = this.element.querySelector('.dialogue-input input');
    if ( !choice || !input ) return;
    const given = normalizeAnswer(input.value);
    if ( !given ) return; // empty: just keep waiting
    const accepted = choice.answer.split(/[|,;]/).map(normalizeAnswer).filter(Boolean);
    if ( accepted.includes(given) ) return this.#resolveChoice(choice);
    // Wrong answer: branch if the author wired a failure node, else shake and retry.
    if ( choice.failTarget ) return this.goTo(choice.failTarget);
    input.value = '';
    input.classList.remove('wrong');
    void input.offsetWidth; // restart the CSS animation
    input.classList.add('wrong');
    input.focus();
  }

  static async #onCancelAnswer() {
    this.#pendingChoice = null;
    return this.render();
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
