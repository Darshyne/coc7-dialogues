/**
 * Region behavior `coc7-dialogues.toScene`: clicking the region takes the
 * clicking user to another scene — tokenless, for players too. Same idea
 * as the CoC7 system's own "Chaosium Canvas Interface → To Scene"
 * behavior (scene.view() on the clicker's client), rebuilt on this
 * module's shared click/highlight/cursor infrastructure (region-click.js)
 * so it gets the hover label, the tints and the pointer cursor.
 *
 * `activateForAll` (GM only): instead of a local view, activate the scene
 * for the whole table — handy for the Keeper's own navigation regions.
 */

const fields = foundry.data.fields;

export class ToSceneBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static LOCALIZATION_PREFIXES = ['COC7DIALOGUES.SceneBehavior'];

  static defineSchema() {
    return {
      // NOT 'scene': RegionBehaviorType already defines a 'scene' getter (the parent Scene) that would shadow the field.
      targetScene: new fields.DocumentUUIDField({ type: 'Scene', required: true, blank: false, nullable: true, initial: null }),
      label: new fields.StringField({ required: true, blank: true, initial: '' }),
      activateForAll: new fields.BooleanField({ initial: false }),
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

  /** Hover label: explicit label, else the target scene's name, else the region's. */
  get displayName() {
    if ( this.label ) return this.label;
    const scene = this.targetScene ? fromUuidSync(this.targetScene) : null;
    return scene?.name ?? this.region?.name ?? '';
  }
}

/**
 * Go to the behavior's scene.
 * @param {RegionBehavior} behavior
 */
export async function executeToScene(behavior) {
  const uuid = behavior.system.targetScene;
  const scene = uuid ? await fromUuid(uuid) : null;
  if ( !scene || scene.documentName !== 'Scene' ) {
    return ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.NoScene'));
  }
  if ( behavior.system.activateForAll && game.user.isGM ) return scene.activate();
  if ( scene.isView ) return;
  return scene.view();
}
