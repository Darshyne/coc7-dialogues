/**
 * Canvas side of the module: make Regions carrying a Dialogue behavior
 * clickable for every user (players included), with a hover highlight and
 * a name label.
 *
 * Why not rely on the Region placeable itself: for players the Region
 * layer is never active and regions are usually invisible (visibility
 * "Layer"), and Region behaviors receive no click events. So we:
 *   - listen to pointer events on canvas.stage (re-attached at every
 *     canvasReady, since core removes all stage listeners on redraw),
 *   - hit-test the pointer against `regionDocument.polygonTree`,
 *   - draw our own highlight in the interface group.
 */

import { BEHAVIOR_TYPE, MODULE_ID } from './constants.js';
import { openDialogueFromBehavior } from './dialogue-app.js';

const CLICK_TOLERANCE_PX = 6;   // screen pixels of pointer travel still counted as a click
const HOVER_ALPHA = 0.28;
const ALWAYS_ALPHA = 0.12;

let container = null;          // PIXI.Container in canvas.interface
let hovered = null;            // { region: RegionDocument, behavior: RegionBehavior } | null
let downAt = null;             // { x, y, target } screen coords at pointerdown
let mouseHandlerRegistered = false;

/* -------------------------------------------- */
/*  Public                                      */
/* -------------------------------------------- */

export function registerCanvasHooks() {
  Hooks.on('canvasReady', onCanvasReady);
  Hooks.on('canvasTearDown', onCanvasTearDown);
  // Redraw "always" highlights when regions/behaviors change.
  for ( const hook of ['createRegion', 'updateRegion', 'deleteRegion', 'createRegionBehavior', 'updateRegionBehavior', 'deleteRegionBehavior'] ) {
    Hooks.on(hook, () => { if ( canvas?.ready ) refreshStatic(); });
  }
}

/**
 * All (region, behavior) pairs on the current scene that are clickable
 * for the current user.
 * @returns {{region: RegionDocument, behavior: RegionBehavior}[]}
 */
export function getDialogueRegions() {
  const out = [];
  if ( !canvas?.scene ) return out;
  for ( const region of canvas.scene.regions ) {
    if ( region.hidden && !game.user.isGM ) continue;
    for ( const behavior of region.behaviors ) {
      if ( behavior.type !== BEHAVIOR_TYPE || behavior.disabled ) continue;
      out.push({ region, behavior });
      break; // one dialogue per region
    }
  }
  return out;
}

/* -------------------------------------------- */
/*  Canvas lifecycle                            */
/* -------------------------------------------- */

function onCanvasReady() {
  container = canvas.interface.addChild(new PIXI.Container());
  container.name = `${MODULE_ID}-highlights`;
  container.zIndex = 1000;
  container.eventMode = 'none';
  container.sortableChildren = true;
  if ( typeof canvas.interface.sortChildren === 'function' ) canvas.interface.sortChildren();

  // Core wipes stage listeners on every draw, so (re)attach ours here.
  canvas.stage.on('pointerdown', onPointerDown);
  canvas.stage.on('pointerup', onPointerUp);
  canvas.stage.on('pointerupoutside', onPointerCancel);
  if ( !mouseHandlerRegistered ) {
    canvas.registerMouseMoveHandler(onMouseMove, 0, null, true);
    mouseHandlerRegistered = true;
  }
  hovered = null;
  refreshStatic();
}

function onCanvasTearDown() {
  hovered = null;
  downAt = null;
  container = null; // destroyed with the interface group
  setCursor(false);
}

/* -------------------------------------------- */
/*  Hit testing                                 */
/* -------------------------------------------- */

/**
 * @param {{x: number, y: number}} point   canvas (world) coordinates
 * @returns {{region: RegionDocument, behavior: RegionBehavior}|null}
 */
function hitTest(point) {
  for ( const entry of getDialogueRegions() ) {
    if ( entry.region.polygonTree.testPoint(point) ) return entry;
  }
  return null;
}

/* -------------------------------------------- */
/*  Pointer handling                            */
/* -------------------------------------------- */

function onMouseMove(worldPos) {
  if ( !canvas.ready || !container ) return;
  const hit = hitTest(worldPos);
  const same = hit?.region === hovered?.region;
  if ( same ) return;
  hovered = hit;
  setCursor(!!hit);
  drawHover();
}

function onPointerDown(event) {
  if ( event.button !== 0 ) return;
  const g = event.global;
  downAt = { x: g.x, y: g.y };
}

function onPointerCancel() {
  downAt = null;
}

function onPointerUp(event) {
  if ( event.button !== 0 || !downAt ) return;
  const g = event.global;
  const moved = Math.hypot(g.x - downAt.x, g.y - downAt.y);
  downAt = null;
  if ( moved > CLICK_TOLERANCE_PX ) return; // that was a drag/pan
  // Don't steal clicks meant for canvas tools while a GM is editing.
  if ( game.user.isGM && (canvas.activeLayer !== canvas.tokens) ) return;
  const world = event.getLocalPosition(canvas.stage);
  const hit = hitTest(world);
  if ( !hit ) return;
  openDialogueFromBehavior(hit.behavior);
}

function setCursor(pointer) {
  const view = canvas.app?.view;
  if ( !view ) return;
  view.style.cursor = pointer ? 'pointer' : '';
}

/* -------------------------------------------- */
/*  Drawing                                     */
/* -------------------------------------------- */

/** Redraw the persistent ("always") highlights. */
function refreshStatic() {
  if ( !container ) return;
  for ( const child of [...container.children] ) {
    if ( child.name === 'static' ) child.destroy({ children: true });
  }
  const g = new PIXI.Graphics();
  g.name = 'static';
  g.zIndex = 0;
  for ( const { region, behavior } of getDialogueRegions() ) {
    if ( behavior.system.highlight !== 'always' ) continue;
    fillRegion(g, region, colorOf(region, behavior), ALWAYS_ALPHA, false);
  }
  container.addChild(g);
  drawHover();
}

/** Redraw the hover highlight + name label. */
function drawHover() {
  if ( !container ) return;
  for ( const child of [...container.children] ) {
    if ( child.name === 'hover' ) child.destroy({ children: true });
  }
  if ( !hovered ) return;
  const { region, behavior } = hovered;
  if ( behavior.system.highlight === 'never' ) return;
  const wrap = new PIXI.Container();
  wrap.name = 'hover';
  wrap.zIndex = 1;
  const g = new PIXI.Graphics();
  const color = colorOf(region, behavior);
  fillRegion(g, region, color, HOVER_ALPHA, true);
  wrap.addChild(g);

  // Name label above the region.
  const name = behavior.system.displayName;
  if ( name ) {
    const style = CONFIG.canvasTextStyle.clone();
    style.fontSize = Math.max(20, Math.round(canvas.dimensions.size * 0.32));
    style.fill = 0xffffff;
    style.stroke = 0x000000;
    style.strokeThickness = 4;
    const PreciseText = foundry.canvas.containers?.PreciseText ?? globalThis.PreciseText;
    const text = new PreciseText(name, style);
    const b = region.bounds;
    text.anchor.set(0.5, 1);
    text.position.set(b.x + b.width / 2, b.y - 6);
    wrap.addChild(text);
  }
  container.addChild(wrap);
}

function fillRegion(g, region, color, alpha, outline) {
  if ( outline ) g.lineStyle({ width: 3, color, alpha: Math.min(1, alpha * 3) });
  g.beginFill(color, alpha);
  for ( const poly of region.polygons ) g.drawPolygon(poly);
  g.endFill();
  if ( outline ) g.lineStyle();
}

function colorOf(region, behavior) {
  const c = behavior.system.color ?? region.color;
  return Number(c ?? 0xffffff);
}
