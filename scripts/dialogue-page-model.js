/**
 * Data model of a "Dialogue node" journal page (JournalEntryPage sub-type
 * `coc7-dialogues.dialogue`).
 *
 * One page = one node: what the NPC says, plus the list of choices offered
 * to the investigator. A choice points at another page of the SAME journal
 * (by page id) or at nothing (ends the dialogue). The dialogue starts on
 * the first dialogue-type page of the journal (sort order).
 */

const fields = foundry.data.fields;

export class DialoguePageModel extends foundry.abstract.TypeDataModel {

  static LOCALIZATION_PREFIXES = ['COC7DIALOGUES.Page'];

  static defineSchema() {
    return {
      // What the NPC says. HTML (enrichers OK) + placeholders ({nom}, {il|elle}…).
      text: new fields.HTMLField({ required: true, blank: true, initial: '' }),
      // Optional per-node overrides of what the Region behavior configures.
      speaker: new fields.StringField({ required: true, blank: true, initial: '' }),
      portrait: new fields.FilePathField({ categories: ['IMAGE'], required: false, blank: true }),
      // Ordered choices.
      choices: new fields.ArrayField(new fields.SchemaField({
        label: new fields.StringField({ required: true, blank: true, initial: '' }),
        // Page id in the same journal; empty = end of dialogue.
        target: new fields.StringField({ required: true, blank: true, initial: '' }),
        // Visibility condition (see state.js#checkCondition).
        condition: new fields.StringField({ required: true, blank: true, initial: '' }),
        // Vars to set/unset when chosen (see state.js#applySet).
        set: new fields.StringField({ required: true, blank: true, initial: '' })
      }), { initial: [] })
    };
  }

  /** @returns {JournalEntryPage} */
  get page() { return this.parent; }

  /** @returns {JournalEntry} */
  get journal() { return this.parent?.parent; }
}
