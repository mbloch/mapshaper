import { expect, test } from '@playwright/test';

// The Background row of the label style panel -- a colour, its opacity and the
// label's padding -- and the background's rect following the text as it is
// typed and dragged.
//
// See docs/development/text-annotation-design.md.

var FIXTURE = 'test/data/features/snip/ring_and_line.json';

test('the background row sets a colour and a CSS padding', async function({page}) {
  var errors = collectPageErrors(page);
  await oneLabel(page);
  await selectLabels(page, [0]);
  expect(await countBackgrounds(page)).toBe(0);

  var color = page.locator('.text-style-panel input[aria-label="Background color"]');
  await color.fill('#ffee00');
  await color.press('Enter');
  await expect.poll(function() { return getLabelField(page, 0, 'label-background'); }).toBe('#ffee00');
  await expect.poll(function() { return countBackgrounds(page); }).toBe(1);

  var padding = page.locator('.text-style-panel .label-padding-row input');
  await padding.fill('2  6');
  await padding.press('Enter');
  await expect.poll(function() { return getLabelField(page, 0, 'label-padding'); }).toBe('2 6');
  // the rect is 12px wider than the text, and 4px taller than its box
  await expect.poll(function() { return getBackgroundToTextWidth(page); }).toBeGreaterThan(11);

  // not a padding: refused, and the field goes back to what the label has
  await padding.fill('1 2 3 4 5');
  await padding.press('Enter');
  await page.waitForTimeout(200);
  expect(await getLabelField(page, 0, 'label-padding')).toBe('2 6');
  expect(await padding.inputValue()).toBe('2 6');

  // an emptied colour removes the background and leaves the padding
  await color.fill('');
  await color.press('Enter');
  await expect.poll(function() { return getLabelField(page, 0, 'label-background'); }).toBeFalsy();
  expect(await countBackgrounds(page)).toBe(0);
  expect(await getLabelField(page, 0, 'label-padding')).toBe('2 6');
  expect(errors).toEqual([]);
});

// One anchored label, with nothing selected.
async function oneLabel(page) {
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.3, 0.5);
  await page.keyboard.type('Reno');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await disarmTool(page);
}

async function countBackgrounds(page) {
  return page.evaluate(function() {
    return document.querySelectorAll(
      '.mapshaper-symbol-layer .mapshaper-svg-symbol .label-background').length;
  });
}

async function getBackgroundToTextWidth(page) {
  return page.evaluate(function() {
    var symbol = document.querySelector('.mapshaper-svg-symbol[data-id="0"]');
    var rect = symbol && symbol.querySelector('.label-background');
    var text = symbol && symbol.querySelector('text');
    return rect && text ? Number(rect.getAttribute('width')) - text.getBBox().width : 0;
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
  var box = await getTextBox(page, id);
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(100);
}

async function getTextBox(page, id) {
  return page.evaluate(function(args) {
    var symbol = document.querySelector(
      '.mapshaper-symbol-layer .mapshaper-svg-symbol[data-id="' + args.id + '"]');
    var node = symbol.tagName == 'text' ? symbol : symbol.querySelector('text');
    var r = node.getBoundingClientRect();
    return {x: r.x, y: r.y, width: r.width, height: r.height};
  }, {id: id});
}

async function getLabelField(page, id, field) {
  return page.evaluate(function(args) {
    var lyr = window.mapshaper.undoTest.getLayerInfo('labels');
    var rec = lyr && lyr.records ? lyr.records[args.id] : null;
    return rec ? rec[args.field] : null;
  }, {id: id, field: field});
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
