/**
 * CoC7 Dialogues — entry point.
 * Branching NPC dialogues for theatre-of-the-mind scenes. See README.md.
 */

import { MODULE_ID, PAGE_TYPE, BEHAVIOR_TYPE, BEHAVIOR_TYPE_MACRO, SETTING_BLUR, SETTING_TYPEWRITER, SETTING_TYPEWRITER_SPEED } from './constants.js';
import { DialoguePageModel } from './dialogue-page-model.js';
import { DialoguePageSheet } from './dialogue-page-sheet.js';
import { DialogueBehaviorType } from './dialogue-behavior.js';
import { ClickMacroBehaviorType, executeClickMacro } from './macro-behavior.js';
import { registerCanvasHooks, getDialogueRegions, getClickableRegions } from './region-click.js';
import { openDialogue, openDialogueFromBehavior, DialogueApp } from './dialogue-app.js';
import { applyPlaceholders, describeActor, getPlayerActor, normalizeGender } from './player.js';
import { getVars, getVisited, resetState, applySet, checkCondition } from './state.js';

// Body font of the overlay — same Google Fonts <link> technique as coc7-ledger
// / CoC7 Arkham Journal (falls back to Signika/Georgia offline).
Hooks.once('init', () => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&display=swap';
  document.head.append(link);
});

Hooks.once('init', () => {
  // Journal page sub-type "Dialogue node".
  CONFIG.JournalEntryPage.dataModels[PAGE_TYPE] = DialoguePageModel;
  CONFIG.JournalEntryPage.typeIcons[PAGE_TYPE] = 'fa-solid fa-comments';
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.JournalEntryPage, MODULE_ID, DialoguePageSheet,
    { types: [PAGE_TYPE], makeDefault: true, label: 'COC7DIALOGUES.SheetLabel' }
  );

  // Region behavior sub-type "Dialogue".
  CONFIG.RegionBehavior.dataModels[BEHAVIOR_TYPE] = DialogueBehaviorType;
  CONFIG.RegionBehavior.typeIcons[BEHAVIOR_TYPE] = 'fa-solid fa-comments';
  if ( CONFIG.RegionBehavior.typeHints ) CONFIG.RegionBehavior.typeHints[BEHAVIOR_TYPE] = 'COC7DIALOGUES.Behavior.Hint';

  // Region behavior sub-type "Macro on click".
  CONFIG.RegionBehavior.dataModels[BEHAVIOR_TYPE_MACRO] = ClickMacroBehaviorType;
  CONFIG.RegionBehavior.typeIcons[BEHAVIOR_TYPE_MACRO] = 'fa-solid fa-scroll';
  if ( CONFIG.RegionBehavior.typeHints ) CONFIG.RegionBehavior.typeHints[BEHAVIOR_TYPE_MACRO] = 'COC7DIALOGUES.MacroBehavior.Hint';

  // Client settings (per user).
  game.settings.register(MODULE_ID, SETTING_BLUR, {
    name: 'COC7DIALOGUES.Settings.Blur.Name',
    hint: 'COC7DIALOGUES.Settings.Blur.Hint',
    scope: 'client', config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, SETTING_TYPEWRITER, {
    name: 'COC7DIALOGUES.Settings.Typewriter.Name',
    hint: 'COC7DIALOGUES.Settings.Typewriter.Hint',
    scope: 'client', config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, SETTING_TYPEWRITER_SPEED, {
    name: 'COC7DIALOGUES.Settings.TypewriterSpeed.Name',
    hint: 'COC7DIALOGUES.Settings.TypewriterSpeed.Hint',
    scope: 'client', config: true, type: Number, default: 40,
    range: { min: 10, max: 120, step: 5 }
  });

  registerCanvasHooks();
});

Hooks.once('ready', () => {
  // Public API for macros / other modules (an `export` alone isn't reachable from macros).
  game.modules.get(MODULE_ID).api = {
    openDialogue, openDialogueFromBehavior, DialogueApp,
    getDialogueRegions, getClickableRegions, executeClickMacro,
    applyPlaceholders, describeActor, getPlayerActor, normalizeGender,
    getVars, getVisited, resetState, applySet, checkCondition,
    PAGE_TYPE, BEHAVIOR_TYPE, BEHAVIOR_TYPE_MACRO
  };
});
