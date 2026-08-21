# CoC7 Dialogues

Dialogues de PNJ à embranchements pour Foundry VTT (Call of Cthulhu 7e),
pensés pour les scènes en **théâtre de l'esprit** : pas de token, les
joueurs cliquent sur une **Région** de la scène et le dialogue s'ouvre en
plein écran — portrait détouré du PNJ à gauche, scène floutée derrière,
répliques et choix à droite. Tout tourne côté client : les joueurs peuvent
parler aux PNJ **même quand le Gardien n'est pas connecté**.

Foundry v13 minimum, testé sur v14.

## Mise en place (Gardien)

1. **Écrire le dialogue** dans un journal : créer des pages de type
   **« Nœud de dialogue »** (nouveau type proposé dans le menu « Créer une
   page »). Une page = un nœud : la réplique du PNJ (éditeur riche,
   enrichers `@UUID` OK) + la liste des choix, chacun menant à une autre
   page du même journal (menu déroulant) ou à « Fin du dialogue ». Le
   dialogue démarre sur la **première** page « Nœud de dialogue » du
   journal (dans l'ordre des pages) — badge « Nœud de départ » sur sa
   fiche. Le bouton **« Tester d'ici »** joue le dialogue à partir du nœud
   ouvert.
2. Donner aux joueurs la permission **Observateur** sur ce journal, puis —
   réglage recommandé, anti-spoil — passer **chaque page** à **« Aucun »**
   (clic droit sur la page → Configurer la propriété, ou onglet Propriété
   de la page). Résultat vérifié en jeu : le journal apparaît dans l'onglet
   Journaux mais s'ouvre **vide** pour les joueurs (aucune branche, aucune
   condition lisible), alors que le dialogue **se joue normalement** — le
   module ne vérifie la permission qu'au niveau du journal, et Foundry
   envoie de toute façon les pages au client, la permission par page ne
   filtrant que l'affichage. On peut aussi laisser le nœud d'accueil en
   « Hériter » pour servir de teaser. Limite honnête : les données étant
   côté client, un joueur qui fouille la console F12 peut techniquement
   tout lire — inévitable pour un module 100 % client-side sans MJ
   connecté.
3. **Sur la scène**, dessiner une Région (calque Régions) autour du PNJ
   décoratif, puis lui ajouter un comportement de type **« Dialogue (PNJ
   cliquable) »** : journal de dialogue (glisser-déposer), nom du PNJ,
   portrait (PNG détouré, fond transparent), mode de surbrillance (survol /
   toujours / jamais), couleur.
4. C'est tout : chaque utilisateur qui clique dans la région (calque Tokens
   actif, ou n'importe quel calque pour un joueur) ouvre le dialogue chez
   lui, en local.

## Fonction annexe : « Macro au clic »

Second comportement de région fourni par le module, indépendant des
dialogues : un clic dans la région **exécute une macro** (script ou chat)
sur le client de l'utilisateur qui clique — y compris pour un joueur
**sans aucune permission sur la macro** (elle peut même rester invisible
dans son répertoire de macros). Contrairement au comportement « Exécuter
une macro » du cœur de Foundry, aucun token n'est nécessaire : c'est fait
pour le théâtre de l'esprit (un levier, un gramophone, une porte à
examiner…).

Config : macro (glisser-déposer), libellé au survol (vide = nom de la
région), surbrillance et couleur (mêmes options que le dialogue). Dans une
macro script, `scope.behavior` et `scope.region` donnent le contexte du
clic ; `speaker`/`actor`/`character` sont remplis comme pour une macro
normale.

À savoir : la macro s'exécute **avec les droits du joueur** qui clique —
un script qui tente de modifier un document que le joueur n'a pas le droit
de toucher échouera comme s'il avait lancé la macro lui-même. Prévoir les
macros en conséquence (effets locaux : sons, messages, flags sur son
propre user/acteur…).

### Exemple : jukebox à bascule (testé en jeu)

Le pattern de référence pour ce genre de macro : tout se joue **en local**
(aucune écriture de document, donc aucun problème de permission), et la
coupure de la musique du MJ n'est que locale — l'état du document Playlist
restant intact, `PlaylistSound#sync()` permet de la faire **reprendre** au
re-clic. Ici sur une région « Gramophone » d'un speakeasy : premier clic,
fondu sortant sur la musique en cours et fondu entrant sur une piste au
hasard de la playlist ; re-clic, le jukebox se tait et la musique lancée
globalement par le Gardien reprend (avec le fondu de 500 ms de `sync()`,
soit un enchaînement croisé).

```js
// BASCULE jukebox — 100 % LOCAL au joueur qui clique (aucune permission
// requise, fonctionne sans MJ connecté).
const TARGET = 'Playlist.XXXXXXXXXXXXXXXX'; // UUID de la playlist (clic droit sur la playlist → copier l'identifiant)
const FADE_IN = 1500;   // ms
const FADE_OUT = 1200;  // ms

// Déjà en train de jouer via cette macro ? → fondu sortant, restauration
// de la musique globale du MJ s'il y en a une, et on s'arrête là.
const wasPlaying = (globalThis.speakeasyMusic ?? []).some(s => s.playing);
for (const snd of (globalThis.speakeasyMusic ?? [])) snd.stop({ fade: FADE_OUT, volume: 0 });
globalThis.speakeasyMusic = [];
if (wasPlaying) {
  let restored = false;
  for (const p of game.playlists.playing) for (const s of p.sounds) {
    if (s.playing) { s.sync(); restored = true; }
  }
  return ui.notifications.info(restored
    ? '🎷 Le gramophone se tait — la musique de la salle reprend.'
    : '🎷 Le gramophone se tait.');
}

// Fondu sortant sur toute autre musique de playlist en cours (localement)
for (const p of game.playlists) for (const s of p.sounds) {
  if (s.sound?.playing) s.sound.stop({ fade: FADE_OUT, volume: 0 });
}

// Lancer la playlist cible en local (une piste au hasard, en boucle),
// départ à volume 0 puis fondu entrant vers le volume de la piste.
const pl = await fromUuid(TARGET);
if (!pl) return ui.notifications.warn('Playlist introuvable.');
const tracks = pl.sounds.contents;
if (!tracks.length) return ui.notifications.warn('Playlist vide.');
const t = tracks[Math.floor(Math.random() * tracks.length)];
const snd = await foundry.audio.AudioHelper.play({ src: t.path, volume: 0, loop: t.repeat, channel: 'music' }, false);
if (snd) {
  globalThis.speakeasyMusic.push(snd);
  snd.fade(t.volume, { duration: FADE_IN, from: 0 });
}
ui.notifications.info(`🎷 ${pl.name} — ${t.name}`);
```

Notes : la bascule se fonde sur l'état réel du son (`playing`), pas sur un
booléen — si la piste s'est arrêtée autrement, le clic suivant relance au
lieu de « couper dans le vide ». Le canal `music` fait suivre le curseur
de volume Musique du joueur. Cette macro reproduit le mode *aléatoire*
d'une playlist de pistes en boucle ; pour un mode séquentiel il faudrait
enchaîner les pistes via l'événement `end` du son.

## Placeholders

Dans les répliques comme dans les réponses :

| Placeholder | Résultat |
|---|---|
| `{nom}` / `{name}` | nom complet de l'investigateur |
| `{prenom}` / `{firstname}` | premier mot du nom |
| `{nomdefamille}` / `{lastname}` | dernier mot du nom |
| `{titre}` / `{title}` | Monsieur / Madame (rien si genre inconnu) |
| `{il|elle}`, `{cher|chère}` | forme masculine \| féminine |
| `{m|f|neutre}` | 3ᵉ forme utilisée quand le genre est inconnu |

L'investigateur = `game.user.character` (le personnage assigné au joueur),
sinon le premier token contrôlé, sinon « Investigateur » neutre. Le genre
vient du champ **Sexe** de la fiche CoC7 (`system.infos.sex`, texte libre :
`F`, `Femme`, `Female`… → féminin ; `M`, `H`, `Homme`, `Male`… → masculin ;
autre → inconnu).

## Conditions et variables

Chaque choix a deux champs texte optionnels (termes séparés par des
virgules) :

- **Condition** — le choix n'apparaît que si tous les termes sont vrais :
  `clef` (variable définie), `!clef` (non définie), `visited:ID` /
  `!visited:ID` (le nœud dont la page a l'identifiant `ID` a déjà été vu ;
  `ID` = identifiant de la page — l'UUID complet marche aussi).
- **Définit** — appliqué au clic : `clef` définit la variable, `!clef` la
  retire.

Un nœud **sans aucun choix** (ou dont tous les choix sont masqués par
leurs conditions) affiche un bouton « Prendre congé ».

## Mot de passe, argent et jets de compétence (par choix)

Chaque choix a des champs avancés supplémentaires (sous-ligne dans
l'éditeur) :

- **Mot attendu** — si rempli, cliquer le choix ouvre une **saisie de
  texte** dans l'overlay (« Votre réponse… ») au lieu de brancher
  directement : le PNJ demande un mot de passe, un nom, un indice…
  Comparaison sans casse, sans accents, espaces normalisés ; plusieurs
  réponses acceptées en les séparant par `|` (ou virgule). Bonne réponse →
  « Mène à » ; mauvaise → « En cas d'échec », ou nouvelle tentative
  (secousse de l'input) si ce champ est vide. Une icône clé signale ces
  choix au joueur ; Entrée valide, Échap se ravise.
- **Coût** (en $) — prélevé via **CoC7 Ledger** (0.6.0+ requis, relation
  `recommends` du manifest) dans l'ordre **Dépenses courantes → Espèces →
  Capital**, tout ou rien : si les trois réunis ne couvrent pas le prix,
  rien n'est débité et le choix bascule vers « En cas d'échec » (ou ne fait
  rien si vide). Le montant s'affiche en badge sur le bouton, et chaque
  paiement laisse une trace dans le chat (« *Untel* paie **N $** … »). Sans
  le ledger actif, les choix payants refusent proprement. « Définit » n'est
  appliqué que si le paiement (et/ou le mot) réussit.
- **Jet de compétence** 🎲 — le nom d'une compétence de la fiche (tel
  qu'il y apparaît : « Psychology » sur une fiche anglaise, « Psychologie »
  sur une française — accents et casse ignorés), d'une caractéristique
  (`FOR`/`STR`, `DEX`, `POU`/`POW`…), de la `Chance` ou de la `SAN`, plus
  une **difficulté** (Normale = valeur, Difficile = moitié, Extrême =
  cinquième). Le module lance un vrai d100 Foundry (carte de chat, animé
  par Dice So Nice) : 1 = critique, 96-100 (100 si valeur ≥ 50) =
  maladresse. Le résultat s'affiche en bannière dans le dialogue
  (« Psychology — 2 / 45 : Réussite ») puis : réussite → « Mène à »,
  échec → « En cas d'échec » — ou **fermeture du dialogue** si ce champ est
  vide (pas de re-tentative en spammant le choix). Le jet a lieu *après* le
  paiement éventuel (on paie pour tenter). Nom introuvable sur la fiche →
  avertissement, rien ne se passe.
- **En cas d'échec** — le nœud de repli commun aux trois mécanismes.

Tout reste côté client : le joueur paie et lance ses dés depuis son propre
acteur, aucune permission ni MJ nécessaires. Le jet est rendu par le
module lui-même (d100 contre seuil), pas par la fenêtre de jet du système
CoC7 — donc pas de dés bonus/malus ni de relance forcée (push) dans les
dialogues, par choix.

## Où vivent les données

- Le contenu (nœuds, choix) : dans les pages de journal, champ `system`
  (`text`, `speaker`, `portrait`,
  `choices[]{label,target,condition,set,answer,cost,check,checkDifficulty,failTarget}`).
- La config du PNJ : dans le `RegionBehavior` de type
  `coc7-dialogues.dialogue` (`system.journal` UUID, `speaker`, `portrait`,
  `highlight`, `color`).
- L'état par joueur : `flags.coc7-dialogues.visited` (compteur par UUID de
  page, points remplacés par `_`) et `flags.coc7-dialogues.vars` (`{clef:
  true}`) sur **l'acteur du joueur** (ou sur son User s'il n'a pas de
  personnage). Lisible/réinitialisable via le connecteur MCP
  (`get-actor` / `update-actor`) ou `game.modules.get("coc7-dialogues").api.resetState()`.

## Réglages (par client)

Flou de la scène, effet machine à écrire, vitesse d'écriture. Pendant la
frappe : Espace/Entrée ou clic sur le texte affiche tout ; touches `1`–`9`
choisissent une réponse ; `Échap` ferme.

## API (`game.modules.get("coc7-dialogues").api`)

`openDialogue(journal, {speaker, portrait, startPageId})`,
`openDialogueFromBehavior(behavior)`, `getDialogueRegions()`,
`getClickableRegions()`, `executeClickMacro(behavior)`,
`applyPlaceholders(text, describeActor(actor))`, `getVars()`, `getVisited()`,
`resetState()`, `applySet(directive)`, `checkCondition(directive, journal)`.

## Limites connues / pistes V2

- Le dialogue est local à l'utilisateur qui clique ; pas de mode « le
  Gardien projette le dialogue à tous ».
- Un seul dialogue par région (le premier comportement « Dialogue » actif).
