import { expect, test } from '@playwright/test';

// The Callout section of the label style panel, and the collapsing of every
// section whose heading carries a switch -- Halo, Icon and Callout -- while
// that switch is off.
//
// See docs/development/text-annotation-design.md.

var FIXTURE = 'test/data/features/snip/ring_and_line.json';

test('sections with a switch collapse to their heading while off', async function({page}) {
  var errors = collectPageErrors(page);
  await oneLabel(page);
  await selectLabels(page, [0]);
  expect(await sectionIsCollapsed(page, 'halo')).toBe(true);
  expect(await sectionIsCollapsed(page, 'icon')).toBe(true);
  expect(await sectionIsCollapsed(page, 'callout')).toBe(true);
  // The Text section has no switch, and never collapses.
  expect(await page.locator('.text-style-panel .label-style-section').first()
    .evaluate(function(el) { return el.classList.contains('collapsed'); })).toBe(false);

  await clickToggle(page, 'icon');
  await expect.poll(function() { return getLabelField(page, 0, 'icon'); }).toBe('circle');
  expect(await sectionIsCollapsed(page, 'icon')).toBe(false);
  expect(await page.locator('.text-style-panel .label-icon-buttons').isVisible()).toBe(true);

  await clickToggle(page, 'icon');
  await expect.poll(function() { return getLabelField(page, 0, 'icon'); }).toBeFalsy();
  expect(await sectionIsCollapsed(page, 'icon')).toBe(true);
  expect(await page.locator('.text-style-panel .label-icon-buttons').isVisible()).toBe(false);
  expect(errors).toEqual([]);
});

// Every colour carries its opacity inside its own field, which leaves the
// narrow column of its row for the value that qualifies it most closely.
test('each colour row has its opacity inside the field and a value beside it',
  async function({page}) {
    await oneLabel(page);
    await runCommand(page, '-style dx=40 dy=-40 label-pos= target=labels');
    await selectLabels(page, [0]);
    await clickToggle(page, 'halo');
    await clickToggle(page, 'icon');
    await clickToggle(page, 'callout');
    expect(await page.evaluate(function() {
      var rows = document.querySelectorAll(
        '.text-style-panel .label-style-section .label-split-row');
      return Array.prototype.map.call(rows, function(row) {
        return Array.prototype.map.call(row.children, function(cell) {
          var span = cell.querySelector(':scope > span');
          return span ? span.textContent : '-';
        }).join(' | ');
      });
    })).toEqual([
      '- | -', // font style and size
      'Color | Letter spacing',
      'Alignment | Line height',
      'Color | Width', // halo
      'Color | Size', // icon
      'Line | Width',
      'End | Size',
      'Color | Gap'
    ]);
    expect(await page.locator('.text-style-panel .label-color-field .label-opacity-input').count()).toBe(4);
  });

test('the callout switch draws a straight line, and the section styles it', async function({page}) {
  var errors = collectPageErrors(page);
  await oneLabel(page);
  // Far enough from the anchor for a line to have somewhere to go
  await runCommand(page, '-style dx=40 dy=-40 label-pos= target=labels');
  await selectLabels(page, [0]);

  await clickToggle(page, 'callout');
  await expect.poll(function() { return getLabelField(page, 0, 'callout'); }).toBe('line');
  expect(await sectionIsCollapsed(page, 'callout')).toBe(false);
  expect(await getSelectedButton(page, 0)).toBe('line');
  expect(await getSelectedButton(page, 1)).toBe('none');
  await expect.poll(function() { return countCalloutPaths(page); }).toBe(1);

  await clickCalloutButton(page, 'elbow');
  await expect.poll(function() { return getLabelField(page, 0, 'callout'); }).toBe('elbow');
  await clickCalloutButton(page, 'arrow');
  await expect.poll(function() { return getLabelField(page, 0, 'callout-end'); }).toBe('arrow');
  // the line and its arrowhead
  await expect.poll(function() { return countCalloutPaths(page); }).toBe(2);
  await clickCalloutButton(page, 'none');
  await expect.poll(function() { return getLabelField(page, 0, 'callout-end'); }).toBeFalsy();

  var gap = page.locator('.text-style-panel .label-callout-toggle')
    .locator('xpath=ancestor::div[contains(@class,"label-style-section")]')
    .locator('input.label-measure-input');
  await gap.fill('0');
  await gap.press('Enter');
  await expect.poll(function() { return getLabelField(page, 0, 'callout-gap'); }).toBe(0);
  // 0 is a gap, not a blank: the field shows it
  expect(await gap.inputValue()).toBe('0');
  await gap.fill('');
  await gap.press('Enter');
  await expect.poll(function() { return getLabelField(page, 0, 'callout-gap'); }).toBeFalsy();

  // Off removes the shape alone, so that on again brings back the look it had.
  await runCommand(page, '-style callout-width=2 target=labels');
  await selectLabels(page, [0]);
  await clickToggle(page, 'callout');
  await expect.poll(function() { return getLabelField(page, 0, 'callout'); }).toBeFalsy();
  expect(await getLabelField(page, 0, 'callout-width')).toBe(2);
  expect(await countCalloutPaths(page)).toBe(0);
  await clickToggle(page, 'callout');
  await expect.poll(function() { return getLabelField(page, 0, 'callout'); }).toBe('elbow');
  expect(errors).toEqual([]);
});

test('the marker size shows the drawn size, and is inert with no marker', async function({page}) {
  var errors = collectPageErrors(page);
  await oneLabel(page);
  await runCommand(page, '-style dx=40 dy=-40 label-pos= callout=line target=labels');
  await selectLabels(page, [0]);
  var size = page.locator('.text-style-panel .label-callout-end-size-row .size-field-input');
  expect(await size.isDisabled()).toBe(true);

  await clickCalloutButton(page, 'open-arrow');
  await expect.poll(function() { return getLabelField(page, 0, 'callout-end'); }).toBe('open-arrow');
  expect(await size.isDisabled()).toBe(false);
  // the default for a 1px line, which nothing has written
  expect(await size.inputValue()).toBe('10');
  expect(await getLabelField(page, 0, 'callout-end-size')).toBeFalsy();
  // a stroked chevron: the line, and a second unfilled path
  expect(await page.evaluate(function() {
    var paths = document.querySelectorAll('.mapshaper-svg-symbol .label-callout path');
    return paths.length == 2 && paths[1].getAttribute('fill') == 'none';
  })).toBe(true);

  await size.fill('14');
  await size.press('Enter');
  await expect.poll(function() { return getLabelField(page, 0, 'callout-end-size'); }).toBe(14);
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

async function sectionIsCollapsed(page, name) {
  return page.locator('.text-style-panel .label-' + name + '-toggle')
    .evaluate(function(el) {
      return el.closest('.label-style-section').classList.contains('collapsed');
    });
}

async function clickToggle(page, name) {
  await page.locator('.text-style-panel .label-' + name + '-toggle').click();
  await page.waitForTimeout(250);
}

// @group: 0 for the shapes, 1 for the ends
async function getSelectedButton(page, group) {
  return page.locator('.text-style-panel .label-callout-buttons').nth(group)
    .locator('.selected').getAttribute('data-callout');
}

async function clickCalloutButton(page, name) {
  await page.locator('.text-style-panel .label-callout-buttons ' +
    '[data-callout="' + name + '"]').click();
  await page.waitForTimeout(250);
}

async function countCalloutPaths(page) {
  return page.evaluate(function() {
    return document.querySelectorAll(
      '.mapshaper-symbol-layer .mapshaper-svg-symbol .label-callout path').length;
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
  var box = await page.evaluate(function(args) {
    var symbol = document.querySelector(
      '.mapshaper-symbol-layer .mapshaper-svg-symbol[data-id="' + args.id + '"]');
    var node = symbol.tagName == 'text' ? symbol : symbol.querySelector('text');
    var r = node.getBoundingClientRect();
    return {x: r.x, y: r.y, width: r.width, height: r.height};
  }, {id: id});
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(100);
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

async function clickMap(page, fx, fy) {
  var box = await page.locator('.mshp-main-map').boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(80);
}
