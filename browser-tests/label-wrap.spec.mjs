import { expect, test } from '@playwright/test';

// Text blocks: labels with a label-width, wrapped as they are typed by the
// browser's own line breaker and stored with a <wbr> at each soft break.
//
// See docs/development/text-annotation-design.md.

var FIXTURE = 'test/data/features/snip/ring_and_line.json';
var TEXT = 'Mount Rainier National Park';

test('a text block wraps as it is typed', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'block');
  await dragAcrossMap(page, 0.3, 0.5, 70);
  await page.keyboard.type(TEXT);
  // wrapped while the session is still open
  await expect.poll(function() { return countLines(page); }).toBeGreaterThan(1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  var rec = await getRecord(page, 0);
  expect(Number(rec['label-width'])).toBe(70);
  expect(rec['label-text']).toContain('<wbr>');
  expect(rec['label-text'].replace(/<wbr>/g, '')).toBe(TEXT);
  // the committed label draws the lines it was typed into
  expect(await countLines(page)).toBe(rec['label-text'].split('<wbr>').length);
  expect(errors).toEqual([]);
});

test('a text block is rewrapped with its font, in one undo step', async function({page}) {
  var errors = collectPageErrors(page);
  await wrappedLabel(page, 120);
  var before = await getRecord(page, 0);
  await selectLabel(page, 0);
  await setFieldValue(page, '.label-size-row input', '20');
  await expect.poll(async function() {
    return String((await getRecord(page, 0))['font-size']);
  }).toBe('20');

  var after = await getRecord(page, 0);
  expect(after['label-text']).not.toBe(before['label-text']);
  expect(after['label-text'].replace(/<wbr>/g, '')).toBe(TEXT);
  // the rewrap is part of the style change, not a second edit
  var history = await page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory().commands;
  });
  expect(history[history.length - 1]).toMatch(/^-style font-size='20' -style label-text=/);
  expect(history.filter(function(cmd) { return /font-size/.test(cmd); }).length).toBe(1);

  await page.evaluate(function() { window.mapshaper.undoTest.undo(); });
  await page.waitForTimeout(250);
  var undone = await getRecord(page, 0);
  expect(undone['label-text']).toBe(before['label-text']);
  expect(undone['font-size']).toBe(before['font-size']);
  expect(errors).toEqual([]);
});

test('editing a text block edits the text as typed, and rewraps it', async function({page}) {
  var errors = collectPageErrors(page);
  await wrappedLabel(page, 70);
  await selectLabel(page, 0);
  await clickLabel(page, 0); // a second click reaches into the text
  await page.waitForTimeout(150);
  expect(await page.locator('.label-edit-input').inputValue()).toBe(TEXT);

  await page.keyboard.press('End');
  await page.keyboard.type(' and Wilderness');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  var rec = await getRecord(page, 0);
  expect(rec['label-text'].replace(/<wbr>/g, '')).toBe(TEXT + ' and Wilderness');
  expect(countBreaks(rec['label-text'])).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

// A label wrapped at @width, with nothing selected
async function wrappedLabel(page, width) {
  await loadFixture(page, FIXTURE);
  await armTool(page, 'block');
  await dragAcrossMap(page, 0.3, 0.5, width);
  await page.keyboard.type(TEXT);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await disarmTool(page);
}

// A drag of @width px to the right from a point on the map, which with the
// text block tool places a block that wide
async function dragAcrossMap(page, fx, fy, width) {
  var box = await page.locator('.mshp-main-map').boundingBox();
  var x = box.x + box.width * fx;
  var y = box.y + box.height * fy;
  await page.mouse.move(x - 3, y - 3);
  await page.mouse.move(x, y);
  await page.waitForTimeout(80);
  await page.mouse.down();
  await page.mouse.move(x + width, y, {steps: 8});
  await page.mouse.up();
  await page.waitForTimeout(150);
}

function countBreaks(str) {
  return str.split('<wbr>').length - 1;
}

// The lines the label's <text> is drawn in: its first, plus one per <tspan>.
// A label still being typed has no feature, and is drawn apart from its layer.
async function countLines(page) {
  return page.evaluate(function() {
    var node = document.querySelector('.label-edit-pending text') ||
      document.querySelector('.mapshaper-svg-symbol text, text.mapshaper-svg-symbol');
    return node ? node.querySelectorAll('tspan').length + 1 : 0;
  });
}

async function setFieldValue(page, selector, value) {
  var input = page.locator('.text-style-panel ' + selector);
  await input.fill(value);
  await input.press('Enter');
  await page.waitForTimeout(250);
}

async function selectLabel(page, id) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  await clickLabel(page, id);
  await expect.poll(function() {
    return page.locator('.text-style-panel .label-editing-status').textContent();
  }).toContain('1 selected');
}

// On the first glyph, rather than the middle of the text, which in a wrapped
// block can be the empty end of a short line
async function clickLabel(page, id) {
  var p = await page.evaluate(function(id) {
    var symbol = document.querySelector(
      '.mapshaper-symbol-layer .mapshaper-svg-symbol[data-id="' + id + '"]');
    var node = symbol.tagName == 'text' ? symbol : symbol.querySelector('text');
    var r = node.getExtentOfChar(0);
    var q = new DOMPoint(r.x + r.width / 2, r.y + r.height / 2)
      .matrixTransform(node.getScreenCTM());
    return {x: q.x, y: q.y};
  }, id);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(100);
}

async function getRecord(page, id) {
  return page.evaluate(function(id) {
    var lyr = window.mapshaper.undoTest.getLayerInfo('labels');
    return lyr && lyr.records ? lyr.records[id] : null;
  }, id);
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
  await page.evaluate(function() {
    window.mapshaper.undoTest.clearUndoHistory();
    window.mapshaper.undoTest.setInteractionMode('label');
  });
  await page.locator('.floating-toolbar.label-toolbar').waitFor();
}

async function armTool(page, kind) {
  var i = {anchor: 0, block: 1, path: 2}[kind];
  var btn = page.locator('.floating-toolbar.label-toolbar .floating-toolbar-btn').nth(i);
  if (!(await btn.evaluate(function(el) {
    return el.classList.contains('selected');
  }))) {
    await btn.click();
    await page.waitForTimeout(60);
  }
}

async function disarmTool(page) {
  var btns = page.locator('.floating-toolbar.label-toolbar .floating-toolbar-btn');
  for (var i = 0; i < 3; i++) {
    if (await btns.nth(i).evaluate(function(el) {
      return el.classList.contains('selected');
    })) {
      await btns.nth(i).click();
      await page.waitForTimeout(60);
    }
  }
}
