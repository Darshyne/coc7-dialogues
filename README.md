# CoC7 Dialogues

Dialogues de PNJ à embranchements pour Foundry VTT (Call of Cthulhu 7e),
pensés pour les scènes en **théâtre de l'esprit** : pas de token, les
joueurs cliquent sur une **Région** de la scène et le dialogue s'ouvre en
plein écran — portrait détouré du PNJ à gauche, scène floutée derrière,
répliques et choix à droite. Tout tourne côté client : les joueurs peuvent
parler aux PNJ **même quand le Gardien n'est pas connecté**.

Foundry v13 minimum, testé sur v14.

**Installation** : dans Foundry (ou The Forge), « Installer un module » →
URL de manifest :

```
https://github.com/Darshyne/coc7-dialogues/releases/latest/download/module.json
```

Les mises à jour sont ensuite proposées automatiquement (chaque tag
`vX.Y.Z` du dépôt publie une release). Licence MIT.

## Mise en place (Gardien)

1. **Écrire le dialogue** dans un journal : créer des pages de type
   **« Nœud de dialogue »** (nouveau type proposé dans le menu « Créer une
   page »). Une page = un nœud : la réplique du PNJ (éditeur riche,
   enrichers `@UUID` OK) + la liste des choix, chacun menant à une autre
   page du même journal (menu déroulant) ou à « Fin du dialogue ». Le
   dialogue démarre sur la première page « Nœud de dialogue » dont la
   **condition d'entrée** passe (dans l'ordre des pages ; vide = toujours
   valable) — badge « Nœud de départ » sur la première. Le bouton **« Tester d'ici »** joue le dialogue à partir du nœud
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

## Compendium de macros livré (v0.11.0)

Le module embarque un compendium **« ARK — Macros (dialogues & jukebox) »**
(onglet Compendiums) à importer dans le monde :

- **ARK — Jukebox : choisir une playlist** (joueurs) — bascule le jukebox
  local : s'il joue, le coupe ; sinon propose une playlist et un mode.
- **ARK — Jukebox : qui écoute quoi ? (MJ)** — chuchote au Gardien la liste
  des joueurs connectés avec un jukebox en cours (playlist, piste).
- **ARK — Tous à la playlist du MJ (MJ)** — coupe tous les jukebox de la
  table et fait reprendre la musique du Gardien.
- **ARK — Dialogues : reset (test)** — remet à zéro la mémoire de dialogues
  et les quêtes données pour l'utilisateur qui clique.

Les macros joueurs sont importées avec la permission Observateur par défaut.
Source : `build/src/macros/macros.json`, compilé par
`build/build-packs.mjs` (voir ce fichier ; Foundry ne doit pas tenir le
pack ouvert pendant la compilation).

## Outil d'auteur : tuile → région de dialogue (v0.12.0)

Pose ton PNJ détouré comme **tuile** sur la scène, sélectionne-la, puis
clique le bouton 💬 du HUD de tuile (ou la macro « ARK — Tuile → région de
dialogue ») : le module **trace le contour visible** de l'image (alpha),
crée une région de cette forme exacte, lui attache **ARK — Dialogue** et
reprend l'image de la tuile comme **portrait** du PNJ. La petite fenêtre
demande le journal de dialogue (facultatif — la config du behavior s'ouvre
ensuite), le nom du PNJ (déduit du nom de fichier) et la surbrillance.
Ancre, échelle, miroir, rotation et mode d'ajustement de la tuile sont
respectés (la projection passe par la transformation réelle du mesh).
Si l'image n'est pas lisible (vidéo, image distante sans CORS), repli sur
l'emprise rectangulaire, comme le fait Baileywiki Better Levels. Plusieurs
tuiles sélectionnées = une région chacune, nommées d'après leur fichier.

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

## Fonction annexe : « Vers une scène (clic) »

Troisième comportement de région : un clic emmène **l'utilisateur qui
clique** sur la scène choisie — sans token, joueurs compris, même si la
scène n'est pas dans leur barre de navigation (une porte, un escalier, le
plan de la ville…). Le système CoC7 fournit déjà un behavior équivalent
(« Chaosium Canvas Interface → To Scene ») ; celui-ci apporte ce qui lui
manque côté interface : la **surbrillance** (survol / toujours / jamais),
le **libellé au survol** (vide = nom de la scène) et le curseur main,
partagés avec les deux autres behaviors du module.

Option Gardien : « Activer pour toute la table » — quand c'est le Gardien
qui clique, la scène est activée pour tous au lieu d'être vue seul (sans
effet pour un joueur).

## Fonction annexe : « Jukebox » (v0.10.0)

Quatrième comportement de région, **ARK — Jukebox** : un clic lance (ou
coupe, re-clic) chez l'utilisateur qui clique un lecteur local sur la
playlist choisie (glisser-déposer), sans toucher au document Playlist —
donc sans permission et sans Gardien. Règles :

- démarrer le jukebox coupe en fondu la musique de la table **sur le canal
  Musique uniquement** — les sons d'environnement et d'interface
  continuent ;
- le jukebox joue sur le **canal Interface** : chaque joueur le règle avec
  son curseur Interface, indépendamment de la musique du Gardien ;
- le mode de la playlist est respecté (séquentiel en boucle, aléatoire sans
  répétition immédiate, simultané), ainsi que la boucle par piste — et la
  région peut le **surcharger** (champ « Mode de lecture » : celui de la
  playlist / séquentiel / aléatoire / simultané), pratique pour réutiliser
  une même playlist avec une ambiance différente selon le lieu ;
- l'arrêt (re-clic, macro, ou **activation d'une scène par le Gardien**,
  qui coupe tous les jukebox de la table) resynchronise la musique que les
  documents déclarent en lecture — celle du Gardien reprend ;
- l'état est publié dans les flags du joueur (`flags.coc7-dialogues.jukebox`),
  effacé à l'arrêt et au rechargement.

API (`game.modules.get('coc7-dialogues').api.jukebox`) : `start(playlistOuUuid)`,
`stop()`, `toggle(playlistOuUuid)`, `isPlaying()`, `status()`,
`listActive()`. Macros Gardien typiques :

```js
// Qui écoute quoi ?
const l = game.modules.get('coc7-dialogues').api.jukebox.listActive();
ui.notifications.info(l.length ? l.map(e => `${e.characterName ?? e.userName} : ${e.playlist} — ${e.track}`).join(' | ') : 'Aucun jukebox en cours.');
```

```js
// Tout couper et revenir à la musique du Gardien, pour toute la table
game.modules.get('coc7-dialogues').api.resyncMusicForEveryone();
```

### Exemple historique : jukebox à bascule en macro (avant v0.10.0)

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

## Mise en place des quêtes (Simple Quest requis)

1. Le Gardien écrit ses **quêtes modèles** (pages « Quest ») dans un
   journal dédié — par ex. « Modèles de quêtes (dialogues) » dans le
   dossier Quests de Simple Quest — laissé en permission **« Aucun »**
   (contrairement aux journaux de dialogue, aucune permission n'est
   nécessaire : les directives lisent les données du monde déjà présentes
   côté client, et le journal reste totalement invisible pour les joueurs,
   y compris dans la section « Undiscovered » de Simple Quest — vérifié en
   jeu). Les objectifs sont les puces de liste du texte de la page.
   Attention à ne pas laisser d'exception de permission par joueur sur ces
   pages : « Hériter » sur un journal Observateur les rendrait visibles.
2. Chaque joueur a besoin d'un **journal de quêtes dont il est
   propriétaire** — c'est ce qui permet au dialogue d'écrire dedans sans
   MJ connecté (Simple Quest fait passer les joueurs non-propriétaires par
   un relais MJ). Deux façons : le module le crée tout seul au premier
   `give` si les joueurs ont la permission « Créer des journaux » ; sinon
   le Gardien le crée une fois — nom `Quêtes — {nom du personnage}` (ou
   n'importe quel nom via
   `api.createQuestLogFor(user)` / `api.createQuestLogFor(user, journal)`
   qui pose le flag de reconnaissance), joueur propriétaire, rangé dans le
   dossier Quests pour apparaître dans l'app Simple Quest.
3. Chaque joueur voit alors **ses** quêtes dans Simple Quest, le Gardien
   voit tout.

## Resynchroniser la musique de toute la table (Gardien)

Le jukebox (macro « Macro au clic ») est local à chaque joueur — pour le
couper **chez tout le monde** et faire reprendre la playlist du Gardien,
le module expose (v0.8.0, seul usage du socket) :

```js
game.modules.get('coc7-dialogues').api.resyncMusicForEveryone();
```

Chaque client coupe en fondu tout son du canal Musique non géré par une
playlist, puis resynchronise les playlists que les documents déclarent en
lecture. Réservé au Gardien (vérifié à la réception).

## Macro de reset (test)

Pour rejouer un dialogue de zéro pendant l'écriture, une macro script à
mettre à disposition des joueurs (permission Observateur) :

```js
// RESET des dialogues pour l'utilisateur qui clique (test/debug) :
// mémoire (variables + nœuds visités) + quêtes données par des dialogues.
const api = game.modules.get('coc7-dialogues').api;
await api.resetState();
const log = api.findQuestLog();
let removed = 0;
if (log) {
  const given = log.pages.filter(p => p.getFlag('coc7-dialogues', 'questSource'));
  removed = given.length;
  if (removed) await log.deleteEmbeddedDocuments('JournalEntryPage', given.map(p => p.id));
}
ui.notifications.info(`🧹 Dialogues remis à zéro pour ${game.user.name}` +
  (removed ? ` (${removed} quête(s) retirée(s)).` : '.'));
```

Ne touche que l'utilisateur qui la lance ; l'argent dépensé n'est pas
remboursé (réajustable via le Registre du ledger).

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

Chaque **nœud** a aussi sa propre **condition d'entrée** (même syntaxe) :
au lancement, le dialogue démarre sur le **premier nœud (dans l'ordre des
pages) dont la condition passe** — vide = toujours valable. C'est ainsi
qu'on change l'intro au retour du joueur : un nœud « Accueil (retour) »
avec `visited:ID_de_l'accueil`, placé **avant** l'accueil normal, prend
la main dès la deuxième visite (vérifié en jeu sur le dialogue de Ruby).

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
  paiement éventuel (on paie pour tenter). **Un jet raté est définitif** :
  le choix n'est plus jamais proposé à ce joueur (marqué par une variable
  interne `_jet_…`, effacée par `resetState()` / la macro de reset comme le
  reste de la mémoire). Nom introuvable sur la fiche → avertissement, rien
  ne se passe.
- **Quête (Simple Quest)** 📜 — directives appliquées en cas de succès du
  choix, séparées par `;` :
  - `give:UUID` — donne la quête au joueur : la page de quête **modèle**
    (type « Quest » de Simple Quest, UUID par clic droit → Copier
    l'identifiant) est copiée dans **son** journal de quêtes, statut
    « En cours ». Idempotent : une quête déjà donnée ne l'est pas deux fois.
  - `status:UUID|done` (aussi `failed`, `progress`, `hidden`) — change le
    statut de la quête du joueur issue de ce modèle.
  - `objective:UUID|texte de l'objectif|done` (aussi `undone`, `failed`) —
    coche un objectif (une ligne de liste du texte de la quête), identifié
    par son texte exactement comme le fait Simple Quest.
  L'UUID est **toujours celui du modèle** — la copie du joueur est
  retrouvée via un flag posé au `give`.
- **Jet de SAN** 🧠 — format « perte réussite/perte échec » (ex. `0/1d4`) :
  d100 contre la SAN actuelle, la formule correspondante est retirée via le
  `setSan()` du système (bornes, règle pulp). Contrairement au jet de
  compétence, un échec ne ferme PAS le dialogue : il bascule vers « En cas
  d'échec » si renseigné, sinon la conversation continue (secoué, mais
  présent). Jet + perte dans le chat et en bannière.
- **Objets** 👜 — en condition de choix : `item:Nom` / `!item:Nom` (le
  choix n'apparaît que si l'objet est — ou non — dans l'inventaire) ; en
  directives (appliquées en cas de succès, séparées par `;`) : `take:Nom`
  (retire 1 exemplaire — remettre l'objet de quête au PNJ) et
  `give:Nom ou UUID` (reçoit une copie d'un objet du monde/compendium).
  Noms insensibles aux accents/casse. Depuis 0.7.0 les termes de condition
  sont séparés par des virgules UNIQUEMENT (les noms d'objets peuvent
  contenir des espaces).
- **En cas d'échec** — le nœud de repli commun aux mécanismes ci-dessus.

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
