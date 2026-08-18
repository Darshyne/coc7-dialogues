# CLAUDE.md — coc7-dialogues

## Quoi

Module Foundry VTT (CoC7, v13 min / v14 vérifié) : dialogues de PNJ à
embranchements pour scènes en **théâtre de l'esprit** — clic sur une Région
→ overlay plein écran (portrait alpha à gauche, scène floutée, répliques +
choix à droite). 100 % côté client, zéro socket, zéro dépendance : les
joueurs dialoguent sans MJ connecté. `README.md` = doc utilisateur et
modèle de données, le lire en premier.

Créé le 2026-08-18. Repo : `Darshyne/coc7-dialogues` (privé). Test local :
junction `F:\Foundry V14\Data\modules\coc7-dialogues` → ce dossier (même
pattern que `../coc7-ledger/`).

## Décisions structurantes (validées avec le MJ le 2026-08-18)

- **Nœuds = pages de journal d'un sous-type custom** `coc7-dialogues.dialogue`
  (`TypeDataModel` dans `scripts/dialogue-page-model.js`, sheet V2 dans
  `dialogue-page-sheet.js` héritant de `JournalEntryPageHandlebarsSheet`) —
  pas une convention sur pages texte. Les choix ciblent une page du **même
  journal** par `id` (pas d'UUID inter-journaux). Nœud de départ = première
  page de ce type dans l'ordre `sort`.
- **Déclenchement par clic sur une Région, sans token.** Les
  `RegionBehavior` n'ont pas d'événement clic et le calque Régions est
  invisible/inactif pour les joueurs → le behavior custom
  (`coc7-dialogues.dialogue`, `scripts/dialogue-behavior.js`, `static
  events = {}`) ne porte que la config ; `scripts/region-click.js` écoute
  `pointerdown/up` sur `canvas.stage` (ré-attaché à chaque `canvasReady`,
  core fait `stage.removeAllListeners()` au redraw), distingue clic et
  drag (6 px), hit-teste `regionDocument.polygonTree.testPoint()` et
  dessine sa propre surbrillance dans `canvas.interface`. Le MJ ne
  déclenche que depuis le calque Tokens (pour ne pas voler les clics des
  outils).
- **Jets de compétence CoC7 dans les choix : V2, pas maintenant.** La
  structure `choices[]{label,target,condition,set}` est prévue pour y
  ajouter un champ jet plus tard.
- **État en flags d'acteur** (`flags.coc7-dialogues.visited|vars`), sur
  l'acteur du joueur s'il en est propriétaire sinon sur son User — jamais
  en world settings, pour rester lisible par le connecteur MCP (même
  raison que coc7-fame-and-train). Le joueur écrit ses propres flags →
  aucun relais MJ nécessaire.
- **Overlay = ApplicationV2 frameless non positionnée** (`window: {frame:
  false, positioned: false}`), `position: fixed; inset: 0` en CSS,
  `backdrop-filter: blur` sur l'élément lui-même. Un seul overlay à la
  fois (`current` dans `dialogue-app.js`).
- La config du behavior est rendue par le `RegionBehaviorConfig` core
  (auto-génération des champs `system.*` avec `hasFormSupport`) — pas de
  sheet custom pour le behavior.

## Pièges rencontrés

- Clefs de flags : les UUID contiennent des points → stockés avec `.`
  remplacés par `_` (`state.js#safeKey`).
- Localisation des sous-types : `TYPES.JournalEntryPage["coc7-dialogues.dialogue"]`
  se résout par chemin pointé → dans `lang/*.json` il faut la forme
  imbriquée `TYPES.JournalEntryPage["coc7-dialogues"].dialogue`.
- Pas de helper Handlebars `{{add}}` en core → numéros de choix précalculés
  (`key`) dans le contexte.
- `CONFIG.RegionBehavior.typeHints` n'existe qu'en V14 → garde `if`.
- V14 : CSS agrégé au lancement du monde → modifier `styles/*.css` exige
  de relancer le monde (voir `../../foundry-core-notes/v14-migration.md`).

## Conventions

Mêmes patterns que `../coc7-ledger/` et `../coc7 fame and train/` :
ApplicationV2 + HandlebarsApplicationMixin, `data-action`, i18n
`COC7DIALOGUES.*`, API publique posée sur `game.modules.get(id).api` au
`ready`. Gotchas core communs : `../../foundry-core-notes/`.
