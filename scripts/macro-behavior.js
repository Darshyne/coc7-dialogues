/**
 * Region behavior `coc7-dialogues.clickMacro`: clicking the region runs a
 * macro on the clicking user's client — even if that user has no
 * permission on the macro.
 *
 * Rationale: core's own "Execute Macro" region behavior only fires on
 * token events (enter/exit/move), useless on theatre-of-the-mind scenes,
 * and Macro#execute refuses without LIMITED ownership. Since the macro to
 * run is hand-picked by the GM in this behavior's config, we bypass the
 * ownership check by replicating core's execution mechanics
 * (Macro#executeScript / #executeChat — see client/documents/macro.mjs)
 * instead of calling macro.execute(). The script still runs with the
 * *player's* rights: any world write the macro attempts is subject to the
 * player's normal document permissions.
 *
 * Click detection & highlight are shared with the Dialogue behavior — see
 * region-click.js.
 */

const fields = foundry.data.fields;

export class ClickMacroBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static LOCALIZATION_PREFIXES = ['COC7DIALOGUES.MacroBehavior'];

  static defineSchema() {
    return {
      macro: new fields.DocumentUUIDField({ type: 'Macro', required: true, blank: false, nullable: true, initial: null }),
      // Label shown next to the cursor on hover; empty = region name.
      label: new fields.StringField({ required: true, blank: true, initial: '' }),
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

  /** No region events — click-driven, like the Dialogue behavior. */
  static events = {};

  /** Hover label (same contract as DialogueBehaviorType#displayName). */
  get displayName() {
    return this.label || this.region?.name || '';
  }
}

/**
 * Run the macro of a clickMacro behavior, ignoring macro ownership.
 * @param {RegionBehavior} behavior
 */
export async function executeClickMacro(behavior) {
  const uuid = behavior.system.macro;
  const macro = uuid ? await fromUuid(uuid) : null;
  if ( !macro || macro.documentName !== 'Macro' ) {
    return ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.NoMacro'));
  }
  const speaker = foundry.documents.ChatMessage.implementation.getSpeaker();
  if ( macro.type === 'chat' ) {
    return ui.chat.processMessage(macro.command, { speaker }).catch(err => {
      console.error('coc7-dialogues | chat macro failed:', err);
      ui.notifications.error('MACRO.Error', { localize: true });
    });
  }
  // Script macro — same wrapper and arguments as Macro##executeScript.
  const character = game.user.character;
  const token = (canvas.ready ? canvas.tokens.get(speaker.token) : null) ?? null;
  const actor = token?.actor ?? game.actors.get(speaker.actor) ?? null;
  const scope = { behavior, region: behavior.region };
  const fn = new foundry.utils.AsyncFunction('speaker', 'actor', 'token', 'character', 'scope',
    `{${macro.command}\n}`);
  try {
    return await fn.call(macro, speaker, actor, token, character, scope);
  } catch(err) {
    console.error('coc7-dialogues | script macro failed:', err);
    ui.notifications.error('MACRO.Error', { localize: true });
  }
}
