import { expect, test } from '@playwright/test';

// Drawing lines and polygons is part of the line and polygon style modes,
// armed and disarmed from a toolbar button.

var FIXTURE = 'test/data/features/snip/ring_and_line.json';
var LINE_BUTTON = '.floating-toolbar.line-draw-toolbar .floating-toolbar-btn[data-tooltip="Draw lines"]';
var RESHAPE_BUTTON = '.floating-toolbar.line-draw-toolbar .floating-toolbar-btn[data-tooltip="Reshape lines"]';

test('the toolbar button arms and disarms drawing, and the style panel stays open',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await clickNewLayerLink(page, 'lines');
    var box = await getMapBox(page);
    expect(await getModes(page)).toEqual({mode: 'line_style', tool: 'edit_lines'});
    await expect(page.locator('.layer-style-panel')).toBeVisible();
    await expect(page.locator(LINE_BUTTON + '.selected')).toBeVisible();

    await page.locator(LINE_BUTTON).click();
    await page.waitForTimeout(150);
    expect(await getModes(page)).toEqual({mode: 'line_style', tool: 'line_style'});
    await expect(page.locator(LINE_BUTTON + '.selected')).toHaveCount(0);
    await expect(page.locator('.layer-style-panel')).toBeVisible();
    // disarmed, clicks on the map draw nothing
    await clickAt(page, mapPoint(box, 0.2, 0.6));
    await clickAt(page, mapPoint(box, 0.4, 0.6));
    expect(await getPendingPath(page)).toBe(null);

    await page.locator(LINE_BUTTON).click();
    await page.waitForTimeout(150);
    await drawLine(page, mapPoint(box, 0.2, 0.6), mapPoint(box, 0.4, 0.6));
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);
    // still armed for the next line
    expect((await getModes(page)).tool).toBe('edit_lines');
    expect(errors).toEqual([]);
  });

test('undo and redo join the drawing toolbar, and stand alone without it',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await clickNewLayerLink(page, 'lines');
    var box = await getMapBox(page);
    await drawLine(page, mapPoint(box, 0.2, 0.6), mapPoint(box, 0.4, 0.6));
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);
    await expect(page.locator('.line-draw-toolbar .undo-redo-buttons')).toBeVisible();
    await expect(page.locator('.floating-toolbar.edit-toolbar')).toBeHidden();
    // one row: the undo buttons are level with the drawing buttons
    var draw = await page.locator(LINE_BUTTON).boundingBox();
    var undoBox = await page.locator('.undo-redo-buttons .floating-toolbar-btn').first().boundingBox();
    expect(Math.abs(draw.y - undoBox.y)).toBeLessThan(1);
    expect(undoBox.x).toBeLessThan(draw.x);

    // in a mode with no toolbar of its own, the history still has its buttons
    await page.evaluate(function() {
      window.mapshaper.undoTest.setInteractionMode('info');
    });
    await expect(page.locator('.floating-toolbar.edit-toolbar .undo-redo-buttons')).toBeVisible();
    await expect(page.locator('.line-draw-toolbar .undo-redo-buttons')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

test('Esc finishes the path being drawn, and a second Esc stops drawing',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await clickNewLayerLink(page, 'lines');
    var box = await getMapBox(page);
    await clickAt(page, mapPoint(box, 0.2, 0.6));
    await clickAt(page, mapPoint(box, 0.4, 0.6));
    await page.keyboard.press('Escape');
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);
    expect((await getModes(page)).tool).toBe('edit_lines');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    expect(await getModes(page)).toEqual({mode: 'line_style', tool: 'line_style'});
    expect(errors).toEqual([]);
  });

test('the style panel sets the style of new lines while drawing is armed',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await clickNewLayerLink(page, 'lines');
    var box = await getMapBox(page);
    await setField(colorRow(page, 'Stroke').locator('.label-color-input'), '#ff0000');
    await setField(colorRow(page, 'Stroke').locator('.size-field-input'), '3');
    expect(await getNewShapeStyle(page, 'polyline')).toEqual({stroke: '#ff0000', 'stroke-width': 3});
    // the panel did not run -style on the (empty) layer
    expect(await getSessionCommands(page)).not.toContainEqual(expect.stringMatching(/^-style/));

    // the path being drawn shows the style it will have
    await clickAt(page, mapPoint(box, 0.2, 0.6));
    await page.mouse.move(...mapPoint(box, 0.3, 0.65), {steps: 3});
    expect(await getPendingPathStyle(page)).toMatchObject({stroke: '#ff0000', 'stroke-width': 3});
    await clickAt(page, mapPoint(box, 0.4, 0.6));
    await page.keyboard.press('Enter');
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);

    var commands = await getSessionCommands(page);
    expect(commands[commands.length - 1])
      .toMatch(/^-add-shape coordinates=[-\d.e,]+ stroke='#ff0000' stroke-width=3 target='lines'$/);
    expect(await getRecords(page, 'lines')).toEqual([{stroke: '#ff0000', 'stroke-width': 3}]);
    // the next line gets the same style
    await drawLine(page, mapPoint(box, 0.2, 0.8), mapPoint(box, 0.4, 0.8));
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(2);
    expect((await getRecords(page, 'lines'))[1]).toEqual({stroke: '#ff0000', 'stroke-width': 3});

    // disarmed, the panel styles the layer's lines again
    await page.locator(LINE_BUTTON).click();
    await page.waitForTimeout(150);
    await setField(colorRow(page, 'Stroke').locator('.label-color-input'), '#0000ff');
    expect((await getRecords(page, 'lines')).map(rec => rec.stroke)).toEqual(['#0000ff', '#0000ff']);
    expect((await getNewShapeStyle(page, 'polyline')).stroke).toBe('#ff0000');
    expect(errors).toEqual([]);
  });

test('a line drawn with no stroke in a styled layer gets the panel\'s default stroke, which the swatch shows',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await clickNewLayerLink(page, 'lines');
    var box = await getMapBox(page);
    await drawLine(page, mapPoint(box, 0.2, 0.6), mapPoint(box, 0.4, 0.6));
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);
    await page.evaluate(() => window.mapshaper.undoTest.runCommand("-style stroke='#ef6f6f' target=lines"));
    await page.waitForTimeout(250);

    // the path is drawn in the stroke it will get
    await clickAt(page, mapPoint(box, 0.2, 0.8));
    await clickAt(page, mapPoint(box, 0.4, 0.8));
    expect((await getPendingPathStyle(page)).stroke).toBe('#000000');
    await page.keyboard.press('Enter');
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(2);
    expect((await getRecords(page, 'lines'))[1].stroke).toBe('#000000');

    var chit = colorRow(page, 'Stroke').locator('.label-color-chit');
    await clickAt(page, [Math.round(box.x + box.width * 0.3), Math.round(box.y + box.height * 0.8)]);
    expect(await getSelectionIds(page)).toEqual([1]);
    await expect(colorRow(page, 'Stroke').locator('.label-color-input')).toHaveValue('#000000');
    await expect(chit).toHaveCSS('background-color', 'rgb(0, 0, 0)');

    // a short hex color, from the command line, shows in the swatch too
    await page.evaluate(() => window.mapshaper.undoTest.runCommand("-style stroke='#334' target=lines"));
    await page.waitForTimeout(250);
    expect((await getRecords(page, 'lines'))[1].stroke).toBe('#334');
    await expect(colorRow(page, 'Stroke').locator('.label-color-input')).toHaveValue('#334');
    await expect(chit).toHaveCSS('background-color', 'rgb(51, 51, 68)');
    expect(errors).toEqual([]);
  });

test('while drawing, a click on a line selects it for styling, and Esc or a click off deselects it',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await clickNewLayerLink(page, 'lines');
    var box = await getMapBox(page);
    var a = mapPoint(box, 0.2, 0.6), b = mapPoint(box, 0.4, 0.6);
    await drawLine(page, a, b);
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);

    var mid = [Math.round((a[0] + b[0]) / 2), a[1]];
    await clickAt(page, mid);
    expect(await getSelectionIds(page)).toEqual([0]);
    expect(await getPendingPath(page)).toBe(null);
    await expect(page.locator('.layer-style-panel .label-editing-status')).toHaveText(/1 selected/);
    // the panel styles the selected line, not the next one
    await setField(colorRow(page, 'Stroke').locator('.label-color-input'), '#00aa00');
    expect((await getRecords(page, 'lines'))[0].stroke).toBe('#00aa00');
    expect((await getNewShapeStyle(page, 'polyline')).stroke).toBeUndefined();

    // Esc deselects, and drawing stays armed
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    expect(await getSelectionIds(page)).toEqual([]);
    expect((await getModes(page)).tool).toBe('edit_lines');

    // a click off the selection only deselects
    await clickAt(page, mid);
    await clickAt(page, mapPoint(box, 0.3, 0.85));
    expect(await getSelectionIds(page)).toEqual([]);
    expect(await getPendingPath(page)).toBe(null);
    // and the next click starts a line (after a pause, so it isn't a double-click)
    await page.waitForTimeout(500);
    await clickAt(page, mapPoint(box, 0.3, 0.85));
    expect(await getPendingPath(page)).not.toBe(null);
    expect(errors).toEqual([]);
  });

test('with no tool armed, a line under the pointer is highlighted, and a click off deselects',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await clickNewLayerLink(page, 'lines');
    var box = await getMapBox(page);
    var a = mapPoint(box, 0.2, 0.6), b = mapPoint(box, 0.4, 0.6);
    await drawLine(page, a, b);
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);
    await page.locator(LINE_BUTTON).click();
    await page.waitForTimeout(150);
    expect((await getModes(page)).tool).toBe('line_style');

    var mid = [Math.round((a[0] + b[0]) / 2), a[1]];
    await page.mouse.move(mid[0], mid[1] + 30);
    await page.mouse.move(mid[0], mid[1], {steps: 4});
    await expect.poll(() => getHitId(page)).toBe(0);
    expect(await getOverlayIds(page)).toEqual([[0]]); // the hover highlight

    await clickAt(page, mid);
    expect(await getSelectionIds(page)).toEqual([0]);
    expect(await getOverlayIds(page)).toEqual([[0]]); // selected, not also hovered
    // a second click leaves the line selected
    await page.waitForTimeout(500);
    await clickAt(page, mid);
    expect(await getSelectionIds(page)).toEqual([0]);

    await clickAt(page, mapPoint(box, 0.3, 0.85));
    expect(await getSelectionIds(page)).toEqual([]);
    expect(await getOverlayIds(page)).toEqual([]);
    expect(await getPendingPath(page)).toBe(null);
    expect(errors).toEqual([]);
  });

test('a path started on the end of a line extends it, in one undo step',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await clickNewLayerLink(page, 'lines');
    var box = await getMapBox(page);
    var a = mapPoint(box, 0.2, 0.6), b = mapPoint(box, 0.4, 0.6), c = mapPoint(box, 0.5, 0.75);
    await drawLine(page, a, b);
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);
    var line = (await getPaths(page, 'lines'))[0][0];

    // the end of the line is marked as the pointer nears it
    await page.mouse.move(b[0] + 30, b[1] + 30);
    await page.mouse.move(b[0] + 3, b[1] + 2, {steps: 4});
    await expect.poll(() => getHoverVertex(page)).not.toBe(null);
    await clickAt(page, [b[0] + 3, b[1] + 2]);
    await clickAt(page, c);
    await page.keyboard.press('Enter');
    // until the map has updated, the layer in the catalog can have arcs that
    // its display arcs do not
    await expect.poll(async () => (await getPaths(page, 'lines').catch(() => null))?.[0][0].length).toBe(3);
    expect(await getShapeCount(page, 'lines')).toBe(1);
    var path = (await getPaths(page, 'lines'))[0][0];
    expectSamePath(path.slice(0, 2), line);
    expectNear(path[2], toMap(box, c));
    var commands = await getSessionCommands(page);
    expect(commands[commands.length - 1]).toMatch(/^-add-shape coordinates=[-\d.e,]+ extend target='lines'$/);

    await undo(page);
    expectSamePath((await getPaths(page, 'lines'))[0][0], line);
    await redo(page);
    expect((await getPaths(page, 'lines'))[0][0].length).toBe(3);
    expect(errors).toEqual([]);
  });

test('with Alt pressed, a path starts a new line from any vertex',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await clickNewLayerLink(page, 'lines');
    var box = await getMapBox(page);
    var a = mapPoint(box, 0.2, 0.6), m = mapPoint(box, 0.3, 0.55), b = mapPoint(box, 0.4, 0.6);
    await clickAt(page, a);
    await clickAt(page, m);
    await clickAt(page, b);
    await page.keyboard.press('Enter');
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);
    var line = (await getPaths(page, 'lines'))[0][0];

    // without Alt, a middle vertex is not a place to start from
    await page.mouse.move(m[0] + 30, m[1] - 30);
    await page.mouse.move(m[0] + 2, m[1] - 2, {steps: 4});
    expect(await getHoverVertex(page)).toBe(null);
    await page.keyboard.down('Alt');
    await expect.poll(() => getHoverVertex(page)).not.toBe(null);
    await clickAt(page, [m[0] + 2, m[1] - 2]);
    await page.keyboard.up('Alt');
    await clickAt(page, mapPoint(box, 0.3, 0.85));
    await page.keyboard.press('Enter');
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(2);

    // a T junction: the new line starts exactly on the vertex
    var paths = await getPaths(page, 'lines');
    expectSamePath(paths[0][0], line);
    expectSamePath([paths[1][0][0]], [line[1]]);

    // and at the end of a line, Alt starts a new line rather than extending it
    await page.mouse.move(b[0] + 30, b[1] + 30);
    await page.keyboard.down('Alt');
    await page.mouse.move(b[0] + 2, b[1] + 2, {steps: 4});
    await clickAt(page, [b[0] + 2, b[1] + 2]);
    await page.keyboard.up('Alt');
    await clickAt(page, mapPoint(box, 0.5, 0.5));
    await page.keyboard.press('Enter');
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(3);
    expectSamePath((await getPaths(page, 'lines'))[0][0], line);
    expect(errors).toEqual([]);
  });

test('the reshape tool moves vertices and draws nothing', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await clickNewLayerLink(page, 'lines');
  var box = await getMapBox(page);
  var a = mapPoint(box, 0.2, 0.6), b = mapPoint(box, 0.4, 0.6);
  await drawLine(page, a, b);
  await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);

  await page.locator(RESHAPE_BUTTON).click();
  await page.waitForTimeout(150);
  expect(await getModes(page)).toEqual({mode: 'line_style', tool: 'reshape_lines'});
  await expect(page.locator(RESHAPE_BUTTON + '.selected')).toBeVisible();
  await expect(page.locator(LINE_BUTTON + '.selected')).toHaveCount(0);

  // a click on empty map starts no path
  await clickAt(page, mapPoint(box, 0.3, 0.85));
  expect(await getPendingPath(page)).toBe(null);

  // dragging the end of the line moves it
  var b2 = [b[0], b[1] + 40];
  await page.mouse.move(b[0] + 20, b[1] + 20);
  await page.mouse.move(b[0], b[1], {steps: 4});
  await page.mouse.down();
  await page.mouse.move(b[0], b[1] + 20);
  await page.mouse.move(b2[0], b2[1]);
  await page.mouse.up();
  await page.waitForTimeout(150);
  var path = (await getPaths(page, 'lines'))[0][0];
  expectNear(path[1], toMap(box, b2));
  expect(await getShapeCount(page, 'lines')).toBe(1);

  // dragging a point between two vertices inserts a vertex there, and moves it
  var mid = [Math.round((a[0] + b2[0]) / 2), Math.round((a[1] + b2[1]) / 2)];
  var mid2 = [mid[0], mid[1] - 50];
  await page.mouse.move(mid[0] + 20, mid[1] - 20);
  await page.mouse.move(mid[0], mid[1], {steps: 4});
  await expect.poll(() => getHoverVertex(page)).not.toBe(null);
  await expect(page.locator('.map-layers.reshape-vertex')).toHaveCount(1);
  expect(await page.locator('.map-layers').evaluate(el => getComputedStyle(el).cursor)).toBe('pointer');
  await page.mouse.down();
  await page.mouse.move(mid[0], mid[1] - 20);
  await page.mouse.move(mid2[0], mid2[1]);
  await page.mouse.up();
  await page.waitForTimeout(150);
  path = (await getPaths(page, 'lines'))[0][0];
  expect(path.length).toBe(3);
  expectNear(path[0], toMap(box, a));
  expectNear(path[1], toMap(box, mid2));
  expectNear(path[2], toMap(box, b2));

  // Esc disarms
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  expect(await getModes(page)).toEqual({mode: 'line_style', tool: 'line_style'});
  expect(errors).toEqual([]);
});

test('drawing polygons: a click inside a polygon starts a path, a click on its outline selects it',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await clickNewLayerLink(page, 'polygons');
    var box = await getMapBox(page);
    var p1 = mapPoint(box, 0.2, 0.4), p2 = mapPoint(box, 0.6, 0.4), p3 = mapPoint(box, 0.4, 0.9);
    await clickAt(page, p1);
    await clickAt(page, p2);
    await clickAt(page, p3);
    await page.keyboard.press('Enter');
    await expect.poll(() => getShapeCount(page, 'polygons')).toBe(1);

    // inside
    await clickAt(page, mapPoint(box, 0.4, 0.55));
    expect(await getSelectionIds(page)).toEqual([]);
    expect(await getPendingPath(page)).not.toBe(null);
    await page.keyboard.press('Escape'); // too short to make a polygon
    await page.waitForTimeout(100);
    expect(await getShapeCount(page, 'polygons')).toBe(1);

    // on the top edge
    await clickAt(page, mapPoint(box, 0.4, 0.4));
    expect(await getSelectionIds(page)).toEqual([0]);
    expect(await getPendingPath(page)).toBe(null);
    expect(errors).toEqual([]);
  });

test('the style panel can be hidden for room to draw, and Done leaves the mode',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await clickNewLayerLink(page, 'lines');
    var panel = page.locator('.layer-style-panel');
    var stylesBtn = page.locator('.line-draw-toolbar .floating-toolbar-btn[data-tooltip$="style panel"]');
    await expect(panel).toBeVisible();
    await expect(stylesBtn).toHaveClass(/selected/);

    // the toolbar button hides the panel, and drawing goes on without it
    await stylesBtn.click();
    await expect(panel).toBeHidden();
    await expect(stylesBtn).not.toHaveClass(/selected/);
    await expect(stylesBtn).toHaveAttribute('data-tooltip', 'Show style panel');
    expect(await getModes(page)).toEqual({mode: 'line_style', tool: 'edit_lines'});
    var box = await getMapBox(page);
    await drawLine(page, mapPoint(box, 0.2, 0.6), mapPoint(box, 0.4, 0.6));
    await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);

    // and shows it again
    await stylesBtn.click();
    await expect(panel).toBeVisible();
    await expect(stylesBtn).toHaveClass(/selected/);

    // the panel's close button hides it too, leaving the mode on
    await panel.locator('.label-style-close').click();
    await expect(panel).toBeHidden();
    expect((await getModes(page)).mode).toBe('line_style');

    // and it stays hidden the next time the mode is entered
    await page.evaluate(function() {
      window.mapshaper.undoTest.setInteractionMode('info');
    });
    await page.evaluate(function() {
      window.mapshaper.undoTest.setInteractionMode('line_style');
    });
    await expect(page.locator('.line-draw-toolbar')).toBeVisible();
    await expect(panel).toBeHidden();
    await expect(stylesBtn).not.toHaveClass(/selected/);

    // Done leaves the mode, and takes the toolbar with it
    await page.locator('.line-draw-toolbar .floating-toolbar-btn').filter({hasText: 'Done'}).click();
    await expect.poll(async () => (await getModes(page)).mode).not.toBe('line_style');
    await expect(page.locator('.line-draw-toolbar')).toBeHidden();
    expect(errors).toEqual([]);
  });

test('the menu has one mode for drawing and styling lines', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await clickNewLayerLink(page, 'lines');
  await drawLine(page, mapPoint(await getMapBox(page), 0.2, 0.6), mapPoint(await getMapBox(page), 0.4, 0.6));
  await expect.poll(() => getShapeCount(page, 'lines')).toBe(1);
  // leave the tool, whose panel the arrow button will not open the menu over
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('off');
  });
  await page.waitForTimeout(120);
  var items = await getModeMenuItems(page);
  expect(items).toContain('edit lines');
  expect(items).not.toContain('draw lines');
  expect(items).not.toContain('style lines');
  expect(errors).toEqual([]);
});

async function drawLine(page, a, b) {
  await clickAt(page, a);
  await clickAt(page, b);
  await page.keyboard.press('Enter');
}

async function getSelectionIds(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getSelectionIds();
  });
}

// the marked vertex, in display coords, or null
async function getHoverVertex(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getHoverVertex();
  });
}

async function getHitId(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getHitId();
  });
}

// the ids drawn by each overlay layer
async function getOverlayIds(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getOverlayInfo().map(function(o) { return o.ids; });
  });
}

async function getPaths(page, name) {
  return page.evaluate(function(name) {
    return window.mapshaper.undoTest.getLayerPathPixels(name);
  }, name);
}

async function undo(page) {
  await page.evaluate(function() { return window.mapshaper.undoTest.undo(); });
}

async function redo(page) {
  await page.evaluate(function() { return window.mapshaper.undoTest.redo(); });
}

// page coords -> pixels from the top left of the map
function toMap(box, p) {
  return [p[0] - box.x, p[1] - box.y];
}

function expectNear(p, q) {
  expect(Math.hypot(p[0] - q[0], p[1] - q[1])).toBeLessThan(1);
}

function expectSamePath(a, b) {
  expect(a.length).toBe(b.length);
  var maxDist = a.reduce(function(memo, p, i) {
    return Math.max(memo, Math.hypot(p[0] - b[i][0], p[1] - b[i][1]));
  }, 0);
  expect(maxDist).toBeLessThan(1e-6);
}

async function getModes(page) {
  return page.evaluate(function() {
    var api = window.mapshaper.undoTest;
    return {mode: api.getInteractionMode(), tool: api.getToolMode()};
  });
}

async function getModeMenuItems(page) {
  await page.locator('.pointer-btn').hover();
  await page.locator('.nav-sub-menu .nav-menu-item').first().waitFor();
  return page.locator('.nav-sub-menu .nav-menu-item').allInnerTexts();
}

async function getNewShapeStyle(page, type) {
  return page.evaluate(function(type) {
    return window.mapshaper.undoTest.getNewShapeStyle(type);
  }, type);
}

async function getPendingPathStyle(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getPendingPathStyle();
  });
}

async function getRecords(page, name) {
  return page.evaluate(function(name) {
    return window.mapshaper.undoTest.getLayerInfo(name).records;
  }, name);
}

function colorRow(page, label) {
  return page.locator('.layer-style-panel .label-split-row').filter({
    has: page.locator('.label-split-cell > span', {hasText: new RegExp('^' + label + '$')})
  });
}

async function setField(locator, value) {
  await locator.fill(value);
  await locator.press('Enter');
  await locator.page().waitForTimeout(250);
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

async function getPendingPath(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getPendingPathPixels();
  });
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
