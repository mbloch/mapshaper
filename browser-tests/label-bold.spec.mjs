import { expect, test } from '@playwright/test';
import { closeSidebarAfterImport } from './sidebar-helpers.mjs';

// Bold words inside a label: selecting text in the label being typed into and
// setting it in bold from the keyboard or the context menu, with the result stored as
// <b> markup in label-text.
//
// See docs/development/label-tool-design.md.

var FIXTURE = 'test/data/features/snip/ring_and_line.json';

test('Cmd-B sets the selected words in bold, and saves them as markup', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('High terrain');
  await selectLeft(page, 7);
  await page.keyboard.press('ControlOrMeta+b');
  await page.waitForTimeout(60);

  expect(await getBoldTspans(page)).toEqual(['terrain']);
  // the text is still selected, so the same keystroke takes it back
  expect(await getTextareaSelection(page)).toEqual([5, 12]);

  await finishLabel(page);
  expect(await getLabelText(page, 0)).toBe('High <b>terrain</b>');
  expect(await getHistory(page)).toContain('High <b>terrain</b>');
  expect(errors).toEqual([]);
});

test('the context menu bolds the selected words, and takes them back', async function({page}) {
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno Nevada');
  await finishLabel(page);

  await clickLabel(page, 0);
  await clickLabel(page, 0);
  await page.keyboard.press('End');
  await selectLeft(page, 6);
  // right-clicking elsewhere in the text acts on the selection, not that word
  await rightClickGlyph(page, 0, 1);
  expect(await getMenuItems(page)).toContain('bold text');
  expect(await getTextareaSelection(page)).toEqual([5, 11]);
  await clickMenuItem(page, 'bold text');
  expect(await getBoldTspans(page)).toEqual(['Nevada']);
  // and the caret never left the label
  expect(await activeElementClass(page)).toBe('label-edit-input');

  await rightClickGlyph(page, 0, 7);
  expect(await getMenuItems(page)).not.toContain('bold text');
  await clickMenuItem(page, 'remove bold');
  expect(await getBoldTspans(page)).toEqual([]);

  await rightClickGlyph(page, 0, 7);
  await clickMenuItem(page, 'bold text');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  expect(await getLabelText(page, 0)).toBe('Reno <b>Nevada</b>');
  // one edit, one command
  expect((await getHistory(page)).match(/<b>/g)).toHaveLength(1);
});

test('with nothing selected, the context menu bolds the word right-clicked', async function({page}) {
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('after cease-fire now');
  await finishLabel(page);

  await clickLabel(page, 0);
  await clickLabel(page, 0);
  await rightClickGlyph(page, 0, 8);
  await clickMenuItem(page, 'bold text');
  expect(await getBoldTspans(page)).toEqual(['cease-fire']);
  expect(await getTextareaSelection(page)).toEqual([6, 16]);
});

test('the context menu bolds words in a label not created yet', async function({page}) {
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('High terrain');
  await rightClickPendingGlyph(page, 7);
  await clickMenuItem(page, 'bold text');
  expect(await getBoldTspans(page)).toEqual(['terrain']);
  await finishLabel(page);
  expect(await getLabelText(page, 0)).toBe('High <b>terrain</b>');
});

test('a label that is not open for typing has no bold item', async function({page}) {
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno Nevada');
  await finishLabel(page);

  await rightClickGlyph(page, 0, 7);
  var items = await getMenuItems(page);
  expect(items).toContain('delete label');
  expect(items).not.toContain('bold text');
});

test('typing on at the end of a bold word stays bold', async function({page}) {
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno');
  await selectLeft(page, 4);
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.press('End');
  await page.keyboard.type('s');
  await page.waitForTimeout(60);
  expect(await getBoldTspans(page)).toEqual(['Renos']);
});

test('double-clicking a word in an open label selects it', async function({page}) {
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('after cease-fire now');
  await finishLabel(page);

  await clickLabel(page, 0); // selects it
  await clickLabel(page, 0); // opens its text
  await dblclickGlyph(page, 0, 8);
  expect(await getTextareaSelection(page)).toEqual([6, 16]);
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  expect(await getLabelText(page, 0)).toBe('after <b>cease-fire</b> now');
});

test('dragging across an open label selects the text it passes over', async function({page}) {
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('North Dakota');
  await finishLabel(page);

  await clickLabel(page, 0);
  await clickLabel(page, 0);
  var from = await getGlyphPoint(page, 0, 6, 0.1);
  var to = await getGlyphPoint(page, 0, 11, 0.9);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, from.y, {steps: 4});
  await page.mouse.move(to.x, to.y, {steps: 4});
  await page.mouse.up();
  await page.waitForTimeout(120);

  expect(await getTextareaSelection(page)).toEqual([6, 12]);
  expect(await page.locator('.label-edit-selection').count()).toBeGreaterThan(0);
});

test('an existing label opens with its bold words, and saves them unchanged', async function({page}) {
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('High terrain');
  await selectLeft(page, 7);
  await page.keyboard.press('ControlOrMeta+b');
  await finishLabel(page);

  await clickLabel(page, 0);
  await clickLabel(page, 0);
  // the markup is not text to be edited
  expect(await page.evaluate(function() {
    return document.querySelector('.label-edit-input').value;
  })).toBe('High terrain');
  expect(await getBoldTspans(page)).toEqual(['terrain']);
  var before = await getHistory(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  expect(await getHistory(page)).toBe(before);
});

test('undo takes back bold set in a session', async function({page}) {
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno Nevada');
  await finishLabel(page);

  await clickLabel(page, 0);
  await clickLabel(page, 0);
  await page.keyboard.press('End');
  await selectLeft(page, 6);
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  expect(await getLabelText(page, 0)).toBe('Reno <b>Nevada</b>');

  await undo(page);
  expect(await getLabelText(page, 0)).toBe('Reno Nevada');
});

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

// Ends the session by clicking empty map, with nothing armed to place another.
async function finishLabel(page) {
  await disarmTool(page);
  await clickMap(page, 0.15, 0.85);
  await page.waitForTimeout(250);
}

async function clickLabel(page, id) {
  var box = await page.evaluate(function(args) {
    var node = document.querySelector(
      '.mapshaper-symbol-layer .mapshaper-svg-symbol[data-id="' + args.id + '"]');
    var r = node.getBoundingClientRect();
    return {x: r.x, y: r.y, width: r.width, height: r.height};
  }, {id: id});
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(120);
}

// A point @fx of the way across one rendered character, in page coordinates.
async function getGlyphPoint(page, id, charIndex, fx) {
  return page.evaluate(function(args) {
    var symbol = document.querySelector(
      '.mapshaper-symbol-layer .mapshaper-svg-symbol[data-id="' + args.id + '"]');
    var text = symbol.tagName == 'text' ? symbol : symbol.querySelector('text');
    var box = text.getExtentOfChar(args.charIndex);
    var pt = text.ownerSVGElement.createSVGPoint();
    pt.x = box.x + box.width * args.fx;
    pt.y = box.y + box.height / 2;
    pt = pt.matrixTransform(text.getScreenCTM());
    return {x: pt.x, y: pt.y};
  }, {id: id, charIndex: charIndex, fx: fx});
}

async function dblclickGlyph(page, id, charIndex) {
  var p = await getGlyphPoint(page, id, charIndex, 0.5);
  await page.mouse.dblclick(p.x, p.y);
  await page.waitForTimeout(120);
}

async function selectLeft(page, n) {
  for (var i = 0; i < n; i++) {
    await page.keyboard.press('Shift+ArrowLeft');
  }
  await page.waitForTimeout(60);
}

async function rightClickGlyph(page, id, charIndex) {
  var p = await getGlyphPoint(page, id, charIndex, 0.5);
  await page.mouse.click(p.x, p.y, {button: 'right'});
  await page.waitForTimeout(120);
}

async function rightClickPendingGlyph(page, charIndex) {
  var p = await page.evaluate(function(args) {
    var text = document.querySelector('.label-edit-pending text');
    var box = text.getExtentOfChar(args.charIndex);
    var pt = text.ownerSVGElement.createSVGPoint();
    pt.x = box.x + box.width / 2;
    pt.y = box.y + box.height / 2;
    pt = pt.matrixTransform(text.getScreenCTM());
    return {x: pt.x, y: pt.y};
  }, {charIndex: charIndex});
  await page.mouse.click(p.x, p.y, {button: 'right'});
  await page.waitForTimeout(120);
}

// The labels of the open context menu's items, without their bullets.
async function getMenuItems(page) {
  return page.evaluate(function() {
    var nodes = document.querySelectorAll('.contextmenu .contextmenu-item');
    return Array.prototype.filter.call(nodes, function(node) {
      return node.offsetParent !== null;
    }).map(function(node) {
      return node.textContent.replace(/^\W+/, '').trim();
    });
  });
}

// The menu hides a moment after an item is chosen, and it opens beside the
// pointer, so a right-click before then would land on the menu.
async function clickMenuItem(page, label) {
  var item = page.locator('.contextmenu .contextmenu-item:visible', {hasText: label});
  await item.click();
  await page.locator('.contextmenu:visible').waitFor({state: 'hidden'});
}

// The text of every bold run in the label being edited, or in the first label
// on the map when none is open.
async function getBoldTspans(page) {
  return page.evaluate(function() {
    var host = document.querySelector('.label-edit-pending') ||
      document.querySelector('.mapshaper-symbol-layer');
    var nodes = host ? host.querySelectorAll('tspan[font-weight="bold"]') : [];
    return Array.prototype.map.call(nodes, function(node) {
      return node.textContent;
    });
  });
}

async function getTextareaSelection(page) {
  return page.evaluate(function() {
    var input = document.querySelector('.label-edit-input');
    return [input.selectionStart, input.selectionEnd];
  });
}

async function activeElementClass(page) {
  return page.evaluate(function() {
    return document.activeElement && document.activeElement.getAttribute('class');
  });
}

async function undo(page) {
  await page.evaluate(function() { window.mapshaper.undoTest.undo(); });
  await page.waitForTimeout(150);
}

async function getHistory(page) {
  return JSON.stringify(await page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory();
  }));
}

async function getLabelText(page, id) {
  return page.evaluate(function(args) {
    var lyr = window.mapshaper.undoTest.getLayerInfo('labels');
    var rec = lyr && lyr.records ? lyr.records[args.id] : null;
    return rec ? rec['label-text'] : null;
  }, {id: id});
}
