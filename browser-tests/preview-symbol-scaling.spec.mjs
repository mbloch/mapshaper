import { expect, test } from '@playwright/test';

var FIXTURE = 'test/data/geojson/ccw_polygon.json';

test('preview zoom scales dash length and gap with the stroke', async function({page}) {
  await page.addInitScript(function() {
    var orig = CanvasRenderingContext2D.prototype.setLineDash;
    window.__lineDashes = [];
    CanvasRenderingContext2D.prototype.setLineDash = function(segments) {
      if (segments && segments.length) {
        window.__lineDashes.push(Array.prototype.map.call(segments, Number));
      }
      return orig.apply(this, arguments);
    };
  });

  var url = '/?undo=on&undo-test=on&files=' + encodeURIComponent(FIXTURE);
  await page.goto(url);
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest &&
      window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });

  await page.evaluate(async function() {
    await window.mapshaper.undoTest.runCommand(
      "-style stroke=#222 stroke-width=2 stroke-dasharray='8 4'"
    );
    await window.mapshaper.undoTest.runCommand('-frame width=400');
    window.mapshaper.undoTest.setPreviewMode(true);
  });

  var atOne = await captureDashes(page, 1);
  var atTwo = await captureDashes(page, 2);
  var pix = await page.evaluate(function() {
    return window.devicePixelRatio > 1 ? 2 : 1;
  });

  expect(atOne.scale).toBeCloseTo(1, 2);
  expect(atTwo.scale).toBeCloseTo(2, 2);
  expect(hasDash(atOne.dashes, 8 * pix, 4 * pix)).toBe(true);
  expect(hasDash(atTwo.dashes, 16 * pix, 8 * pix)).toBe(true);
});

test('preview zoom scales fill patterns', async function({page}) {
  await page.addInitScript(function() {
    var orig = CanvasRenderingContext2D.prototype.createPattern;
    window.__patternTiles = [];
    CanvasRenderingContext2D.prototype.createPattern = function(img) {
      var pattern = orig.apply(this, arguments);
      var origSet = pattern.setTransform;
      var rec = {width: img.width, height: img.height};
      window.__patternTiles.push(rec);
      pattern.setTransform = function(m) {
        // effective tile width = canvas width x the horizontal stretch
        rec.sx = Math.hypot(m.a, m.b);
        rec.m = {a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f};
        return origSet.apply(this, arguments);
      };
      return pattern;
    };
  });

  var url = '/?undo=on&undo-test=on&files=' + encodeURIComponent(FIXTURE);
  await page.goto(url);
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest &&
      window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
  await page.evaluate(async function() {
    await window.mapshaper.undoTest.runCommand(
      "-style fill-pattern='hatches 2px grey 2px blue'"
    );
    await window.mapshaper.undoTest.runCommand('-frame width=400');
    window.mapshaper.undoTest.setPreviewMode(true);
  });
  var pix = await page.evaluate(function() {
    return window.devicePixelRatio > 1 ? 2 : 1;
  });

  var atOne = await capturePattern(page, 1);
  var atTwo = await capturePattern(page, 2);
  // the hatch tile is 4 output pixels wide (2px + 2px)
  expect(atOne.width).toBeCloseTo(4 * pix, 3);
  expect(atTwo.width).toBeCloseTo(8 * pix, 3);
  // The pattern origin sits on the page corner (or a whole number of tiles
  // away from it), rather than on the viewport corner.
  expect(patternAnchoredToPage(atOne)).toBe(true);
  expect(patternAnchoredToPage(atTwo)).toBe(true);

  var map = await page.locator('.map-layers').boundingBox();
  await page.mouse.move(map.x + 12, map.y + 12);
  await page.mouse.down();
  await page.mouse.move(map.x + 90, map.y + 48, {steps: 5});
  await page.mouse.up();
  // The redraw after the pan has to move the pattern, not just the page.
  await expect.poll(async function() {
    var placed = await readPatternPlacement(page);
    return placed.tile.m.e != atTwo.tile.m.e || placed.tile.m.f != atTwo.tile.m.f;
  }).toBe(true);
  expect(patternAnchoredToPage(await readPatternPlacement(page))).toBe(true);
});

async function capturePattern(page, magnification) {
  await page.evaluate(function(scale) {
    window.__patternTiles = [];
    window.mapshaper.undoTest.zoomToFrameMagnification(scale);
  }, magnification);
  await expect.poll(async function() {
    return page.evaluate(function() { return window.__patternTiles.length; });
  }, {timeout: 5000}).toBeGreaterThan(0);
  return readPatternPlacement(page);
}

async function readPatternPlacement(page) {
  return page.evaluate(function() {
    var rec = window.__patternTiles[window.__patternTiles.length - 1];
    var pix = window.devicePixelRatio > 1 ? 2 : 1;
    var pageBox = document.querySelector('.preview-page-border');
    return {
      width: rec.width * (rec.sx || 1),
      tile: rec,
      corner: {
        x: Number(pageBox.getAttribute('x')) * pix,
        y: Number(pageBox.getAttribute('y')) * pix
      }
    };
  });
}

// True when the pattern origin and the page corner differ by whole tiles.
function patternAnchoredToPage(placed) {
  var m = placed.tile.m;
  var dx = m.e - placed.corner.x;
  var dy = m.f - placed.corner.y;
  var v1x = m.a * placed.tile.width;
  var v1y = m.b * placed.tile.width;
  var v2x = m.c * placed.tile.height;
  var v2y = m.d * placed.tile.height;
  var det = v1x * v2y - v1y * v2x;
  var n1 = (dx * v2y - dy * v2x) / det;
  var n2 = (v1x * dy - v1y * dx) / det;
  return Math.abs(n1 - Math.round(n1)) < 1e-3 && Math.abs(n2 - Math.round(n2)) < 1e-3;
}

async function captureDashes(page, magnification) {
  await page.evaluate(function(scale) {
    window.__lineDashes = [];
    window.mapshaper.undoTest.zoomToFrameMagnification(scale);
  }, magnification);
  await expect.poll(async function() {
    return page.evaluate(function() {
      return window.__lineDashes.length;
    });
  }, {timeout: 5000}).toBeGreaterThan(0);
  return page.evaluate(function() {
    return {
      scale: window.mapshaper.undoTest.getSymbolScale(),
      dashes: window.__lineDashes.slice()
    };
  });
}

function hasDash(dashes, a, b) {
  return dashes.some(function(dash) {
    return dash.length >= 2 && Math.abs(dash[0] - a) < 0.01 && Math.abs(dash[1] - b) < 0.01;
  });
}
