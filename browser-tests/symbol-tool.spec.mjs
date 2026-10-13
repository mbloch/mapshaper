import { expect, test } from '@playwright/test';
import { openLayersPanel } from './sidebar-helpers.mjs';

test('the tool places a symbol in a session that has imported nothing', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  // entering the mode makes the layer the tool needs, and arms placement,
  // since there is nothing to select
  var lyr = await getSymbolLayer(page);
  expect(lyr.shapeCount).toBe(0);
  expect(await isArmed(page, 'icon')).toBe(true);

  await clickMap(page, 0.3, 0.5);
  lyr = await getSymbolLayer(page);
  expect(lyr.shapeCount).toBe(1);
  expect(lyr.geometryTypes).toEqual(['Point']);
  expect(lyr.records[0].r).toBe(5);
  expect(lyr.records[0].fill).toBe('#333333');
  expect(errors).toEqual([]);
});

test("the panel sets the next symbol's style while nothing is selected", async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await page.locator('.symbol-style-panel .label-icon-buttons [data-icon="star"]').click();
  await setSize(page, '20');
  await clickMap(page, 0.3, 0.5);
  var rec = (await getSymbolLayer(page)).records[0];
  expect(rec.icon).toBe('star');
  expect(rec['icon-size']).toBe(20);
  expect(errors).toEqual([]);
});

test('a ring is a stroke, as wide as the panel says, and can take a fill', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await page.locator('.symbol-style-panel .label-icon-buttons [data-icon="ring"]').click();
  // the circle's fill moves to the ring's stroke
  expect(await page.locator('.symbol-style-panel input[aria-label="Fill color"]').first().inputValue()).toBe('');
  expect(await page.locator('.symbol-style-panel input[aria-label="Stroke color"]').first().inputValue()).toBe('#333333');
  await setStrokeWidth(page, '3');
  await setColor(page, 'Fill', '#ffcc00');
  await clickMap(page, 0.3, 0.5);
  var rec = (await getSymbolLayer(page)).records[0];
  expect(rec.icon).toBe('ring');
  expect(rec['icon-stroke']).toBe('#333333');
  expect(rec['icon-stroke-width']).toBe(3);
  expect(rec['icon-fill']).toBe('#ffcc00');
  var drawn = await page.evaluate(function() {
    var node = document.querySelector('.mapshaper-svg-symbol[data-id="0"]');
    var circle = node && (node.tagName == 'circle' ? node : node.querySelector('circle'));
    return circle ? {fill: circle.getAttribute('fill'),
      width: circle.getAttribute('stroke-width')} : null;
  });
  expect(drawn).toEqual({fill: '#ffcc00', width: '3'});
  expect(errors).toEqual([]);
});

test('NYT users are offered the NYT star, which is placed in its red', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page, 'nyt=on');
  var star = page.locator('.symbol-style-panel .label-icon-buttons [data-icon="nyt-star"]');
  expect(await star.count()).toBe(1);
  await star.click();
  await clickMap(page, 0.3, 0.5);
  var rec = (await getSymbolLayer(page)).records[0];
  expect(rec.icon).toBe('nyt-star');
  expect(rec['icon-stroke']).toBe('#cc0000');
  expect(rec['icon-fill']).toBe('#ffffff');
  // its outline has the logo's weight
  expect(await page.locator('.symbol-style-panel .label-split-cell:has(.size-field-input) >> nth=1').isVisible()).toBe(false);
  expect(await page.locator('.mapshaper-svg-symbol[data-id="0"]').count()).toBe(1);
  expect(errors).toEqual([]);
});

test('a curve is drawn by clicking and finished with Enter', async function({page}) {
  var errors = collectPageErrors(page);
  var consoleErrors = [];
  page.on('console', function(msg) {
    if (msg.type() == 'error') consoleErrors.push(msg.text());
  });
  await openTool(page);
  await armTool(page, 'curve');
  await clickMap(page, 0.2, 0.6);
  await clickMap(page, 0.3, 0.4);
  await clickMap(page, 0.4, 0.6);
  // the curve being drawn is previewed, and is not data yet
  expect((await getSymbolLayer(page)).shapeCount).toBe(0);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);

  var lyr = await getSymbolLayer(page);
  expect(lyr.pointCounts).toEqual([3]);
  expect(lyr.records[0].icon).toBe('curve');
  expect(lyr.records[0]['line-end']).toBe('arrow');
  expect(lyr.records[0].stroke).toBe('#333333');
  // the empty layer was drawn on the canvas, and its first curve makes it an
  // SVG layer, which a hover redraw can reach before the full one
  expect(consoleErrors.filter(function(msg) {
    return msg.includes('[reposition]');
  })).toEqual([]);
  expect(errors).toEqual([]);
});

test('a curve is redrawn when the map zooms, staying on its knots', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await armTool(page, 'curve');
  await clickMap(page, 0.3, 0.3);
  await clickMap(page, 0.4, 0.5);
  await clickMap(page, 0.5, 0.4);
  await clickMap(page, 0.6, 0.6);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await armTool(page, null);
  await clickMap(page, 0.4, 0.5);
  expect(await getSelection(page)).toEqual([0]);

  var box = await page.locator('.mshp-main-map').boundingBox();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(800);
  var drawn = await page.evaluate(function() {
    var node = document.querySelector('.mapshaper-svg-symbol[data-id="0"]');
    var path = node.querySelector('path:not(.curve-hit-area)').getBoundingClientRect();
    var knots = Array.from(document.querySelectorAll('.label-cue-knot')).map(function(k) {
      var r = k.getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2];
    });
    return {path: [path.left, path.top, path.right, path.bottom], first: knots[0],
      last: knots[knots.length - 1]};
  });
  // the curve runs from its first knot to its last, as it did before the zoom
  expect(Math.abs(drawn.path[0] - drawn.first[0])).toBeLessThan(8);
  expect(Math.abs(drawn.path[1] - drawn.first[1])).toBeLessThan(8);
  expect(Math.abs(drawn.path[2] - drawn.last[0])).toBeLessThan(8);
  expect(Math.abs(drawn.path[3] - drawn.last[1])).toBeLessThan(8);
  expect(errors).toEqual([]);
});

test('a curve takes the layer panel\'s arrowheads, and is colored by "Color"', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await armTool(page, 'curve');
  var section = page.locator('.symbol-style-panel');
  expect(await section.locator('input[aria-label="Curve color"]').inputValue()).toBe('#333333');
  expect(await section.locator('.label-split-cell:has(input[aria-label="Curve color"]) > span').first().textContent()).toBe('Color');
  await section.locator('[data-arrow-shape="open-arrow"]').click();
  await section.locator('[data-arrowheads="both"]').click();
  await clickMap(page, 0.2, 0.6);
  await clickMap(page, 0.3, 0.4);
  await clickMap(page, 0.4, 0.6);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  var rec = (await getSymbolLayer(page)).records[0];
  expect(rec['line-start']).toBe('open-arrow');
  expect(rec['line-end']).toBe('open-arrow');
  expect(errors).toEqual([]);
});

test('in a layer of circles and icons, an icon is hovered and selected', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await clickMap(page, 0.25, 0.5);
  await page.locator('.symbol-style-panel .label-icon-buttons [data-icon="star"]').click();
  await clickMap(page, 0.4, 0.5);
  await armTool(page, null);
  var box = await page.locator('.mshp-main-map').boundingBox();
  var x = box.x + box.width * 0.4, y = box.y + box.height * 0.5;
  // off the star's painted area, but within the circle that covers it
  await page.mouse.move(x + 4, y - 4);
  await expect(page.locator('.symbol-halo-hovered')).toHaveCount(1);
  await page.mouse.click(x, y);
  await page.waitForTimeout(150);
  expect(await getSelection(page)).toEqual([1]);
  await expect(page.locator('.symbol-halo-selected')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('with no tool armed and nothing selected, the panel edits every symbol', async function({page}) {
  var errors = collectPageErrors(page);
  var status = page.locator('.symbol-style-panel .label-editing-status');
  await openTool(page);
  await expect(status).toHaveText('Editing: new symbols');
  await clickMap(page, 0.3, 0.5);
  await clickMap(page, 0.5, 0.5);
  await armTool(page, null);
  await expect(status).toHaveText('Editing: all');
  await setColor(page, 'Fill', '#ff0000');
  var lyr = await getSymbolLayer(page);
  expect(lyr.records.map(function(rec) { return rec.fill; })).toEqual(['#ff0000', '#ff0000']);
  // restyling them all does not select them
  expect(await getSelection(page)).toEqual([]);
  await armTool(page, 'curve');
  await expect(status).toHaveText('Editing: new symbols');
  expect(errors).toEqual([]);
});

test('a symbol layer opens the symbol tool from the layer menu, and has no point tools', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await page.locator('.symbol-style-panel .label-icon-buttons [data-icon="star"]').click();
  await clickMap(page, 0.3, 0.5);
  await page.evaluate(function() { window.mapshaper.undoTest.setInteractionMode('off'); });
  await page.locator('.pointer-btn').hover();
  await page.locator('.nav-sub-menu .nav-menu-item').first().waitFor();
  var items = await page.locator('.nav-sub-menu .nav-menu-item').allInnerTexts();
  expect(items).toContain('edit symbols');
  expect(items).not.toContain('style points');
  expect(items).not.toContain('edit points');
  await page.mouse.move(0, 0);

  await openLayersPanel(page);
  var item = page.locator('.layer-list .layer-item').filter({hasText: 'symbols'}).first();
  await item.hover();
  await item.locator('.more-btn').click();
  await page.locator('.contextmenu-item').filter({hasText: 'edit symbols'}).click();
  expect(await page.evaluate(function() {
    return window.mapshaper.undoTest.getInteractionMode();
  })).toBe('symbols');
  await expect(page.locator('.symbol-style-panel')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a symbol in a layer that shares its name with another can be edited', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await page.locator('.symbol-style-panel .label-icon-buttons [data-icon="star"]').click();
  await clickMap(page, 0.3, 0.5);
  // the layer menu's "duplicate layer", which keeps the name
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand('-filter true + name=symbols');
  });
  await page.waitForTimeout(250);
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('symbols');
  });
  await page.locator('.symbol-style-panel').waitFor();
  await armTool(page, null);
  var p = await getSymbolCentre(page, 0);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(150);
  await dragBy(page, p, 40, 20);
  await setColor(page, 'Fill', '#ff0000');
  var history = await getSessionHistory(page);
  expect(history).toContain('-update-symbol ids=0');
  // the commands run on the active layer: a target= naming it would match both
  expect(history).not.toMatch(/-update-symbol [^"]*target=/);
  expect(history).toContain('-symbols ids=0 ');
  expect(history).not.toMatch(/-symbols ids=0 [^"]*target=/);
  expect(await page.locator('.alert-wrapper').filter({hasText: 'single target layer'}).count()).toBe(0);
  expect(errors).toEqual([]);
});

test('clicking the first knot closes a curve', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await armTool(page, 'curve');
  // the curve section's Fill waits for a closed curve, which has an inside
  var curveFill = page.locator('.symbol-style-panel input[aria-label="Fill color"]').last();
  await expect(curveFill).toBeHidden();
  await clickMap(page, 0.2, 0.6);
  await clickMap(page, 0.3, 0.4);
  await clickMap(page, 0.4, 0.6);
  await clickMap(page, 0.2, 0.6);
  var lyr = await getSymbolLayer(page);
  expect(lyr.pointCounts).toEqual([4]);
  // a closed curve has no ends to put arrowheads on
  expect(lyr.records[0]['line-end']).toBeUndefined();
  await armTool(page, null);
  await expect(curveFill).toBeVisible();
  expect(errors).toEqual([]);
});

test('a symbol is selected by clicking it, and dragged to move it', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  // a star, which is drawn in SVG, where the cues are too
  await page.locator('.symbol-style-panel .label-icon-buttons [data-icon="star"]').click();
  await clickMap(page, 0.3, 0.5);
  await armTool(page, null);
  var before = (await getSymbolLayer(page)).shapes[0];
  var p = await getSymbolCentre(page, 0);

  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(150);
  expect(await getSelection(page)).toEqual([0]);
  // a halo beneath the star, in the overlay's selection color
  var halo = await page.evaluate(function() {
    var g = document.querySelector('.symbol-halo.symbol-halo-selected');
    var shape = g && g.querySelector('path,polygon,circle');
    return g ? {next: g.nextElementSibling.getAttribute('data-id'),
      opacity: g.getAttribute('opacity'), stroke: shape.style.stroke, fill: shape.style.fill} : null;
  });
  expect(halo).toEqual({next: '0', opacity: '0.25', stroke: 'rgb(255, 198, 0)', fill: 'none'});
  expect(await page.locator('.label-cue-box').count()).toBe(0);

  await dragBy(page, p, 40, 20);
  var lyr = await getSymbolLayer(page);
  expect(lyr.shapeCount).toBe(1);
  expect(lyr.shapes[0]).not.toEqual(before);
  // the moved symbol stays selected, for the next drag or edit
  expect(await getSelection(page)).toEqual([0]);
  expect(await getSessionHistory(page)).toContain('-update-symbol ids=0');
  expect(errors).toEqual([]);
});

test('the panel restyles the selected symbol', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await clickMap(page, 0.3, 0.5);
  await armTool(page, null);
  // a plain circle is drawn on canvas, so it is clicked where it was placed
  await clickMap(page, 0.3, 0.5);
  expect(await getSelection(page)).toEqual([0]);

  await page.locator('.symbol-style-panel .label-icon-buttons [data-icon="square"]').click();
  await page.waitForTimeout(200);
  var rec = (await getSymbolLayer(page)).records[0];
  expect(rec.icon).toBe('square');
  // the circle's own fields go, and the size and color carry over
  expect(rec.r).toBeUndefined();
  expect(rec['icon-fill']).toBe('#333333');
  expect(await getSelection(page)).toEqual([0]);

  // a stroke given a color and no width gets one it can be seen at
  await setColor(page, 'Stroke', '#ff0000');
  rec = (await getSymbolLayer(page)).records[0];
  expect(rec['icon-stroke']).toBe('#ff0000');
  expect(rec['icon-stroke-width']).toBe(1);
  expect(rec['icon-fill']).toBe('#333333');

  await setSize(page, '16');
  rec = (await getSymbolLayer(page)).records[0];
  // a size is the stored icon-size, as in the label panel
  expect(rec['icon-size']).toBe(16);
  expect(errors).toEqual([]);
});

test('Delete removes the selected symbols, and undo brings them back', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await clickMap(page, 0.25, 0.5);
  await clickMap(page, 0.35, 0.5);
  expect((await getSymbolLayer(page)).shapeCount).toBe(2);
  await armTool(page, null);
  await clickMap(page, 0.25, 0.5);
  expect(await getSelection(page)).toEqual([0]);

  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);
  expect((await getSymbolLayer(page)).shapeCount).toBe(1);

  await page.evaluate(function() { return window.mapshaper.undoTest.undo(); });
  await page.waitForTimeout(250);
  expect((await getSymbolLayer(page)).shapeCount).toBe(2);
  expect(errors).toEqual([]);
});

test('Escape steps back from a selection to an armed tool to nothing', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await clickMap(page, 0.3, 0.5);
  await clickMap(page, 0.3, 0.5);
  // a click on a symbol selects it rather than placing another on top of it
  expect((await getSymbolLayer(page)).shapeCount).toBe(1);
  expect(await getSelection(page)).toEqual([0]);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(60);
  expect(await getSelection(page)).toEqual([]);
  expect(await isArmed(page, 'icon')).toBe(true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(60);
  expect(await isArmed(page, 'icon')).toBe(false);
  expect(errors).toEqual([]);
});

test("the panel's close button hides the panel and leaves the tool on", async function({page}) {
  var errors = collectPageErrors(page);
  var panel = page.locator('.symbol-style-panel');
  var stylesBtn = page.locator('.symbol-toolbar .floating-toolbar-btn[data-tooltip$="style panel"]');
  await openTool(page);
  await panel.locator('.label-style-close').click();
  await expect(panel).toBeHidden();
  expect(await getInteractionMode(page)).toBe('symbols');
  // still placing symbols with the panel out of the way
  await clickMap(page, 0.3, 0.5);
  expect((await getSymbolLayer(page)).shapeCount).toBe(1);
  await stylesBtn.click();
  await expect(panel).toBeVisible();
  await page.locator('.symbol-toolbar .floating-toolbar-btn', {hasText: 'Done'}).click();
  expect(await getInteractionMode(page)).not.toBe('symbols');
  expect(errors).toEqual([]);
});

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}

async function openTool(page, query) {
  await page.goto('/?undo=on&undo-test=on' + (query ? '&' + query : ''));
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest;
  });
  await page.locator('#import-options .cancel-btn').click();
  await page.waitForTimeout(150);
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('symbols');
  });
  await page.locator('.floating-toolbar.symbol-toolbar').waitFor();
  await page.locator('.symbol-style-panel').waitFor();
}

function toolbarButtons(page) {
  return page.locator('.floating-toolbar.symbol-toolbar .floating-toolbar-content > .floating-toolbar-btn');
}

async function isArmed(page, kind) {
  var i = {icon: 0, curve: 1}[kind];
  return toolbarButtons(page).nth(i).evaluate(function(el) {
    return el.classList.contains('selected');
  });
}

// Arms @kind ('icon' or 'curve'), or disarms both for null
async function armTool(page, kind) {
  var names = ['icon', 'curve'];
  for (var i = 0; i < names.length; i++) {
    if (await isArmed(page, names[i]) != (names[i] == kind)) {
      await toolbarButtons(page).nth(i).click();
      await page.waitForTimeout(60);
    }
  }
}

async function clickMap(page, fx, fy) {
  var box = await page.locator('.mshp-main-map').boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(200);
}

async function setColor(page, label, value) {
  // the symbol section's, which comes before the curve section's
  var input = page.locator('.symbol-style-panel input[aria-label="' + label + ' color"]').first();
  await input.fill(value);
  await input.press('Enter');
  await page.waitForTimeout(200);
}

async function setStrokeWidth(page, value) {
  var input = page.locator('.symbol-style-panel .size-field-input').nth(1);
  await input.fill(value);
  await input.press('Enter');
  await page.waitForTimeout(200);
}

async function setSize(page, value) {
  var input = page.locator('.symbol-style-panel .size-field-input').first();
  await input.fill(value);
  await input.press('Enter');
  await page.waitForTimeout(200);
}

async function getSymbolCentre(page, id) {
  return page.evaluate(function(args) {
    var node = document.querySelector('.mapshaper-svg-symbol[data-id="' + args.id + '"]');
    var r = node.getBoundingClientRect();
    return {x: r.x + r.width / 2, y: r.y + r.height / 2};
  }, {id: id});
}

async function dragBy(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  // a moment on the spot, because what a drag takes hold of is found on hover
  await page.waitForTimeout(80);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, {steps: 8});
  await page.mouse.up();
  await page.waitForTimeout(250);
}

async function getSymbolLayer(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getLayerInfo('symbols');
  });
}

async function getViewBounds(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getViewBounds();
  });
}

async function getInteractionMode(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getInteractionMode();
  });
}

async function getSelection(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getSelectionIds();
  });
}

async function getSessionHistory(page) {
  return JSON.stringify(await page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory();
  }));
}
