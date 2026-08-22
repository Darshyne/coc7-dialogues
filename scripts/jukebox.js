/**
 * Jukebox — a per-player, local music player driven by a Playlist
 * document, without touching that document (so no permission needed, no
 * GM needed). Replaces the old "speakeasy" macro pattern.
 *
 * Rules (as specified by the Keeper):
 *   - starting a jukebox fades out the table's MUSIC channel only (playlist
 *     sounds whose effective channel is "music"): environment/ambience and
 *     interface sounds are left alone;
 *   - the jukebox itself plays on the INTERFACE channel, so each player
 *     can raise/lower it with their Interface volume slider independently
 *     of the Keeper's music;
 *   - stopping it re-syncs whatever playlists the documents say are
 *     playing, so the Keeper's music comes back;
 *   - the state is published in the player's own User flags
 *     (flags.coc7-dialogues.jukebox) so the Keeper can list who is
 *     listening to what — cleared on stop, and on reload (audio can't
 *     survive a reload anyway);
 *   - activating a scene (GM) stops every jukebox at the table.
 *
 * Playback modes mirror the playlist's: sequential (in order, looping),
 * shuffle (random, never twice in a row), simultaneous (all at once);
 * per-track `repeat` loops that track.
 *
 * Entry points: api.jukebox.{start,stop,toggle,isPlaying,status,listActive}
 * and the "ARK — Jukebox" region behavior (click = toggle).
 */

import { MODULE_ID } from './constants.js';

const FLAG = 'jukebox';
const FADE_IN = 1500;
const FADE_OUT = 1200;

/** Local playback state (null when silent). */
let state = null; // { playlist, sounds: Set<Sound>, order: PlaylistSound[], index, token }

const fields = foundry.data.fields;

/* -------------------------------------------- */
/*  Region behavior                             */
/* -------------------------------------------- */

export class JukeboxBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static LOCALIZATION_PREFIXES = ['COC7DIALOGUES.JukeboxBehavior'];

  static defineSchema() {
    return {
      playlist: new fields.DocumentUUIDField({ type: 'Playlist', required: true, blank: false, nullable: true, initial: null }),
      label: new fields.StringField({ required: true, blank: true, initial: '' }),
      highlight: new fields.StringField({
        required: true, blank: false, initial: 'hover',
        choices: {
          hover: 'COC7DIALOGUES.Behavior.FIELDS.highlight.choices.hover',
          always: 'COC7DIALOGUES.Behavior.FIELDS.highlight.choices.always',
          never: 'COC7DIALOGUES.Behavior.FIELDS.highlight.choices.never'
        }
      }),
      color: new fields.ColorField({ required: false, nullable: true, initial: null })
    };
  }

  static events = {};

  get displayName() {
    if ( this.label ) return this.label;
    const pl = this.playlist ? fromUuidSync(this.playlist) : null;
    return pl?.name ?? this.region?.name ?? '';
  }
}

/** Click handler for the behavior. */
export async function executeJukebox(behavior) {
  const uuid = behavior.system.playlist;
  if ( !uuid ) return ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.NoPlaylist'));
  return toggle(uuid);
}

/* -------------------------------------------- */
/*  Engine                                      */
/* -------------------------------------------- */

/** Effective channel of a PlaylistSound. */
function channelOf(sound) {
  return (sound.channel || sound.parent?.channel) ?? 'music';
}

/** Is a jukebox currently playing on this client? */
export function isPlaying() {
  return !!state && [...state.sounds].some(s => s.playing);
}

/** Current status for this client, or null. */
export function status() {
  if ( !state ) return null;
  const current = state.order[state.index];
  return { playlist: state.playlist.name, uuid: state.playlist.uuid, track: current?.name ?? null };
}

/**
 * Start (or restart) the jukebox on a playlist.
 * @param {string|Playlist} playlistOrUuid
 */
export async function start(playlistOrUuid) {
  const playlist = typeof playlistOrUuid === 'string' ? await fromUuid(playlistOrUuid) : playlistOrUuid;
  if ( !playlist || playlist.documentName !== 'Playlist' ) {
    return ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.NoPlaylist'));
  }
  const tracks = playlist.sounds.contents.sort((a, b) => a.sort - b.sort);
  if ( !tracks.length ) return ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.EmptyPlaylist'));

  await stopLocal({ resync: false });

  // Fade out the table's music channel — locally, without touching documents.
  for ( const p of game.playlists ) for ( const s of p.sounds ) {
    if ( s.sound?.playing && channelOf(s) === 'music' ) s.sound.stop({ fade: FADE_OUT, volume: 0 });
  }

  const token = Symbol('jukebox');
  state = { playlist, sounds: new Set(), order: tracks, index: -1, token };

  const M = CONST.PLAYLIST_MODES;
  if ( playlist.mode === M.SIMULTANEOUS ) {
    for ( const t of tracks ) await playTrack(t, token, tracks.indexOf(t));
  } else {
    await playNext(token, null);
  }
  await publish();
  const s = status();
  ui.notifications.info(game.i18n.format('COC7DIALOGUES.Info.JukeboxOn', { playlist: s.playlist, track: s.track ?? '' }));
}

async function playNext(token, prev) {
  if ( !state || state.token !== token ) return;
  const M = CONST.PLAYLIST_MODES;
  const { order, playlist } = state;
  let next;
  if ( playlist.mode === M.SHUFFLE ) {
    const pool = order.length > 1 ? order.filter(t => t !== prev) : order;
    next = pool[Math.floor(Math.random() * pool.length)];
  } else {
    next = order[(order.indexOf(prev) + 1) % order.length]; // sequential, looping
  }
  state.index = order.indexOf(next);
  await playTrack(next, token, state.index);
}

async function playTrack(track, token, index) {
  const snd = await foundry.audio.AudioHelper.play({
    src: track.path, volume: 0, loop: track.repeat, channel: 'interface'
  }, false);
  if ( !snd ) return;
  if ( !state || state.token !== token ) { snd.stop(); return; }
  state.sounds.add(snd);
  state.index = index;
  snd.fade(track.volume, { duration: FADE_IN, from: 0 });
  if ( !track.repeat && state.playlist.mode !== CONST.PLAYLIST_MODES.SIMULTANEOUS ) {
    snd.addEventListener('end', () => {
      if ( state?.token === token && state.sounds.has(snd) ) {
        state.sounds.delete(snd);
        playNext(token, track).then(publish);
      }
    }, { once: true });
  }
}

/**
 * Stop the local jukebox (fade) and bring the Keeper's music back.
 * @param {object} [options]
 * @param {boolean} [options.resync=true]   re-sync document-playing playlists
 * @param {boolean} [options.silent=false]  no notification
 */
export async function stop({ resync = true, silent = false } = {}) {
  const was = isPlaying();
  const restored = await stopLocal({ resync });
  if ( was && !silent ) {
    ui.notifications.info(game.i18n.localize(restored ? 'COC7DIALOGUES.Info.JukeboxOffResumed' : 'COC7DIALOGUES.Info.JukeboxOff'));
  }
  return was;
}

async function stopLocal({ resync }) {
  if ( state ) {
    for ( const snd of state.sounds ) snd.stop({ fade: FADE_OUT, volume: 0 });
    state = null;
  }
  await unpublish();
  let restored = false;
  if ( resync ) {
    for ( const p of game.playlists.playing ) for ( const s of p.sounds ) {
      if ( s.playing ) { s.sync(); restored = true; }
    }
  }
  return restored;
}

/** Toggle: stop if this playlist (or any) is playing, else start it. */
export async function toggle(playlistOrUuid) {
  if ( isPlaying() ) return stop();
  return start(playlistOrUuid);
}

/* -------------------------------------------- */
/*  Published state (User flags)                */
/* -------------------------------------------- */

async function publish() {
  const s = status();
  if ( !s ) return;
  try { await game.user.setFlag(MODULE_ID, FLAG, { ...s, since: Date.now() }); }
  catch(err) { console.warn(`${MODULE_ID} | jukebox flag:`, err); }
}

async function unpublish() {
  if ( game.user.getFlag(MODULE_ID, FLAG) === undefined ) return;
  try { await game.user.unsetFlag(MODULE_ID, FLAG); }
  catch(err) { console.warn(`${MODULE_ID} | jukebox flag:`, err); }
}

/** Every user currently publishing a jukebox (GM helper). */
export function listActive() {
  return game.users.contents
    .map(u => ({ user: u, jukebox: u.getFlag(MODULE_ID, FLAG) }))
    .filter(e => e.jukebox && e.user.active)
    .map(e => ({ userName: e.user.name, characterName: e.user.character?.name ?? null, ...e.jukebox }));
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

export function registerJukeboxHooks() {
  // Audio never survives a reload: drop any stale published state.
  Hooks.once('ready', () => { unpublish(); });
  // The Keeper activating a scene ends every jukebox at the table.
  Hooks.on('updateScene', (scene, changes) => {
    if ( changes.active === true && isPlaying() ) stop({ silent: false });
  });
}
