/**
 * "Everyone back to the Keeper's music": the one deliberate exception to
 * the module's no-socket rule. Local jukebox sounds (AudioHelper.play on
 * the music channel — e.g. the speakeasy gramophone macro) exist only on
 * each player's client, so silencing them table-wide needs a broadcast.
 *
 * The GM calls api.resyncMusicForEveryone(): every client (emitter
 * included) stops all UNMANAGED music-channel sounds (anything not owned
 * by a PlaylistSound) with a fade, then re-syncs whatever playlists the
 * documents say are playing — i.e. the Keeper's current music comes back
 * everywhere.
 */

import { MODULE_ID } from './constants.js';
import { stop as stopJukebox } from './jukebox.js';

const SOCKET = `module.${MODULE_ID}`;

/** Register the socket listener (call once, at ready). */
export function registerMusicSocket() {
  game.socket.on(SOCKET, data => {
    if ( data?.action !== 'resyncMusic' ) return;
    // Only honor requests initiated by a GM.
    if ( !game.users.get(data.userId)?.isGM ) return;
    resyncLocalMusic({ fade: data.fade });
  });
}

/**
 * Local half: fade out every music-channel sound not managed by a
 * playlist, then re-sync document-playing playlists.
 * @param {object} [options]
 * @param {number} [options.fade=1200]
 */
export function resyncLocalMusic({ fade = 1200 } = {}) {
  stopJukebox({ resync: false, silent: true }); // module jukebox (interface channel) first
  const managed = new Set();
  for ( const p of game.playlists ) for ( const s of p.sounds ) { if ( s.sound ) managed.add(s.sound); }
  for ( const snd of game.audio.playing.values() ) {
    if ( snd.context === game.audio.music && snd.playing && !managed.has(snd) ) {
      snd.stop({ fade, volume: 0 });
    }
  }
  globalThis.speakeasyMusic = []; // the gramophone macro's chain stops re-arming
  let restored = false;
  for ( const p of game.playlists.playing ) for ( const s of p.sounds ) {
    if ( s.playing ) { s.sync(); restored = true; }
  }
  return restored;
}

/**
 * GM side: broadcast to every client and run locally too (module sockets
 * don't echo back to the emitter).
 * @param {object} [options]
 * @param {number} [options.fade=1200]
 */
export function resyncMusicForEveryone({ fade = 1200 } = {}) {
  if ( !game.user.isGM ) {
    return ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.ResyncGMOnly'));
  }
  game.socket.emit(SOCKET, { action: 'resyncMusic', userId: game.user.id, fade });
  const restored = resyncLocalMusic({ fade });
  ui.notifications.info(game.i18n.localize(restored
    ? 'COC7DIALOGUES.Info.ResyncDone' : 'COC7DIALOGUES.Info.ResyncSilence'));
}
