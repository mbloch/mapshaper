import { expect, test } from '@playwright/test';
import { closeSidebarAfterImport } from './sidebar-helpers.mjs';

// The handles on a selected anchored label -- its width, and its callout's
// bend, attachment and gap -- the text drag that carries a callout along, and
// the text block tool.
//
// See docs/development/text-annotation-design.md.

var FIXTURE = 'test/data/features/snip/ring_and_line.json';
var TEXT = 'Mount Rainier National Park and Preserve';

test('the via handle bends an elbow, and a double-click straightens it',
  async function({page}) {
    var errors = collectPageErrors(page);
    await oneLabel(page, 'Reno');
    await runCommand(page, '-style dx=80 dy=-80 label-pos= text-anchor=start ' +
      'callout=elbow target=labels');
    await selectLabels(page, [0]);
    var via = await getHandlePoint(page, 'via');
    expect(via).not.toBeNull();
    expect(await getHandlePoint(page, 'attach')).not.toBeNull();

    await dragBy(page, via, 30, 10);
    await expect.poll(function() { return getLabelField(page, 0, 'callout-via'); })
      .toMatch(/^-?[.\d]+,-?[.\d]+$/);
    var history = await getHistory(page);
    expect(history[history.length - 1]).toMatch(/^-labels callout-via='[^']+' ids=0/);

    via = await getHandlePoint(page, 'via');
    await page.mouse.dblclick(via.x, via.y);
    await expect.poll(function() { return getLabelField(page, 0, 'callout-via'); })
      .toBeFalsy();
    expect(errors).toEqual([]);
  });

test('the attachment handle slides around the text box', async function({page}) {
  var errors = collectPageErrors(page);
  await oneLabel(page, 'Reno');
  await runCommand(page, '-style dx=80 dy=-80 label-pos= text-anchor=start ' +
    'callout=line target=labels');
  await selectLabels(page, [0]);
  var attach = await getHandlePoint(page, 'attach');
  await dragBy(page, attach, 60, 40);
  await expect.poll(function() { return getLabelField(page, 0, 'callout-attach'); })
    .toMatch(/,/);
  var f = (await getLabelField(page, 0, 'callout-attach')).split(',').map(Number);
  // a point on the edge of the box
  expect(f.every(function(n) { return n >= 0 && n <= 1; })).toBe(true);
  expect(f.some(function(n) { return n === 0 || n === 1; })).toBe(true);
  expect(errors).toEqual([]);
});

test('dragging the text carries a hand-placed bend with it, unless Alt is held',
  async function({page}) {
    var errors = collectPageErrors(page);
    await oneLabel(page, 'Reno');
    await runCommand(page, '-style dx=80 dy=-80 label-pos= text-anchor=start ' +
      'callout=elbow callout-via=40,-60 target=labels');
    await selectLabels(page, [0]);
    await setDragMode(page, 'draggable');
    var glyphs = await getGlyphPoint(page, 0);

    await dragBy(page, glyphs, 80, 0);
    await expect.poll(function() { return getLabelField(page, 0, 'dx').then(Number); }).toBeGreaterThan(100);
    var via = (await getLabelField(page, 0, 'callout-via')).split(',').map(Number);
    expect(via[0]).toBeGreaterThan(40);
    expect(via[1]).toBe(-60);
    // one command for the text and the bend
    var history = await getHistory(page);
    expect(history[history.length - 1]).toMatch(/^-labels dx=.* callout-via=/);

    glyphs = await getGlyphPoint(page, 0);
    await page.keyboard.down('Alt');
    await dragBy(page, glyphs, 0, -40);
    await page.keyboard.up('Alt');
    await expect.poll(function() { return getLabelField(page, 0, 'dy').then(Number); }).toBeLessThan(-100);
    expect((await getLabelField(page, 0, 'callout-via')).split(',').map(Number)).toEqual(via);
    expect(errors).toEqual([]);
  });

test('a text block placed with a click shows its column, and is left-aligned',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await armTool(page, 'block');
    await clickMap(page, 0.3, 0.5);
    // before anything is typed: the column, and the box around the caret in it
    var boxes = await getEditBoxes(page);
    expect(boxes.column).not.toBeNull();
    expect(boxes.column.width).toBeGreaterThan(150);
    expect(boxes.box.width).toBeLessThan(40);
    await page.keyboard.type(TEXT);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    var rec = await getRecord(page, 0);
    expect(Number(rec['label-width'])).toBe(160);
    expect(rec['text-anchor']).toBe('start');
    expect(rec['label-pos']).toBeUndefined();
    expect(rec['label-text']).toContain('<wbr>');

    // selected: a solid box around the wrapped text, the dashed column around
    // it, and the width handle on the column's corner
    await selectLabels(page, [0]);
    var cue = await getCueBoxes(page);
    expect(cue.column.width).toBeGreaterThan(cue.box.width);
    var handle = await getHandlePoint(page, 'width');
    expect(Math.abs(handle.x - (cue.column.x + cue.column.width))).toBeLessThan(2);
    expect(errors).toEqual([]);
  });

test('a drag with the text block tool sets its width, on a new label layer too',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await clickNewLayerLink(page, 'labels');
    await armTool(page, 'block');
    var box = await page.locator('.mshp-main-map').boundingBox();
    var from = {x: box.x + box.width * 0.4, y: box.y + box.height * 0.3};
    await page.mouse.move(from.x - 3, from.y - 3);
    await page.mouse.move(from.x, from.y);
    await page.waitForTimeout(80);
    await page.mouse.down();
    await page.mouse.move(from.x + 90, from.y, {steps: 8});
    // the layer has no labels, and so no markup of its own to draw into
    expect(await page.locator('.label-block-guide').count()).toBe(1);
    await page.mouse.up();
    await page.waitForTimeout(250);
    expect(await page.locator('.label-block-guide').count()).toBe(0);
    await page.keyboard.type(TEXT);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    var rec = await getRecord(page, 0);
    expect(Number(rec['label-width'])).toBe(90);
    expect(rec['text-anchor']).toBe('start');

    // leftward, the block ends where the drag started, and is still
    // left-aligned
    await armTool(page, 'block');
    await dragBy(page, {x: box.x + box.width * 0.6, y: box.y + box.height * 0.7}, -90, 0);
    await page.keyboard.type(TEXT);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    rec = await getRecord(page, 1);
    expect(Number(rec['label-width'])).toBe(90);
    expect(rec['text-anchor']).toBe('start');
    expect(errors).toEqual([]);
  });

async function getEditBoxes(page) {
  return page.evaluate(function() {
    function r(sel) {
      var el = document.querySelector(sel);
      var b = el ? el.getBoundingClientRect() : null;
      return b ? {x: b.x, y: b.y, width: b.width, height: b.height} : null;
    }
    return {column: r('.label-edit-column'), box: r('.label-edit-box')};
  });
}

async function getCueBoxes(page) {
  return page.evaluate(function() {
    function r(sel) {
      var el = document.querySelector(sel);
      var b = el ? el.getBoundingClientRect() : null;
      return b ? {x: b.x, y: b.y, width: b.width, height: b.height} : null;
    }
    return {column: r('.label-cue-selected .label-cue-column'),
      box: r('.label-cue-selected .label-cue-box')};
  });
}

async function clickNewLayerLink(page, kind) {
  var links = page.locator('.new-layer-links');
  if (!(await links.isVisible())) {
    await page.locator('.layer-tab:visible').click();
    await links.waitFor({state: 'visible'});
  }
  await page.locator('.new-layer-links .layer-menu-link[data-kind="' + kind + '"]').click();
  await page.waitForTimeout(250);
  if (await links.isVisible()) {
    await page.locator('.layer-tab:visible').click();
    await page.waitForTimeout(150);
  }
}

// One anchored label, with nothing selected.
async function oneLabel(page, text) {
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.3, 0.6);
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await disarmTool(page);
}

// The screen position of one of the selected label's handles, or null
async function getHandlePoint(page, kind) {
  return page.evaluate(function(kind) {
    var el = document.querySelector('.label-cue-handles [data-handle="' + kind + '"]');
    var r = el ? el.getBoundingClientRect() : null;
    return r ? {x: r.x + r.width / 2, y: r.y + r.height / 2} : null;
  }, kind);
}

async function getGlyphPoint(page, id) {
  return page.evaluate(function(id) {
    var symbol = document.querySelector(
      '.mapshaper-symbol-layer .mapshaper-svg-symbol[data-id="' + id + '"]');
    var node = symbol.tagName == 'text' ? symbol : symbol.querySelector('text');
    var r = node.getBoundingClientRect();
    return {x: r.x + r.width / 2, y: r.y + r.height / 2};
  }, id);
}

// The first glyph, rather than the middle of the text, which in a wrapped
// block can be the empty end of a short line; or with @index -1, the last
async function getFirstGlyphPoint(page, id, index) {
  return page.evaluate(function(args) {
    var symbol = document.querySelector(
      '.mapshaper-symbol-layer .mapshaper-svg-symbol[data-id="' + args.id + '"]');
    var node = symbol.tagName == 'text' ? symbol : symbol.querySelector('text');
    var r = node.getExtentOfChar(args.index == -1 ? node.getNumberOfChars() - 1 : 0);
    var m = node.getScreenCTM();
    var q = new DOMPoint(r.x + r.width / 2, r.y + r.height / 2).matrixTransform(m);
    return {x: q.x, y: q.y};
  }, {id: id, index: index || 0});
}

async function dragBy(page, from, dx, dy) {
  // From a step away: a drag that starts where the last one ended gets no
  // hover in between, and the hover is what finds the thing under the pointer
  await page.mouse.move(from.x - 3, from.y - 3);
  await page.mouse.move(from.x, from.y);
  // a moment on the spot, because what a drag takes hold of is found on hover
  await page.waitForTimeout(80);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, {steps: 8});
  await page.mouse.up();
  await page.waitForTimeout(250);
}

async function setDragMode(page, mode) {
  await page.locator('.text-style-panel .label-drag-mode-buttons [data-drag-mode="' +
    mode + '"]').click();
  await page.waitForTimeout(150);
}

async function getHistory(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory().commands;
  });
}

async function runCommand(page, str) {
  await page.evaluate(function(cmd) {
    return window.mapshaper.undoTest.runCommand(cmd);
  }, str);
  await page.waitForTimeout(250);
}

async function selectLabels(page, ids) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  for (var i = 0; i < ids.length; i++) {
    await shiftClickLabel(page, ids[i]);
  }
  await expect.poll(function() {
    return page.locator('.text-style-panel .label-editing-status').textContent();
  }).toContain(ids.length + ' selected');
}

async function shiftClickLabel(page, id) {
  var p = await getFirstGlyphPoint(page, id);
  await page.keyboard.down('Shift');
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(100);
}

async function getRecord(page, id) {
  return page.evaluate(function(id) {
    var lyr = window.mapshaper.undoTest.getLayerInfo('labels');
    return lyr && lyr.records ? lyr.records[id] : null;
  }, id);
}

async function getLabelField(page, id, field) {
  var rec = await getRecord(page, id);
  return rec ? rec[field] : null;
}

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}

async function loadFixture(page, fixture) {
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(fixture));
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest;
  });
  await page.waitForFunction(function() {
    return window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
  await closeSidebarAfterImport(page);
  await page.evaluate(function() {
    window.mapshaper.undoTest.clearUndoHistory();
    window.mapshaper.undoTest.setInteractionMode('label');
  });
  await page.locator('.floating-toolbar.label-toolbar').waitFor();
}

async function armTool(page, kind) {
  var i = {anchor: 0, block: 1, path: 2}[kind];
  var btn = page.locator('.floating-toolbar.label-toolbar .floating-toolbar-content > .floating-toolbar-btn').nth(i);
  if (!(await btn.evaluate(function(el) {
    return el.classList.contains('selected');
  }))) {
    await btn.click();
    await page.waitForTimeout(60);
  }
}

async function disarmTool(page) {
  var btns = page.locator('.floating-toolbar.label-toolbar .floating-toolbar-content > .floating-toolbar-btn');
  for (var i = 0; i < 3; i++) {
    if (await btns.nth(i).evaluate(function(el) {
      return el.classList.contains('selected');
    })) {
      await btns.nth(i).click();
      await page.waitForTimeout(60);
    }
  }
}

async function clickMap(page, fx, fy) {
  var box = await page.locator('.mshp-main-map').boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(80);
}
