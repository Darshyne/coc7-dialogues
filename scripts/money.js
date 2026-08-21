/**
 * Money side of paid dialogue choices, delegated to coc7-ledger's public
 * `api.money` (>= 0.6.0). Cascade requested by the Keeper: Spending Level
 * remaining ("dépenses courantes") first, then Cash ("Espèces"), then
 * Capital. All-or-nothing: if the three pools together can't cover the
 * price, nothing is charged.
 *
 * Everything runs as the clicking player, on their own actor — the ledger
 * stores money in actor flags the player owns, so no GM is needed.
 */

/** coc7-ledger's money API, or null if the ledger isn't active/too old. */
export function ledgerMoney() {
  const money = game.modules.get('coc7-ledger')?.api?.money;
  if ( !money?.getSpendingRemaining || !money?.setSpendingRemaining ) return null; // needs >= 0.6.0
  return money;
}

/**
 * Charge `amount` to `actor` (Spending → Cash → Capital).
 * @param {Actor} actor
 * @param {number} amount
 * @returns {Promise<{ok: true, fromSpending: number, fromCash: number, fromCapital: number}
 *                  |{ok: false, error: "no-ledger"|"no-actor"|"insufficient-funds", missing?: number}>}
 */
export async function payFromActor(actor, amount) {
  amount = Math.round(Number(amount) * 100) / 100;
  if ( !(amount > 0) ) return { ok: true, fromSpending: 0, fromCash: 0, fromCapital: 0 };
  const money = ledgerMoney();
  if ( !money ) return { ok: false, error: 'no-ledger' };
  if ( !actor ) return { ok: false, error: 'no-actor' };

  const remaining = money.getSpendingRemaining(actor);
  const cash = money.getCash(actor);
  const capital = money.getCapital(actor);

  const fromSpending = Math.round(Math.min(amount, remaining) * 100) / 100;
  let rest = Math.round((amount - fromSpending) * 100) / 100;
  const fromCash = Math.round(Math.min(rest, cash) * 100) / 100;
  const fromCapital = Math.round((rest - fromCash) * 100) / 100;
  if ( fromCapital > capital ) {
    return { ok: false, error: 'insufficient-funds', missing: Math.round((fromCapital - capital) * 100) / 100 };
  }

  if ( fromSpending > 0 ) await money.setSpendingRemaining(actor, remaining - fromSpending);
  if ( fromCapital > 0 ) await money.sellCapital(actor, fromCapital); // Capital → Cash, $ for $
  if ( fromCash + fromCapital > 0 ) await money.setCash(actor, money.getCash(actor) - fromCash - fromCapital);
  return { ok: true, fromSpending, fromCash, fromCapital };
}
