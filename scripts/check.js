/**
 * CoC7 checks inside dialogue choices — rolled by this module, not by the
 * system's own CoC7Check (the distributed system is bundled, its check
 * class isn't importable, and its public triggers never return the
 * result). A CoC7 check is fundamentally 1d100 vs a threshold: skill (or
 * characteristic) value at regular difficulty, half at hard, a fifth at
 * extreme; 1 is a critical, 96-100 (100 if value >= 50) a fumble. We roll
 * a real Foundry Roll so the chat card and Dice So Nice behave normally,
 * and read the total to branch the dialogue.
 *
 * What the `check` field accepts (accent/case-insensitive):
 *   - a skill name, matched against the actor's skill items (name and
 *     system.skillName) — e.g. "Psychologie", "Baratin (Fast Talk)";
 *   - a characteristic: FOR/STR, CON, TAI/SIZ, DEX, APP, INT, POU/POW, EDU;
 *   - Chance/Luck or SAN.
 */

import { MODULE_ID } from './constants.js';

const norm = s => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const CHARACTERISTICS = {
  str: ['str', 'for', 'force', 'strength'],
  con: ['con', 'constitution'],
  siz: ['siz', 'tai', 'taille', 'size'],
  dex: ['dex', 'dexterite', 'dexterity'],
  app: ['app', 'apparence', 'appearance'],
  int: ['int', 'intelligence'],
  pow: ['pow', 'pou', 'pouvoir', 'power'],
  edu: ['edu', 'education']
};
const ATTRIBUTES = {
  lck: ['chance', 'luck', 'lck'],
  san: ['san', 'sanite', 'sante mentale', 'sanity']
};

export const DIFFICULTIES = ['regular', 'hard', 'extreme'];

/**
 * Resolve what a check name points at on this actor.
 * @param {Actor} actor
 * @param {string} name
 * @returns {{label: string, value: number}|null}
 */
export function resolveCheckTarget(actor, name) {
  if ( !actor || actor.type !== 'character' ) return null;
  const n = norm(name);
  if ( !n ) return null;
  for ( const [key, aliases] of Object.entries(CHARACTERISTICS) ) {
    if ( aliases.includes(n) ) {
      const value = actor.system.characteristics?.[key]?.value;
      if ( typeof value !== 'number' ) return null;
      const label = game.i18n.localize(`CHARAC.${key.toUpperCase()}`);
      return { label: label.startsWith('CHARAC') ? key.toUpperCase() : label, value };
    }
  }
  for ( const [key, aliases] of Object.entries(ATTRIBUTES) ) {
    if ( aliases.includes(n) ) {
      const value = actor.system.attribs?.[key]?.value;
      if ( typeof value !== 'number' ) return null;
      return { label: key === 'lck' ? game.i18n.localize('CoC7.Luck') : game.i18n.localize('CoC7.SAN'), value };
    }
  }
  const skill = actor.items.find(i => i.type === 'skill'
    && (norm(i.name) === n || norm(i.system.skillName) === n));
  if ( skill ) return { label: skill.name, value: skill.system.value ?? 0 };
  return null;
}

/**
 * Roll a check and post it to chat.
 * @param {Actor} actor
 * @param {string} name              skill/characteristic name
 * @param {string} [difficulty]     'regular' | 'hard' | 'extreme'
 * @returns {Promise<{ok: true, success: boolean, critical: boolean, fumble: boolean,
 *                    total: number, threshold: number, label: string}
 *                  |{ok: false, error: 'no-actor'|'unknown-check'}>}
 */
export async function rollDialogueCheck(actor, name, difficulty = 'regular') {
  if ( !actor ) return { ok: false, error: 'no-actor' };
  const target = resolveCheckTarget(actor, name);
  if ( !target ) return { ok: false, error: 'unknown-check' };
  const div = { regular: 1, hard: 2, extreme: 5 }[difficulty] ?? 1;
  const threshold = Math.floor(target.value / div);

  const roll = new Roll('1d100');
  await roll.evaluate();
  const total = roll.total;
  const critical = total === 1;
  const fumble = total >= (target.value < 50 ? 96 : 100);
  const success = !fumble && (critical || total <= threshold);

  const diffLabel = game.i18n.localize(`COC7DIALOGUES.Check.Difficulty.${difficulty}`);
  const resultKey = critical ? 'Critical' : fumble ? 'Fumble' : success ? 'Success' : 'Failure';
  const resultLabel = game.i18n.localize(`COC7DIALOGUES.Check.${resultKey}`);
  await roll.toMessage({
    speaker: { alias: actor.name },
    flavor: `<div class="coc7-dialogues-check ${success ? 'success' : 'failure'}">`
      + `<strong>${foundry.utils.escapeHTML(target.label)}</strong> (${diffLabel} — ${threshold})`
      + ` : <span class="result">${resultLabel}</span></div>`
  });
  return { ok: true, success, critical, fumble, total, threshold, label: target.label };
}

/**
 * A CoC7 Sanity roll with loss, from a "success/failure" spec like "0/1d4":
 * 1d100 vs current SAN; the matching formula is rolled and deducted through
 * the system's own actor.setSan() (bounds, pulp Luck rule, etc.).
 * @param {Actor} actor
 * @param {string} lossSpec      e.g. "0/1d4", "1/1d6", "1d2/1d10"
 * @returns {Promise<{ok: true, success: boolean, total: number, threshold: number,
 *                    label: string, loss: number, formula: string}
 *                  |{ok: false, error: 'no-actor'|'unknown-check'}>}
 */
export async function rollSanLoss(actor, lossSpec) {
  if ( !actor ) return { ok: false, error: 'no-actor' };
  const target = resolveCheckTarget(actor, 'san');
  if ( !target ) return { ok: false, error: 'unknown-check' };
  const [okFormula, koFormula] = String(lossSpec ?? '0/0').split('/').map(s => s.trim());

  const roll = new Roll('1d100');
  await roll.evaluate();
  const total = roll.total;
  const fumble = total >= (target.value < 50 ? 96 : 100);
  const success = !fumble && (total === 1 || total <= target.value);
  const formula = (success ? okFormula : (koFormula ?? okFormula)) || '0';

  let loss = 0;
  if ( formula !== '0' ) {
    const lossRoll = new Roll(formula);
    await lossRoll.evaluate();
    loss = Math.max(0, lossRoll.total);
  }
  if ( loss > 0 ) await actor.setSan((actor.system.attribs.san.value ?? 0) - loss);

  const resultLabel = game.i18n.localize(`COC7DIALOGUES.Check.${success ? 'Success' : 'Failure'}`);
  const lossLabel = loss > 0
    ? game.i18n.format('COC7DIALOGUES.Check.SanLoss', { formula, loss })
    : game.i18n.localize('COC7DIALOGUES.Check.SanNoLoss');
  await roll.toMessage({
    speaker: { alias: actor.name },
    flavor: `<div class="coc7-dialogues-check ${success ? 'success' : 'failure'}">`
      + `<strong>${foundry.utils.escapeHTML(target.label)}</strong> (${target.value})`
      + ` : <span class="result">${resultLabel}</span> — ${lossLabel}</div>`
  });
  return { ok: true, success, total, threshold: target.value, label: target.label, loss, formula };
}
