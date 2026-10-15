import { expect, test } from '@playwright/test';

// The curve tool draws lines as smooth curves through clicked knots, and
// reshapes them by dragging their knots while the tool is open.

var FIXTURE = 'test/data/features/snip/ring_and_line.json';
var CURVE_BUTTON = '.floating-toolbar.line-draw-toolbar .floating-toolbar-btn[data-tooltip="Draw curves"]';

test('the toolbar button arms the curve tool, and a curve is one -add-shape command',
  async function({page}) {
    var errors = collectPageErrors(page);
    var box = await openCurveTool(page);
    var knots = [mapPoint(box, 0.2, 0.7), mapPoint(box, 0.35, 0.55), mapPoint(box, 0.5, 0.7)];
    expect(await getModes(page)).toEqual({mode: 'line_style', tool: 'curve_lines'});
    await expect(page.locator(CURVE_BUTTON + '.selected')).toBeVisible();

    await clickAt(page, knots[0]);
    await clickAt(page, knots[1]);
    // the pending curve follows the pointer, and has knot handles
    await page.mouse.move(...knots[2], {steps: 3});
    expect((await getPendingPath(page)).length).toBeGreaterThan(3);
    expect((await getPendingKnots(page)).length).toBe(2);
    await clickAt(page, knots[2]);
    await page.keyboard.press('Enter');
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);
    expect(await getPendingPath(page)).toBe(null);
    expect(await getPendingKnots(page)).toBe(null);

    var path = (await getPaths(page, 'lines'))[0][0];
    expect(path.length).toBeGreaterThan(10);
    knots.forEach(function(p) { expectOnPath(toMap(box, p), path); });
    var commands = await getSessionCommands(page);
    expect(commands[commands.length - 1]).toMatch(/^-add-shape coordinates=[-\d.e,]+/);
    expect((await getModes(page)).tool).toBe('curve_lines');
    expect(errors).toEqual([]);
  });

test('undo and redo take back and restore the knots of the curve being drawn',
  async function({page}) {
    var errors = collectPageErrors(page);
    var box = await openCurveTool(page);
    await drawCurve(page, [mapPoint(box, 0.2, 0.8), mapPoint(box, 0.4, 0.8)]);
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);

    await clickAt(page, mapPoint(box, 0.2, 0.6));
    await clickAt(page, mapPoint(box, 0.3, 0.5));
    await clickAt(page, mapPoint(box, 0.4, 0.6));
    await undo(page);
    expect((await getPendingKnots(page)).length).toBe(2);
    await redo(page);
    expect((await getPendingKnots(page)).length).toBe(3);
    await undo(page);
    await undo(page);
    await undo(page);
    // the curve is abandoned, and the line drawn before it is still there
    expect(await getPendingKnots(page)).toBe(null);
    expect(await getShapeCount(page, 'lines')).toBe(1);
    // with no curve being drawn, undo takes back the last command
    await undo(page);
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(0);
    expect(errors).toEqual([]);
  });

test('clicking the first knot closes the curve', async function({page}) {
  var errors = collectPageErrors(page);
  var box = await openCurveTool(page);
  var first = mapPoint(box, 0.2, 0.7);
  await clickAt(page, first);
  await clickAt(page, mapPoint(box, 0.4, 0.7));
  await clickAt(page, mapPoint(box, 0.3, 0.5));
  await clickAt(page, first);
  await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);
  var path = (await getPaths(page, 'lines'))[0][0];
  expect(path[0]).toEqual(path[path.length - 1]);
  expect(errors).toEqual([]);
});

test('dragging a knot of a selected curve reshapes it with -update-line, which undo takes back',
  async function({page}) {
    var errors = collectPageErrors(page);
    var box = await openCurveTool(page);
    var knots = [mapPoint(box, 0.2, 0.7), mapPoint(box, 0.35, 0.55), mapPoint(box, 0.5, 0.7)];
    var moved = mapPoint(box, 0.35, 0.8);
    await drawCurve(page, knots);
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);
    var before = (await getPaths(page, 'lines'))[0][0];

    // a selected curve shows its knots
    await clickAt(page, knots[1]);
    expect(await getSelectionIds(page)).toEqual([0]);
    expectSamePoints(await getPendingKnots(page), knots.map(p => toMap(box, p)));

    await dragFrom(page, knots[1], moved);
    await expect.poll(async () => (await getPaths(page, 'lines'))[0][0].length).not.toBe(0);
    await expect.poll(async () => {
      var commands = await getSessionCommands(page);
      return commands[commands.length - 1];
    }).toMatch(/^-update-line ids=0 coordinates=[-\d.e,]+$/);
    var after = (await getPaths(page, 'lines'))[0][0];
    expectOnPath(toMap(box, moved), after);
    expect(await getShapeCount(page, 'lines')).toBe(1);
    expect(await getSelectionIds(page)).toEqual([0]);
    expectSamePoints(await getPendingKnots(page), [knots[0], moved, knots[2]].map(p => toMap(box, p)));

    // undo restores the previous path, and its knots
    await undo(page);
    await expect.poll(async () => (await getPaths(page, 'lines'))[0][0].length).toBe(before.length);
    expect(await getSelectionIds(page)).toEqual([0]);
    expectSamePoints(await getPendingKnots(page), knots.map(p => toMap(box, p)));
    await redo(page);
    await expect.poll(async () => (await getPaths(page, 'lines'))[0][0].length).toBe(after.length);
    expectSamePoints(await getPendingKnots(page), [knots[0], moved, knots[2]].map(p => toMap(box, p)));
    expect(errors).toEqual([]);
  });

test('while a knot is dragged, the layer is drawn without the curve, and the preview stands in for it',
  async function({page}) {
    var errors = collectPageErrors(page);
    var box = await openCurveTool(page);
    var knots = [mapPoint(box, 0.2, 0.7), mapPoint(box, 0.35, 0.55), mapPoint(box, 0.5, 0.7)];
    await drawCurve(page, knots);
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);
    await clickAt(page, knots[1]);
    expect(await getHiddenShapeIds(page)).toEqual([]);

    await page.mouse.move(knots[1][0], knots[1][1], {steps: 2});
    await page.waitForTimeout(50);
    await page.mouse.down();
    await page.mouse.move(knots[1][0], knots[1][1] + 40, {steps: 6});
    expect(await getHiddenShapeIds(page)).toEqual([0]);
    expect(await getPendingPath(page)).not.toBe(null);
    await page.mouse.up();
    await expect.poll(() => getHiddenShapeIds(page)).toEqual([]);
    expect(await getPendingPath(page)).toBe(null);
    expect(await getSelectionIds(page)).toEqual([0]);
    expect(errors).toEqual([]);
  });

test('Alt-click places a corner, and Alt-click on a knot of a selected curve smooths it, in one undo step',
  async function({page}) {
    var errors = collectPageErrors(page);
    var box = await openCurveTool(page);
    var knots = [mapPoint(box, 0.2, 0.7), mapPoint(box, 0.35, 0.55), mapPoint(box, 0.5, 0.7)];
    await clickAt(page, knots[0]);
    await altClickAt(page, knots[1]);
    await clickAt(page, knots[2]);
    await page.keyboard.press('Enter');
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);
    expect(turnAt((await getPaths(page, 'lines'))[0][0], toMap(box, knots[1]))).toBeGreaterThan(0.5);

    await clickAt(page, knots[1]);
    expect(await getSelectionIds(page)).toEqual([0]);
    expect(await getPendingKnotCorners(page)).toEqual([false, true, false]);

    await altClickAt(page, knots[1]);
    await expect.poll(() => getPendingKnotCorners(page)).toEqual([false, false, false]);
    await expect.poll(async () => turnAt((await getPaths(page, 'lines'))[0][0], toMap(box, knots[1])))
      .toBeLessThan(0.2);
    var commands = await getSessionCommands(page);
    expect(commands[commands.length - 1]).toMatch(/^-update-line ids=0 /);
    expect(await getSelectionIds(page)).toEqual([0]);

    await undo(page);
    await expect.poll(async () => turnAt((await getPaths(page, 'lines'))[0][0], toMap(box, knots[1])))
      .toBeGreaterThan(0.5);
    expect(await getPendingKnotCorners(page)).toEqual([false, true, false]);
    expect(errors).toEqual([]);
  });

test('two quick clicks on a knot of a selected curve do not zoom the map', async function({page}) {
  var errors = collectPageErrors(page);
  var box = await openCurveTool(page);
  var knots = [mapPoint(box, 0.2, 0.7), mapPoint(box, 0.35, 0.55), mapPoint(box, 0.5, 0.7)];
  await drawCurve(page, knots);
  await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);
  await clickAt(page, knots[1]);
  expect(await getSelectionIds(page)).toEqual([0]);
  var before = await getPaths(page, 'lines');
  await page.keyboard.down('Alt');
  await page.mouse.dblclick(knots[1][0], knots[1][1]);
  await page.keyboard.up('Alt');
  await page.waitForTimeout(500);
  // the knots are where they were on screen, so the map did not zoom
  expectSamePoints(await getPendingKnots(page), knots.map(p => toMap(box, p)));
  expect((await getPaths(page, 'lines'))[0][0][0]).toEqual(before[0][0][0]);
  expect(errors).toEqual([]);
});

test('a line that was not drawn as a curve has no knots, and is selected for styling',
  async function({page}) {
    var errors = collectPageErrors(page);
    var box;
    await loadFixture(page, FIXTURE);
    await clickNewLayerLink(page, 'lines');
    box = await getMapBox(page);
    // drawn with the Draw tool, which the new layer opens with
    await drawCurve(page, [mapPoint(box, 0.2, 0.7), mapPoint(box, 0.5, 0.7)]);
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);
    await page.locator(CURVE_BUTTON).click();
    await page.waitForTimeout(150);
    expect((await getModes(page)).tool).toBe('curve_lines');
    await clickAt(page, mapPoint(box, 0.35, 0.7));
    expect(await getSelectionIds(page)).toEqual([0]);
    expect(await getPendingKnots(page)).toBe(null);
    // a click off the selection deselects, and starts no curve
    await clickAt(page, mapPoint(box, 0.35, 0.85));
    expect(await getSelectionIds(page)).toEqual([]);
    expect(await getPendingKnots(page)).toBe(null);
    expect(errors).toEqual([]);
  });

test('Esc finishes the curve, and a second Esc disarms the tool', async function({page}) {
  var errors = collectPageErrors(page);
  var box = await openCurveTool(page);
  await clickAt(page, mapPoint(box, 0.2, 0.7));
  await clickAt(page, mapPoint(box, 0.4, 0.7));
  await page.keyboard.press('Escape');
  await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);
  expect((await getModes(page)).tool).toBe('curve_lines');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  expect(await getModes(page)).toEqual({mode: 'line_style', tool: 'line_style'});
  expect(errors).toEqual([]);
});

// opens a new line layer with the Draw tool armed, then arms the curve tool
async function openCurveTool(page) {
  await loadFixture(page, FIXTURE);
  await clickNewLayerLink(page, 'lines');
  await page.locator(CURVE_BUTTON).click();
  await page.waitForTimeout(150);
  return getMapBox(page);
}

async function drawCurve(page, points) {
  for (var p of points) await clickAt(page, p);
  await page.keyboard.press('Enter');
}

async function dragFrom(page, a, b) {
  await page.mouse.move(a[0], a[1], {steps: 2});
  await page.waitForTimeout(50);
  await page.mouse.down();
  await page.mouse.move(b[0], b[1], {steps: 8});
  await page.mouse.up();
  await page.waitForTimeout(250);
}

async function altClickAt(page, p) {
  await page.keyboard.down('Alt');
  await clickAt(page, p);
  await page.keyboard.up('Alt');
}

// how far the path turns, in radians, at its vertex nearest @p
function turnAt(path, p) {
  var i = 0, a, b, d;
  path.forEach(function(q, j) {
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) < Math.hypot(p[0] - path[i][0], p[1] - path[i][1])) i = j;
  });
  a = Math.atan2(path[i][1] - path[i - 1][1], path[i][0] - path[i - 1][0]);
  b = Math.atan2(path[i + 1][1] - path[i][1], path[i + 1][0] - path[i][0]);
  d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

function expectOnPath(p, path) {
  var minDist = path.reduce(function(memo, q) {
    return Math.min(memo, Math.hypot(p[0] - q[0], p[1] - q[1]));
  }, Infinity);
  expect(minDist).toBeLessThan(1);
}

function expectSamePoints(a, b) {
  expect(a).not.toBe(null);
  expect(a.length).toBe(b.length);
  a.forEach(function(p, i) {
    expect(Math.hypot(p[0] - b[i][0], p[1] - b[i][1])).toBeLessThan(1);
  });
}

function toMap(box, p) {
  return [p[0] - box.x, p[1] - box.y];
}

async function getModes(page) {
  return page.evaluate(function() {
    var api = window.mapshaper.undoTest;
    return {mode: api.getInteractionMode(), tool: api.getToolMode()};
  });
}

async function getSelectionIds(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getSelectionIds();
  });
}

async function getPaths(page, name) {
  return page.evaluate(function(name) {
    return window.mapshaper.undoTest.getLayerPathPixels(name);
  }, name);
}

async function getPendingPath(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getPendingPathPixels();
  });
}

async function getHiddenShapeIds(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getHiddenShapeIds();
  });
}

async function getPendingKnots(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getPendingKnotPixels();
  });
}

async function getPendingKnotCorners(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getPendingKnotCorners();
  });
}

async function undo(page) {
  await page.evaluate(function() { return window.mapshaper.undoTest.undo(); });
  await page.waitForTimeout(150);
}

async function redo(page) {
  await page.evaluate(function() { return window.mapshaper.undoTest.redo(); });
  await page.waitForTimeout(150);
}

async function getMapBox(page) {
  return page.locator('.mshp-main-map').boundingBox();
}

function mapPoint(box, fx, fy) {
  return [Math.round(box.x + box.width * fx), Math.round(box.y + box.height * fy)];
}

async function clickAt(page, p) {
  await page.mouse.move(p[0], p[1]);
  await page.mouse.click(p[0], p[1]);
  await page.waitForTimeout(120);
}

async function getShapeCount(page, name) {
  return page.evaluate(function(name) {
    return window.mapshaper.undoTest.getLayerInfo(name).shapeCount;
  }, name);
}

async function getSessionCommands(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory().commands;
  });
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
