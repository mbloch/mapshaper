import { expect, test } from '@playwright/test';

var FIXTURE = 'test/data/features/snip/ring_and_line.json';

// how far back from the pointer, along the path, vertices may still change
// during a drag
var PREVIEW_LENGTH = 50;

test('a dragged stroke is smoothed, pinned at both ends, and undone in one step',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await clickNewLayerLink(page, 'lines');
    var box = await getMapBox(page);
    var a = mapPoint(box, 0.15, 0.6);
    var b = mapPoint(box, 0.25, 0.7);
    var wave = wobblyWave(mapPoint(box, 0.3, 0.7), 360, 50);
    var c = wave[wave.length - 1];

    await clickAt(page, a);
    // a press that moves a couple of pixels is still a click
    await jitteryClickAt(page, b);
    var snapshots = [];
    await dragThrough(page, wave, async function(i) {
      if (i % 5 === 0) snapshots.push({pointer: wave[i], path: (await getPaths(page, 'lines'))[0][0]});
    });
    await page.keyboard.press('Enter');

    var path = (await getPaths(page, 'lines'))[0][0];
    // the curve is placed during the drag, a little behind the pointer, and
    // what is placed stays put; only the preview near the pointer changes
    var placedCount = 0;
    snapshots.forEach(function(snap) {
      var placed = snap.path.slice(0, countVerticesBefore(snap.path, PREVIEW_LENGTH));
      expect(path.slice(0, placed.length)).toEqual(placed);
      placedCount = placed.length;
    });
    expect(placedCount).toBeGreaterThan(20);
    expectNear(path[0], toMap(box, a));
    expectNear(path[1], toMap(box, b));
    // the stroke starts where the mouse was pressed and ends where it was
    // released, rather than at the last vertex the drag happened to add
    expectNear(path[2], toMap(box, wave[0]));
    expectNear(path[path.length - 1], toMap(box, c));
    // the wobble zigzags; the smoothed stroke bends only as sharply as the
    // wave does at its peaks
    var stroke = path.slice(2);
    expect(maxTurn(stroke)).toBeLessThan(maxTurn(pixelPath(wave)) / 2);
    expect(stroke.length).toBeGreaterThan(20);

    // one undo takes back the whole stroke, and redo puts it back
    await undo(page);
    expect((await getPaths(page, 'lines'))[0][0].length).toBe(2);
    await redo(page);
    expect((await getPaths(page, 'lines'))[0][0]).toEqual(path);
    expect(errors).toEqual([]);
  });

test('a stroke that returns to the start of a polygon closes it',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await clickNewLayerLink(page, 'polygons');
    var box = await getMapBox(page);
    var start = mapPoint(box, 0.3, 0.55);
    await clickAt(page, start);
    await clickAt(page, mapPoint(box, 0.5, 0.55));
    // an arc down and around, back to the first vertex
    var arc = [];
    for (var i = 0; i <= 40; i++) {
      var t = Math.PI * i / 40;
      arc.push([
        Math.round(start[0] + box.width * 0.1 * (1 + Math.cos(t))),
        Math.round(start[1] + box.height * 0.25 * Math.sin(t))
      ]);
    }
    await dragThrough(page, [mapPoint(box, 0.5, 0.6)].concat(arc));

    var info = await getLayerInfo(page, 'polygons');
    expect(info.shapeCount).toBe(1);
    var ring = (await getPaths(page, 'polygons'))[0][0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring.length).toBeGreaterThan(10);
    expect(errors).toEqual([]);
  });

test('vertices are marked on a completed path under the pointer, not on the path being drawn',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await clickNewLayerLink(page, 'lines');
    var box = await getMapBox(page);
    var a = mapPoint(box, 0.15, 0.6);
    var b = mapPoint(box, 0.35, 0.6);
    var wave = wobblyWave(mapPoint(box, 0.4, 0.7), 300, 40);
    var drawnWithVertices = [];
    async function checkOverlay() {
      (await getOverlayInfo(page)).forEach(function(o) {
        if (o.vertices && (o.ids || []).includes(0)) drawnWithVertices.push(o);
      });
    }
    await clickAt(page, a);
    await checkOverlay();
    await clickAt(page, b);
    await page.mouse.move(b[0] + 20, b[1] + 10, {steps: 3});
    await checkOverlay();
    await dragThrough(page, wave, async function(i) {
      if (i % 10 === 0) await checkOverlay();
    });
    await page.keyboard.press('Enter');
    expect(drawnWithVertices).toEqual([]);

    // hovering over the completed path marks its vertices
    var mid = [Math.round((a[0] + b[0]) / 2), a[1]];
    await page.mouse.move(mid[0], mid[1] + 20);
    await page.mouse.move(mid[0], mid[1], {steps: 4});
    await expect.poll(async function() {
      return (await getOverlayInfo(page)).some(function(o) {
        return o.vertices && (o.ids || []).includes(0);
      });
    }).toBe(true);
    expect(errors).toEqual([]);
  });

async function getOverlayInfo(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getOverlayInfo();
  });
}

// Samples a sine wave the way a mouse reports it: whole pixels, with a wobble
// standing in for an unsteady hand.
function wobblyWave(p0, width, amplitude) {
  var pts = [];
  for (var i = 0; i <= 60; i++) {
    pts.push([
      Math.round(p0[0] + width * i / 60 + 1.5 * Math.sin(i * 2.3)),
      Math.round(p0[1] - amplitude * Math.sin(2 * Math.PI * i / 30) + 1.5 * Math.cos(i * 3.7))
    ]);
  }
  return pts;
}

// number of vertices of @path that are more than @dist from its end, along it
function countVerticesBefore(path, dist) {
  var i = path.length - 1, len = 0;
  while (i > 0 && len <= dist) {
    len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    i--;
  }
  return len > dist ? i + 1 : 0;
}

function pixelPath(pts) {
  return pts.filter(function(p, i) {
    return i === 0 || p[0] != pts[i - 1][0] || p[1] != pts[i - 1][1];
  });
}

// largest change of direction between consecutive segments, in degrees
function maxTurn(pts) {
  var max = 0;
  for (var i = 1; i < pts.length - 1; i++) {
    var a = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    var b = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
    var d = Math.abs(b - a);
    if (d > Math.PI) d = 2 * Math.PI - d;
    max = Math.max(max, d);
  }
  return max * 180 / Math.PI;
}

function expectNear(p, q) {
  expect(Math.hypot(p[0] - q[0], p[1] - q[1])).toBeLessThan(1);
}

async function getMapBox(page) {
  return page.locator('.mshp-main-map').boundingBox();
}

function mapPoint(box, fx, fy) {
  return [Math.round(box.x + box.width * fx), Math.round(box.y + box.height * fy)];
}

// page coords -> pixels from the top left of the map
function toMap(box, p) {
  return [p[0] - box.x, p[1] - box.y];
}

async function clickAt(page, p) {
  await page.mouse.move(p[0], p[1]);
  await page.mouse.click(p[0], p[1]);
  await page.waitForTimeout(120);
}

async function jitteryClickAt(page, p) {
  await page.mouse.move(p[0], p[1]);
  await page.mouse.down();
  await page.mouse.move(p[0] + 2, p[1] + 1);
  await page.mouse.move(p[0], p[1]);
  await page.mouse.up();
  await page.waitForTimeout(120);
}

// onMove: (optional) async function called with the index of each point
//   after the pointer reaches it
async function dragThrough(page, pts, onMove) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (var i = 1; i < pts.length; i++) {
    await page.mouse.move(pts[i][0], pts[i][1]);
    if (onMove) await onMove(i);
  }
  await page.mouse.up();
  await page.waitForTimeout(120);
}

async function getPaths(page, name) {
  return page.evaluate(function(name) {
    return window.mapshaper.undoTest.getLayerPathPixels(name);
  }, name);
}

async function getLayerInfo(page, name) {
  return page.evaluate(function(name) {
    return window.mapshaper.undoTest.getLayerInfo(name);
  }, name);
}

async function undo(page) {
  await page.evaluate(function() { return window.mapshaper.undoTest.undo(); });
}

async function redo(page) {
  await page.evaluate(function() { return window.mapshaper.undoTest.redo(); });
}

async function clickNewLayerLink(page, kind) {
  var links = page.locator('.new-layer-links');
  if (!await links.isVisible()) {
    await page.locator('.layer-tab:visible').click();
    await links.waitFor({state: 'visible'});
  }
  await page.locator('.new-layer-links .layer-menu-link[data-kind="' + kind + '"]').click();
  await page.waitForTimeout(250);
}

async function loadFixture(page, fixture) {
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(fixture));
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest;
  });
  await page.waitForFunction(function() {
    return window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.clearUndoHistory();
  });
}

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}
