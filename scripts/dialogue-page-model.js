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
      // Entry condition (state.js#checkCondition syntax): when the dialogue
      // opens, the FIRST dialogue page (in sort order) whose condition
      // passes becomes the start node — so a "returning visitor" intro is
      // just a page with `visited:ID` placed before the first-time intro.
      condition: new fields.StringField({ required: true, blank: true, initial: '' }),
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
        set: new fields.StringField({ required: true, blank: true, initial: '' }),
        // Expected free-text answer(s), | or , separated (password node).
        // Non-empty = clicking opens a text prompt; right answer → target,
        // wrong answer → failTarget (or stays put).
        answer: new fields.StringField({ required: true, blank: true, initial: '' }),
        // Money to pay via coc7-ledger (Spending → Cash → Capital); 0 = free.
        cost: new fields.NumberField({ required: true, initial: 0, min: 0, nullable: false }),
        // CoC7 check: skill/characteristic name (see check.js); empty = no roll.
        check: new fields.StringField({ required: true, blank: true, initial: '' }),
        checkDifficulty: new fields.StringField({
          required: true, blank: false, initial: 'regular',
          choices: {
            regular: 'COC7DIALOGUES.Check.Difficulty.regular',
            hard: 'COC7DIALOGUES.Check.Difficulty.hard',
            extreme: 'COC7DIALOGUES.Check.Difficulty.extreme'
          }
        }),
        // Sanity roll with loss, "success/failure" formulas (e.g. "0/1d4").
        // Unlike `check`, a failed SAN roll does NOT block the choice: it
        // branches to failTarget only when one is set, else continues.
        san: new fields.StringField({ required: true, blank: true, initial: '' }),
        // Inventory directives applied on success (see items.js):
        // "take:Nom ; give:Nom_ou_UUID"
        items: new fields.StringField({ required: true, blank: true, initial: '' }),
        // Simple Quest directives applied on success (see quest.js):
        // "give:UUID ; status:UUID|done ; objective:UUID|texte|done"
        quest: new fields.StringField({ required: true, blank: true, initial: '' }),
        // Page id when the answer is wrong / the payment or the roll fails.
        failTarget: new fields.StringField({ required: true, blank: true, initial: '' })
      }), { initial: [] })
    };
  }

  /** @returns {JournalEntryPage} */
  get page() { return this.parent; }

  /** @returns {JournalEntry} */
  get journal() { return this.parent?.parent; }
}
