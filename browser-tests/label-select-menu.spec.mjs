import { expect, test } from '@playwright/test';

// Selecting a group of labels from the context menu, so that a style can be
// changed across the group: "all labels", and the labels that share the
// pointed-at label's text style, colour or symbol.
//
// See docs/development/label-tool-design.md.

var FIXTURE = 'test/data/geojson/three_points.geojson';

test('all labels selects the layer', async function({page}) {
  var errors = collectPageErrors(page);
  await threeLabels(page);
  await rightClickLabel(page, 1);
  await clickMenuItem(page, 'all labels');

  expect(await getPanelStatus(page)).toContain('3 selected');
  expect(await getCueCount(page)).toBe(3);
  expect(errors).toEqual([]);
});

test('same fill color selects the labels that share it', async function({page}) {
  await threeLabels(page);
  await rightClickLabel(page, 1);
  await clickMenuItem(page, 'same fill color');

  expect(await getPanelStatus(page)).toContain('2 selected');
  expect(await getSelectedIds(page)).toEqual([1, 2]);
});

test('a style set on a selected group goes to all of it in one command',
  async function({page}) {
    // What the selection is for: the panel already wrote to every selected
    // label, and this is the whole path from the menu to the data.
    var errors = collectPageErrors(page);
    await threeLabels(page);
    await rightClickLabel(page, 1);
    await clickMenuItem(page, 'same fill color');
    await setFontSize(page, 18);

    expect(await getLabelField(page, 0, 'font-size')).toBeFalsy();
    expect(String(await getLabelField(page, 1, 'font-size'))).toBe('18');
    expect(String(await getLabelField(page, 2, 'font-size'))).toBe('18');
    expect(await getCommandHistory(page)).toContain('ids=1,2');
    expect(errors).toEqual([]);
  });

test('Cmd-A selects every label without going through the menu',
  async function({page}) {
    // The keyboard way to the menu's "all labels", for the commonest of the
    // group selections: restyling a layer's labels as one.
    var errors = collectPageErrors(page);
    await threeLabels(page);
    await page.keyboard.press('ControlOrMeta+a');
    await page.waitForTimeout(150);

    expect(await getPanelStatus(page)).toContain('3 selected');
    expect(await getCueCount(page)).toBe(3);
    // and the page itself is not selected, which is what the key does
    // otherwise and what the map is full of text nodes for
    expect(await getPageSelection(page)).toBe('');
    expect(errors).toEqual([]);
  });

// Three labels, one of them a different colour, made through the console: this
// is about the menu rather than about label creation.
async function threeLabels(page) {
  await loadFixture(page, FIXTURE);
  await runCommand(page, '-style \'label-text="L"+this.id\'');
  await runCommand(page, '-style fill=#cc0000 ids=0');
  await enterLabelMode(page);
}

async function enterLabelMode(page) {
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('label');
  });
  await page.locator('.floating-toolbar.label-toolbar').waitFor();
  await page.waitForTimeout(150);
}

async function labelPoint(page, idArg) {
  var id = await idArg;
  return page.evaluate(function(arg) {
    var symbol = document.querySelector(
      '.mapshaper-symbol-layer .mapshaper-svg-symbol[data-id="' + arg + '"]');
    var node = symbol.tagName == 'text' ? symbol : symbol.querySelector('text');
    var r = node.getBoundingClientRect();
    return {x: r.x + r.width / 2, y: r.y + r.height / 2};
  }, id);
}

// The hit id comes from the last hover, so the pointer arrives before the
// button goes down -- as it does for a user. It arrives in two moves: the map
// tests the pointer on a move it has seen arrive, so a single jump onto the
// label is over nothing as far as the hit control is concerned.
async function rightClickLabel(page, id) {
  var p = await labelPoint(page, id);
  await page.mouse.move(p.x - 8, p.y);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(100);
  await page.mouse.click(p.x, p.y, {button: 'right'});
  await page.locator('.contextmenu').waitFor();
  await page.waitForTimeout(80);
}

async function clickMenuItem(page, text) {
  await page.locator('.contextmenu .contextmenu-item')
    .filter({hasText: text}).click();
  await page.waitForTimeout(250);
}

async function getCueCount(page) {
  return page.locator('.label-cue-selected').count();
}

async function getSelectedIds(page) {
  return page.evaluate(function() {
    return Array.prototype.map.call(
      document.querySelectorAll('.label-cue-selected'),
      function(g) {
        return Number(g.nextSibling.getAttribute('data-id'));
      }).sort(function(a, b) { return a - b; });
  });
}

async function setFontSize(page, value) {
  var input = page.locator('.text-style-panel .label-size-row input');
  await input.fill(String(value));
  await input.press('Enter');
  await page.waitForTimeout(300);
}

async function getPageSelection(page) {
  return page.evaluate(function() {
    return String(window.getSelection());
  });
}

async function getPanelStatus(page) {
  return page.locator('.text-style-panel .label-editing-status').textContent();
}

async function getCommandHistory(page) {
  return JSON.stringify(await page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory();
  }));
}

async function getLabelField(page, id, field) {
  return page.evaluate(function(args) {
    var lyr = window.mapshaper.undoTest.getState().model.activeLayer;
    var info = window.mapshaper.undoTest.getLayerInfo(lyr);
    var rec = info && info.records ? info.records[args.id] : null;
    return rec ? rec[args.field] : null;
  }, {id: id, field: field});
}

async function runCommand(page, command) {
  await page.evaluate(function(str) {
    return window.mapshaper.undoTest.runCommand(str);
  }, command);
  await page.waitForTimeout(200);
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
  });
}
