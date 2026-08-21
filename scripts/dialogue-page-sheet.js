/**
 * Sheet of a "Dialogue node" journal page — edit mode (authoring: text,
 * overrides, choices table) and view mode (read-only rendering inside the
 * journal, with a "play from here" button).
 */

import { MODULE_ID, PAGE_TYPE } from './constants.js';
import { openDialogue } from './dialogue-app.js';

const Base = foundry.applications.sheets.journal.JournalEntryPageHandlebarsSheet;

export class DialoguePageSheet extends Base {

  static DEFAULT_OPTIONS = {
    classes: ['coc7-dialogues-page'],
    window: { icon: 'fa-solid fa-comments' },
    position: { width: 720, height: 760 },
    actions: {
      addChoice: DialoguePageSheet.#onAddChoice,
      removeChoice: DialoguePageSheet.#onRemoveChoice,
      moveChoice: DialoguePageSheet.#onMoveChoice,
      play: DialoguePageSheet.#onPlay,
      openPage: DialoguePageSheet.#onOpenPage
    }
  };

  static EDIT_PARTS = {
    header: super.EDIT_PARTS.header,
    content: {
      template: `modules/${MODULE_ID}/templates/page-edit.hbs`,
      classes: ['standard-form'],
      scrollable: ['']
    },
    footer: super.EDIT_PARTS.footer
  };

  static VIEW_PARTS = {
    content: {
      template: `modules/${MODULE_ID}/templates/page-view.hbs`,
      root: true
    }
  };

  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const page = this.page;
    const sys = page.system;
    const journal = page.parent;

    // Sibling dialogue nodes, for the target dropdowns / view links.
    const nodes = journal.pages.contents
      .filter(p => p.type === PAGE_TYPE)
      .sort((a, b) => a.sort - b.sort);
    const targetOptions = [
      { value: '', label: game.i18n.localize('COC7DIALOGUES.Page.EndTarget') },
      ...nodes.map(p => ({ value: p.id, label: p.name }))
    ];

    const TextEditor = foundry.applications.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
    const enrichedText = await TextEditor.enrichHTML(sys.text ?? '', { secrets: this.document.isOwner, relativeTo: page });

    const choices = (sys.choices ?? []).map((c, index) => {
      const target = c.target ? journal.pages.get(c.target) : null;
      const failTarget = c.failTarget ? journal.pages.get(c.failTarget) : null;
      return {
        ...c, index, key: index + 1,
        targetName: c.target ? (target?.name ?? game.i18n.localize('COC7DIALOGUES.Page.MissingTarget')) : game.i18n.localize('COC7DIALOGUES.Page.EndTarget'),
        targetMissing: !!c.target && !target,
        targetId: target?.id ?? '',
        failTargetName: failTarget?.name ?? (c.failTarget ? game.i18n.localize('COC7DIALOGUES.Page.MissingTarget') : ''),
        failTargetMissing: !!c.failTarget && !failTarget,
        failTargetId: failTarget?.id ?? ''
      };
    });

    const failTargetOptions = [
      { value: '', label: game.i18n.localize('COC7DIALOGUES.Page.NoFailTarget') },
      ...nodes.map(p => ({ value: p.id, label: p.name }))
    ];

    Object.assign(context, {
      failTargetOptions,
      systemFields: sys.schema.fields,
      system: sys,
      source: page._source,
      enrichedText,
      choices,
      targetOptions,
      isStart: nodes[0]?.id === page.id,
      portraitInput: this.#createPortraitInput.bind(this),
      canPlay: journal.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)
    });
    return context;
  }

  #createPortraitInput(field, inputConfig) {
    return foundry.applications.elements.HTMLFilePickerElement.create({ type: 'image', ...inputConfig });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareSubmitData(event, form, formData, updateData) {
    const data = super._prepareSubmitData(event, form, formData, updateData);
    // The choices table submits as {0: {...}, 1: {...}} — make it a dense array.
    const raw = foundry.utils.getProperty(data, 'system.choices');
    if ( raw && !Array.isArray(raw) ) {
      const arr = Object.keys(raw).map(Number).filter(Number.isInteger).sort((a, b) => a - b).map(i => raw[i]);
      foundry.utils.setProperty(data, 'system.choices', arr);
    }
    return data;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onAddChoice() {
    const choices = foundry.utils.deepClone(this.page.system._source.choices ?? []);
    choices.push({ label: '', target: '', condition: '', set: '', answer: '', cost: 0, failTarget: '' });
    await this.page.update({ 'system.choices': choices });
  }

  static async #onRemoveChoice(event, target) {
    const index = Number(target.closest('[data-index]')?.dataset.index);
    const choices = foundry.utils.deepClone(this.page.system._source.choices ?? []);
    if ( !(index >= 0 && index < choices.length) ) return;
    choices.splice(index, 1);
    await this.page.update({ 'system.choices': choices });
  }

  static async #onMoveChoice(event, target) {
    const index = Number(target.closest('[data-index]')?.dataset.index);
    const dir = Number(target.dataset.dir);
    const choices = foundry.utils.deepClone(this.page.system._source.choices ?? []);
    const j = index + dir;
    if ( !(index >= 0 && index < choices.length && j >= 0 && j < choices.length) ) return;
    [choices[index], choices[j]] = [choices[j], choices[index]];
    await this.page.update({ 'system.choices': choices });
  }

  static async #onPlay() {
    await openDialogue(this.page.parent, { startPageId: this.page.id });
  }

  static async #onOpenPage(event, target) {
    const page = this.page.parent.pages.get(target.dataset.pageId);
    if ( !page ) return;
    this.page.parent.sheet.render({ force: true, pageId: page.id });
  }
}
