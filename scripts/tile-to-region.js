/**
 * Authoring helper: turn a (cut-out) NPC Tile into a clickable Dialogue
 * Region in one go — region shaped like the tile, "ARK — Dialogue" behavior
 * attached, the tile's image reused as the dialogue portrait.
 *
 * Shape: the visible (alpha) outline of the tile's image is traced
 * (Moore neighbour tracing on a downscaled alpha mask, then Douglas-Peucker
 * simplification) and projected into scene coordinates through the tile
 * mesh's own world transform — so anchor, scale/flip, rotation and fit mode
 * are all honored without re-implementing Foundry's texture math. If the
 * pixels can't be read (video tile, cross-origin image without CORS) we
 * fall back to the tile's rectangular footprint (rotated if need be), the
 * way Baileywiki Better Levels does.
 *
 * Entry points: api.tileToDialogueRegion(tileDoc, options), a button in the
 * Tile HUD, and the compendium macro "ARK — Tuile → région de dialogue".
 */

import { MODULE_ID, BEHAVIOR_TYPE, PAGE_TYPE } from './constants.js';

const MASK_MAX = 256;        // longest side of the alpha mask used for tracing
const ALPHA_THRESHOLD = 48;  // 0-255: pixels above count as "visible"
const SIMPLIFY_EPS = 1.25;   // Douglas-Peucker tolerance, in mask pixels

/* -------------------------------------------- */
/*  Public                                      */
/* -------------------------------------------- */

/**
 * @param {TileDocument} tile
 * @param {object} [options]
 * @param {string|null} [options.journal]   JournalEntry uuid (may be set later in the behavior)
 * @param {string} [options.speaker]        NPC name (default: prettified image file name)
 * @param {string} [options.highlight]      hover | always | never
 * @param {boolean} [options.trace=true]    trace the alpha outline (false = footprint rectangle)
 * @param {boolean} [options.openSheet=true] open the behavior config afterwards
 * @returns {Promise<RegionDocument|null>}
 */
export async function tileToDialogueRegion(tile, { journal = null, speaker = '', highlight = 'hover', trace = true, openSheet = true } = {}) {
  if ( !game.user.isGM ) return ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.TileGMOnly'));
  if ( !tile?.object || tile.parent !== canvas.scene ) {
    return ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.TileNotOnCanvas'));
  }
  let points = null, traced = false;
  if ( trace ) {
    try { points = await traceTileOutline(tile); traced = !!points; }
    catch(err) { console.warn(`${MODULE_ID} | alpha tracing failed, using the footprint:`, err); }
  }
  points ??= tileFootprint(tile);

  const name = speaker || prettyName(tile.texture?.src);
  const [region] = await canvas.scene.createEmbeddedDocuments('Region', [{
    name,
    color: '#d6ba80',
    visibility: CONST.REGION_VISIBILITY.LAYER,
    shapes: [{ type: 'polygon', points }]
  }]);
  const [behavior] = await region.createEmbeddedDocuments('RegionBehavior', [{
    name: game.i18n.localize('TYPES.RegionBehavior.coc7-dialogues.dialogue'),
    type: BEHAVIOR_TYPE,
    system: { journal, speaker: name, portrait: tile.texture?.src ?? '', highlight }
  }]);
  ui.notifications.info(game.i18n.format(traced ? 'COC7DIALOGUES.Info.TileRegionTraced' : 'COC7DIALOGUES.Info.TileRegionRect', { name, n: points.length / 2 }));
  if ( openSheet ) behavior.sheet.render({ force: true });
  return region;
}

/**
 * Ask journal / name / highlight, then convert. Used by the HUD button and
 * the macro.
 * @param {TileDocument[]} tiles
 */
export async function promptTileToDialogueRegion(tiles) {
  tiles = tiles.filter(t => t?.object);
  if ( !tiles.length ) return ui.notifications.warn(game.i18n.localize('COC7DIALOGUES.Warn.TileNotOnCanvas'));
  const journals = game.journal.filter(j => j.pages.some(p => p.type === PAGE_TYPE))
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  const L = k => game.i18n.localize(`COC7DIALOGUES.TileRegion.${k}`);
  const jOpts = [`<option value="">${L('NoJournal')}</option>`, ...journals.map(j => `<option value="${j.uuid}">${foundry.utils.escapeHTML(j.name)}</option>`)].join('');
  const defaultName = tiles.length === 1 ? prettyName(tiles[0].texture?.src) : '';
  const content = `
    <div class="form-group"><label>${L('Journal')}</label><select name="journal">${jOpts}</select></div>
    <div class="form-group"><label>${L('Speaker')}</label><input type="text" name="speaker" value="${foundry.utils.escapeHTML(defaultName)}" ${tiles.length > 1 ? 'placeholder="' + L('SpeakerAuto') + '"' : ''}></div>
    <div class="form-group"><label>${L('Highlight')}</label><select name="highlight">
      <option value="hover">${game.i18n.localize('COC7DIALOGUES.Behavior.FIELDS.highlight.choices.hover')}</option>
      <option value="always">${game.i18n.localize('COC7DIALOGUES.Behavior.FIELDS.highlight.choices.always')}</option>
      <option value="never">${game.i18n.localize('COC7DIALOGUES.Behavior.FIELDS.highlight.choices.never')}</option>
    </select></div>
    <div class="form-group"><label>${L('Trace')}</label><input type="checkbox" name="trace" checked></div>
    <p class="hint">${L('Hint')}</p>`;
  const choice = await foundry.applications.api.DialogV2.prompt({
    window: { title: L('Title'), icon: 'fa-solid fa-comments' },
    content,
    ok: {
      label: L('Create'), icon: 'fa-solid fa-draw-polygon',
      callback: (ev, btn) => ({
        journal: btn.form.elements.journal.value || null,
        speaker: btn.form.elements.speaker.value.trim(),
        highlight: btn.form.elements.highlight.value,
        trace: btn.form.elements.trace.checked
      })
    },
    rejectClose: false
  });
  if ( !choice ) return null;
  const out = [];
  for ( const tile of tiles ) {
    out.push(await tileToDialogueRegion(tile, { ...choice, speaker: tiles.length === 1 ? choice.speaker : '', openSheet: tiles.length === 1 }));
  }
  return out;
}

/** Tile HUD button (GM). */
export function registerTileHud() {
  Hooks.on('renderTileHUD', (hud, html) => {
    if ( !game.user.isGM ) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const col = root?.querySelector('.col.right');
    if ( !col || col.querySelector('[data-coc7-dialogues]') ) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'control-icon';
    btn.dataset.coc7Dialogues = 'tile-to-region';
    btn.dataset.tooltip = game.i18n.localize('COC7DIALOGUES.TileRegion.HudTooltip');
    btn.setAttribute('aria-label', btn.dataset.tooltip);
    btn.innerHTML = '<i class="fa-solid fa-comments" inert></i>';
    btn.addEventListener('click', ev => {
      ev.preventDefault(); ev.stopPropagation();
      const selected = canvas.tiles.controlled.map(t => t.document);
      promptTileToDialogueRegion(selected.length ? selected : [hud.document]);
    });
    col.appendChild(btn);
  });
}

/* -------------------------------------------- */
/*  Geometry                                    */
/* -------------------------------------------- */

/** Rectangular footprint (absolute polygon, rotation about the tile's anchor point). */
export function tileFootprint(tile) {
  const { x, y, width: w, height: h } = tile;
  const rot = tile.rotation ?? 0;
  const ax = tile.texture?.anchorX ?? 0, ay = tile.texture?.anchorY ?? 0;
  const left = x - ax * w, top = y - ay * h;
  const corners = [[left, top], [left + w, top], [left + w, top + h], [left, top + h]];
  if ( !rot ) return corners.flat().map(v => Math.round(v));
  const rad = Math.toRadians(rot), cos = Math.cos(rad), sin = Math.sin(rad);
  return corners.flatMap(([px, py]) => {
    const dx = px - x, dy = py - y;
    return [Math.round(x + dx * cos - dy * sin), Math.round(y + dx * sin + dy * cos)];
  });
}

/**
 * Trace the alpha outline of the tile's texture → scene-space polygon
 * (flat [x, y, ...]). Returns null when the image can't be read.
 */
export async function traceTileOutline(tile) {
  const mesh = tile.object?.mesh;
  tile.object.applyRenderFlags?.();                             // flush pending refresh (mesh position/scale) — may be queued on the ticker
  const texture = mesh?.texture;
  const source = texture?.baseTexture?.resource?.source;
  if ( !mesh || !texture?.valid || !source || (source instanceof HTMLVideoElement) ) return null;

  const texW = texture.orig?.width ?? texture.width, texH = texture.orig?.height ?? texture.height;
  const scale = Math.min(1, MASK_MAX / Math.max(texW, texH));
  const w = Math.max(2, Math.round(texW * scale)), h = Math.max(2, Math.round(texH * scale));
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const ctx = off.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data; // throws on tainted canvases → caller falls back

  // Binary mask with a 1px transparent border so the tracer never runs off the edge.
  const W = w + 2, H = h + 2;
  const mask = new Uint8Array(W * H);
  let count = 0;
  for ( let y = 0; y < h; y++ ) for ( let x = 0; x < w; x++ ) {
    if ( data[(y * w + x) * 4 + 3] > ALPHA_THRESHOLD ) { mask[(y + 1) * W + (x + 1)] = 1; count++; }
  }
  if ( count < 4 ) return null;

  const contour = traceLargestContour(mask, W, H);
  if ( !contour || contour.length < 3 ) return null;
  const simplified = simplify(contour, SIMPLIFY_EPS);
  if ( simplified.length < 3 ) return null;

  // Mask pixel → texture pixel → sprite-local → scene. We use the mesh's
  // LOCAL transform (position/scale/rotation/anchor, set from the document
  // at draw time): the primary group sits at the scene origin, so local →
  // scene directly — and unlike worldTransform it is current even when no
  // frame has been rendered yet (hidden tab, headless tests).
  const ax = mesh.anchor?.x ?? (tile.texture?.anchorX ?? 0), ay = mesh.anchor?.y ?? (tile.texture?.anchorY ?? 0);
  mesh.transform.updateLocalTransform();
  const M = mesh.transform.localTransform;
  const out = [];
  const tmp = new PIXI.Point();
  for ( const [mx, my] of simplified ) {
    const px = (mx - 1) / scale, py = (my - 1) / scale;          // undo border + downscale
    tmp.set(px - ax * texW, py - ay * texH);                     // sprite-local (texture pixels, anchor-relative)
    M.apply(tmp, tmp);                                           // → scene coordinates
    out.push(Math.round(tmp.x), Math.round(tmp.y));
  }
  return out;
}

/** Moore neighbour tracing of the outer contour of the largest 4-connected blob. */
function traceLargestContour(mask, W, H) {
  // Find blobs by flood fill, keep the biggest.
  const label = new Int32Array(W * H);
  let best = null, bestSize = 0, next = 1;
  const stack = [];
  for ( let i = 0; i < mask.length; i++ ) {
    if ( !mask[i] || label[i] ) continue;
    let size = 0; stack.push(i); label[i] = next;
    while ( stack.length ) {
      const p = stack.pop(); size++;
      const x = p % W, y = (p / W) | 0;
      for ( const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] ) {
        const nx = x + dx, ny = y + dy;
        if ( nx < 0 || ny < 0 || nx >= W || ny >= H ) continue;
        const q = ny * W + nx;
        if ( mask[q] && !label[q] ) { label[q] = next; stack.push(q); }
      }
    }
    if ( size > bestSize ) { bestSize = size; best = next; }
    next++;
  }
  if ( !best ) return null;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && label[y * W + x] === best;

  // Start: top-most, left-most pixel of the blob (scanline order guarantees it).
  let sx = -1, sy = -1;
  for ( let i = 0; i < label.length; i++ ) if ( label[i] === best ) { sx = i % W; sy = (i / W) | 0; break; }

  // Moore neighbourhood, clockwise from the west.
  const N = [[-1,0],[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1]];
  const contour = [[sx, sy]];
  let cx = sx, cy = sy, backtrack = 0; // we "came from" the west
  const maxSteps = bestSize * 4 + 8;
  for ( let steps = 0; steps < maxSteps; steps++ ) {
    let found = false;
    for ( let k = 0; k < 8; k++ ) {
      const dir = (backtrack + k) % 8;
      const nx = cx + N[dir][0], ny = cy + N[dir][1];
      if ( inside(nx, ny) ) {
        // next backtrack = the neighbour just before the one we found, i.e. (dir + 6) % 8 ≈ turn back
        backtrack = (dir + 6) % 8;
        cx = nx; cy = ny;
        found = true;
        break;
      }
    }
    if ( !found ) break;                           // isolated pixel
    if ( cx === sx && cy === sy ) break;           // closed the loop
    contour.push([cx, cy]);
  }
  return contour;
}

/** Douglas-Peucker (closed polygon treated as an open chain from its first point). */
function simplify(points, eps) {
  if ( points.length <= 3 ) return points;
  const sq = eps * eps;
  const keep = new Uint8Array(points.length); keep[0] = 1; keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while ( stack.length ) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    const [ax, ay] = points[a], [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
    for ( let i = a + 1; i < b; i++ ) {
      const [px, py] = points[i];
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const ex = ax + t * dx - px, ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if ( d > maxD ) { maxD = d; idx = i; }
    }
    if ( maxD > sq && idx > 0 ) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

function prettyName(src) {
  if ( !src ) return game.i18n.localize('COC7DIALOGUES.TileRegion.DefaultName');
  const base = decodeURIComponent(src.split('/').pop() ?? '').replace(/\.[a-z0-9]+$/i, '');
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase()) || game.i18n.localize('COC7DIALOGUES.TileRegion.DefaultName');
}
