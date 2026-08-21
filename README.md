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

## Où vivent les données

- Le contenu (nœuds, choix) : dans les pages de journal, champ `system`
  (`text`, `speaker`, `portrait`, `choices[]{label,target,condition,set}`).
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

- Pas encore de jets de compétence dans les choix (ex. « [Persuasion] … »
  qui branche sur succès/échec) — prévu.
- Le dialogue est local à l'utilisateur qui clique ; pas de mode « le
  Gardien projette le dialogue à tous ».
- Un seul dialogue par région (le premier comportement « Dialogue » actif).
