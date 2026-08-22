export const MODULE_ID = 'coc7-dialogues';

/** Full sub-type names (module-scoped, as Foundry registers them). */
export const PAGE_TYPE = `${MODULE_ID}.dialogue`;
export const BEHAVIOR_TYPE = `${MODULE_ID}.dialogue`;
export const BEHAVIOR_TYPE_MACRO = `${MODULE_ID}.clickMacro`;
export const BEHAVIOR_TYPE_SCENE = `${MODULE_ID}.toScene`;
export const BEHAVIOR_TYPE_JUKEBOX = `${MODULE_ID}.jukebox`;

/** Actor/User flag keys (all state lives under flags[MODULE_ID]). */
export const FLAG_VISITED = 'visited'; // { [pageUuid]: count }
export const FLAG_VARS = 'vars';       // { [name]: true }

/** Setting keys. */
export const SETTING_TYPEWRITER = 'typewriter';
export const SETTING_TYPEWRITER_SPEED = 'typewriterSpeed';
export const SETTING_BLUR = 'blur';
