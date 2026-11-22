# Migration de coc7-dialogues vers CoC7 9.x

Relevé du 2026-11-22. Le module (0.13.1) avait été écrit et vérifié contre **CoC7 8.15**. Écart comparé par
`git diff 8.15 9.2` sur un clone frais du dépôt officiel (`Miskatonic-Investigative-Society/CoC7-FoundryVTT`) — le dossier
`../Systeme Foundry Call of cthulhu pour reference/` est un instantané 8.15, pas un dépôt git (voir
`../coc7-ledger/MIGRATION-COC7.md` pour le changelog 8.16 → 9.2 en général).

## Ce que coc7-dialogues utilise du système, vérifié en 9.2

| Usage (fichier du module) | 8.15 | 9.2 |
|---|---|---|
| `actor.type === 'character'` (`check.js`, seuls les investigateurs font des jets) | oui | identique |
| `actor.system.characteristics.{str,con,siz,dex,app,int,pow,edu}.value` (`check.js`) | schéma `defineSchemaCharacteristics` | identique (`global-system.js` inchangé) |
| `actor.system.attribs.{lck,san}.value` (`check.js`) | `defineSchemaAttribs` | identique |
| Objets `skill` : `name`, `system.skillName`, `system.value` (getter) (`check.js`) | oui | identique (diff de `skill-system.js` : icônes seulement) |
| `actor.setSan(value)` (`check.js#rollSanLoss`) | bornes, perte quotidienne, folie ; règle pulp « Chance » par `CoC7SpendLuckDialog` | **changé** : peut ouvrir `CoC7PickTalentDialog` (talents `takingSanityLoss` + règle pulp) et **attend** la réponse ; rend la SAN réellement écrite |
| `actor.system.infos.sex` (`player.js`, accords) | `StringField` | identique |
| `item.system.quantity` (`items.js`) | `NumberField` | identique |
| Clés i18n `CHARAC.STR…EDU`, `CoC7.Luck`, `CoC7.SAN` | présentes | présentes (fr, en) |
| Style global 9.0 sur toute `.application` | — | **nouveau** : `scale: var(--ui-scale)`, `max-width/height: calc(100% / var(--ui-scale))`, `background-image: var(--background-sheet)`, `font-size: var(--font-size-13)` |

Rien d'autre : pas de hook système, pas de `CoC7Check`, pas de constantes (`ERAS`…), pas de feuille. Paiements : contrat
`api.money` de coc7-ledger, inchangé en 0.6.1 (voir son relevé).

## Corrections (0.13.2)

1. **Fenêtre de talents sous l'overlay** (`dialogue-app.js`, `dialogues.css`). En 9.x, `setSan` ouvre une fenêtre dès que
   l'investigateur a un talent qui réduit la perte de SAN (ou si la règle pulp est active — déjà le cas en 8.15, latent) et
   attend qu'on y réponde. Les fenêtres vivent à `--z-index-window` (100+), l'overlay à 200 : la fenêtre restait cachée sous
   l'écran flouté et le dialogue paraissait figé. Pendant le jet de SAN, l'overlay porte `yield-windows`
   (z-index = `--z-index-window − 1`) et reprend sa place ensuite.
2. **Perte de SAN annoncée** (`check.js`) : `rollSanLoss` rapporte la perte réellement appliquée (retour de `setSan` : bornée
   à 0, réduite par un talent ou la Chance), plus seulement le jet de perte.
3. **Overlay stylisé comme une fenêtre** (`dialogues.css`) : `#coc7-dialogues-overlay` annule `scale`, `max-width/height` et
   l'image de fond posés par CoC7 9.x, pour rester plein écran à 1:1 quelle que soit l'échelle d'interface.

`module.json` : version 0.13.2, compatibilité système `CoC7` minimum 8.15, vérifiée 9.2.

## Tests

Banc CoC (`Dev Foundry/banc-de-test`, `npm run banc:passe -- coc7 coc7-dialogues`, Foundry 14.370, CoC7 9.2, copie du monde
`cthulhu`) — scénarios dans `banc-de-test/coc7/scenarios/coc7-dialogues.mjs`, chacun sur un investigateur copié et un journal
de quatre nœuds créés puis supprimés :

- `fumee` : chargement, type de page, cinq comportements de région ;
- `noeud` : nœud de départ, `{nom}` / `{a|b|c}`, choix à condition (var), condition composée, intro de retour (`visited:`) ;
- `paiement` : 5 $ pris sur les Dépenses courantes via coc7-ledger ; paiement impossible → `failTarget`, rien débité ;
- `jet` : FOR / « pouvoir » / Chance / SAN / compétence de la fiche lus aux bons chemins ; d100 forcé 01 → cible, 99 →
  `failTarget`, choix raté retiré ; seuil difficile = valeur / 2 ;
- `san` : « 0/3 » raté → 50 → 47 et `failTarget` ; réussi → pas de perte ;
- `san-talent` : talent `takingSanityLoss` → la fenêtre CoC7 s'ouvre au-dessus de l'overlay, cliquable ; fermée, le
  dialogue reprend ;
- `styles` : `--ui-scale` à 0.8 → l'overlay reste plein écran, sans échelle ni fond parchemin.

Passe complète du profil `coc7` le 2026-11-22 (12:26) : **13 scénarios joués, 13 tenus du premier coup** (dont les 7 de
coc7-dialogues, 34 vérifications). Les jets sont forcés par `CONFIG.Dice.randomUniform` ; le texte est lu après un clic
« passer » (sinon la machine à écrire n'en a dévoilé qu'une lettre).
