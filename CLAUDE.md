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
- **Jets de compétence CoC7 dans les choix (v0.4.0, 2026-08-21)** : champs
  `check` (nom de compétence de la fiche / caractéristique FOR-DEX-POU… /
  Chance / SAN, insensible aux accents — `scripts/check.js`) +
  `checkDifficulty` (regular/hard/extreme → valeur, /2, /5). Le d100 est
  lancé PAR LE MODULE (Roll Foundry natif → carte de chat + Dice So Nice),
  pas par CoC7Check : le système distribué est bundlé (classe inaccessible)
  et ses déclencheurs publics (`actor.skillCheck` → CoC7RollNormalize) ne
  renvoient jamais le résultat. 1 = critique, 96-100 (100 si valeur ≥ 50) =
  maladresse. Ordre dans un choix : mot attendu → paiement → jet ; échec de
  jet → `failTarget`, ou FERMETURE du dialogue si vide (anti re-tentative).
  Bannière de résultat inline (1,6 s) avant navigation. Le nom doit être
  celui de la FICHE (fiche anglaise = noms anglais). Vérifié en jeu avec
  `CONFIG.Dice.randomUniform` forcé (astuce de test : c'est la source
  d'aléa des Roll ; mapping inversé, u≈0.99 → petit d100).
- **Mot de passe + argent dans les choix (v0.3.0, 2026-08-21)** : trois
  champs par choix — `answer` (mot(s) attendu(s), saisie de texte dans
  l'overlay, comparaison casse/accents/espaces-insensible via
  `normalizeAnswer`, alternatives séparées par `|`), `cost` (prélevé via
  `coc7-ledger` `api.money` **0.6.0+** — `getSpendingRemaining` /
  `setSpendingRemaining` y ont été ajoutés pour nous — cascade Dépenses
  courantes → Espèces → Capital dans `scripts/money.js#payFromActor`,
  tout ou rien, trace chat), `failTarget` (nœud de repli commun : mot faux
  ou paiement impossible ; vide = retry pour le mot, no-op pour l'argent).
  `set` ne s'applique qu'en cas de succès. Vérifié en jeu (compte `test`,
  Charline : 5 $ pris sur Dépenses courantes ; 50 $ → 45 dépenses + 5
  Capital via `sellCapital` ; refus 999 999 $ → rien débité, bascule
  failTarget). Piège : `#markedUuid` dans `dialogue-app.js` évite de
  recompter une visite / rejouer la machine à écrire quand on re-render le
  même nœud (bascule mode saisie) — ne pas simplifier.
- **Après toute modif du data model d'un sous-type existant** : les clients
  qui tournent avec l'ancien code NETTOIENT les nouveaux champs `system.*`
  à l'écriture (vécu 2026-08-21 : update MCP exécuté par le client MJ non
  rechargé → `answer`/`cost`/`failTarget` silencieusement effacés). Faire
  recharger tous les clients (F5) avant d'écrire des données utilisant le
  nouveau schéma ; nouveau sous-type entier → relancement du monde.
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
- **Second behavior « Macro au clic »** (`coc7-dialogues.clickMacro`,
  ajouté 2026-08-21, `scripts/macro-behavior.js`) : clic dans la région →
  exécute une macro chez l'utilisateur qui clique, **en contournant
  volontairement la permission** (`Macro#execute` exige LIMITED ; on
  réplique à la place la mécanique de `Macro##executeScript`/`#executeChat`
  — AsyncFunction avec `speaker/actor/token/character/scope`, `this` =
  macro ; `scope.behavior`/`scope.region` en bonus). La macro tourne avec
  les droits du joueur pour toute écriture de document — ce contournement
  ne donne aucun droit d'écriture supplémentaire, ne pas le « corriger ».
  Détection clic/surbrillance partagée avec le dialogue : table
  `CLICK_HANDLERS` dans `region-click.js` (`getClickableRegions()` ; un
  seul behavior cliquable par région, le premier actif). Vérifié en jeu
  (compte `test`, macro `default: 0`, `canExecute: false` → clic OK).
  Rappel : tout nouveau sous-type dans `module.json` (`documentTypes`)
  exige un **relancement du monde**, pas juste un F5 — le serveur valide
  les types à partir du manifest chargé au lancement.

- **Anti-spoil recommandé : journal Observateur + pages à « Aucun »**
  (vérifié 2026-08-21 en jeu, compte `test`, MJ hors ligne) : le journal
  s'ouvre vide pour les joueurs mais le dialogue se joue normalement —
  `openDialogue` ne teste la permission qu'au niveau du JournalEntry, et
  la navigation (`journal.pages.get`) ignore la permission par page,
  Foundry envoyant toutes les pages au client. Documenté dans README
  (« Mise en place » étape 2). Ne pas « corriger » ce comportement en
  ajoutant un test de permission par page : il est volontaire.

- **Quêtes Simple Quest dans les choix (v0.5.0, 2026-08-21)** : champ
  `quest` par choix (`give:UUID ; status:UUID|done ; objective:UUID|texte|
  done`, `scripts/quest.js`), appliqué APRÈS `set`, en cas de succès
  seulement. Architecture : quêtes modèles (pages `simple-quest.quest`)
  copiées dans un **journal de quêtes possédé par le joueur** (résolu par
  flag `questLog` OU nom `Quêtes — {acteur/user}`) — parce que Simple
  Quest route les mises à jour des non-propriétaires par un **socket MJ**
  (donc MJ en ligne requis), que posséder le journal évite. Faits utiles
  sur Simple Quest 5.1.4 (bundlé) : le corps ET les objectifs d'une quête
  = `text.content` standard de la page (les htmlFields description/
  objectives du module.json sont un vestige) ; `objectiveState` = { slug:
  0|1|2 } avec slug = `text.trim().slice(0,50).slugify({strict:true})` ;
  statuts -1/0/1/2 = Undiscovered/In Progress/Completed/Failed ; l'app
  liste les journaux sous son dossier racine (dossier « Simple Quest » →
  sous-dossier Quests). Vérifié en jeu (compte test : refus propre sans
  journal possédé, give idempotent, objectif coché au bon slug, statuts).
  Monde de test : modèle « La cave du Green Ocean » dans « Modèles de
  quêtes (dialogues) », log « Quêtes — Charline meyer ».

- **Condition d'entrée par nœud (v0.6.0, 2026-08-21)** : champ
  `system.condition` sur la PAGE (pas le choix) — `firstDialoguePage()`
  prend le premier nœud (ordre `sort`) dont la condition passe, repli sur
  le tout premier. Usage canonique : intro alternative au retour
  (`visited:ID` sur un nœud placé avant l'accueil). Exemple vivant : « 0.
  Accueil (retour) » (sort -100000) dans le journal de Ruby. Vérifié en
  jeu (1ʳᵉ ouverture → « 1. Accueil », réouverture → « 0. Accueil
  (retour) »).

- **Jet de SAN + objets (v0.7.0, 2026-08-21)** : champ `san` (« 0/1d4 »,
  `check.js#rollSanLoss` — perte appliquée via `actor.setSan()` du système,
  qui gère bornes et règle pulp ; un échec ne ferme PAS le dialogue,
  contrairement au jet de compétence — failTarget sinon continuation) et
  champ `items` (`take:Nom` / `give:Nom|UUID`, `scripts/items.js`) +
  jeton de condition `item:Nom` dans `state.js`. BREAKING intentionnel
  0.7.0 : `splitTerms` ne coupe plus sur les espaces (virgule/point-virgule
  seulement) pour autoriser les noms d'objets à espaces. Piège de test :
  lire `actor.system.…` juste après un update dans le même bloc peut
  renvoyer une valeur rassie — vérifier via `_source` ou relire plus tard.

- **Jet raté = définitif (v0.7.1, 2026-08-21, demande explicite du MJ)** :
  un échec de `check` pose la var interne `_jet_<pageId>_<index>` et le
  choix est filtré de l'affichage tant qu'elle existe (resetState la purge
  avec le reste). Caveat : la clé utilise l'INDEX du choix — réordonner les
  choix d'un nœud après coup orpheline les marques. Ne s'applique qu'aux
  jets de compétence (pas au mot de passe — retry immédiat voulu —, pas au
  paiement — on peut revenir plus riche —, pas à la SAN — pas un portail).

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
