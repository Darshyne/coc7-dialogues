/**
 * Region behavior `coc7-dialogues.dialogue`: marks a Region as "clickable
 * NPC" and carries the dialogue configuration.
 *
 * Region behaviors have no click event in Foundry (only token
 * enter/exit/move…), so this type subscribes to NO events — the click
 * detection is done by region-click.js, which hit-tests canvas clicks
 * against every region carrying an enabled behavior of this type.
 *
 * The core RegionBehaviorConfig sheet renders these fields automatically
 * (DocumentUUIDField → drag-and-drop document input, FilePathField → file
 * picker), so no custom sheet is needed.
 */

const fields = foundry.data.fields;

export class DialogueBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static LOCALIZATION_PREFIXES = ['COC7DIALOGUES.Behavior'];

  static defineSchema() {
    return {
      journal: new fields.DocumentUUIDField({ type: 'JournalEntry', required: true, blank: false, nullable: true, initial: null }),
      speaker: new fields.StringField({ required: true, blank: true, initial: '' }),
      portrait: new fields.FilePathField({ categories: ['IMAGE'], required: false, blank: true }),
      highlight: new fields.StringField({
        required: true, blank: false, initial: 'hover',
        choices: {
          hover: 'COC7DIALOGUES.Behavior.FIELDS.highlight.choices.hover',
          always: 'COC7DIALOGUES.Behavior.FIELDS.highlight.choices.always',
          never: 'COC7DIALOGUES.Behavior.FIELDS.highlight.choices.never'
        }
      }),
      // Empty = use the region's own color.
      color: new fields.ColorField({ required: false, nullable: true, initial: null })
    };
  }

  /** No region events — this behavior is click-driven (see region-click.js). */
  static events = {};

  /**
   * Resolve the JournalEntry this behavior points at.
   * @returns {JournalEntry|null}
   */
  get journalEntry() {
    if ( !this.journal ) return null;
    const doc = fromUuidSync(this.journal);
    return doc?.documentName === 'JournalEntry' ? doc : null;
  }

  /** Display name of the NPC: explicit speaker, else the region's name. */
  get displayName() {
    return this.speaker || this.region?.name || '';
  }
}
