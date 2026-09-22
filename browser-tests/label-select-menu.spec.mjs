import { expect, test } from '@playwright/test';

// Selecting a group of labels from the context menu, so that a style can be
// changed across the group: "all labels", and the labels that share the
// pointed-at label's text style, colour or symbol.
//
// See docs/development/label-tool-design.md.

var FIXTURE = 'test/data/geojson/three_points.geojson';
// 435 points, which is more labels than the selection cue will outline
var MANY_FIXTURE = 'test/data/features/repel/ex1_cds.geojson';

test('right-clicking a label offers the groups it belongs to', async function({page}) {
  var errors = collectPageErrors(page);
  await threeLabels(page);
  await rightClickLabel(page, 1);

  // "selection" was the heading over copy and delete; those act on a
  // selection, and this section is how one is made, so they are now named for
  // what they are.
  // "select" comes first: it is what the actions below it would be applied to.
  expect(await menuHeadings(page))
    .toEqual(['select', 'actions', 'longitude, latitude']);
  // "copy as GeoJSON" is not there: it copies the selection, and a right-click
  // on an unselected label leaves the selection alone -- which is the point of
  // the section below.
  expect(await menuItems(page)).toContain('delete label');
  // Each select item carries the number it would select, so that what the
  // click is about to do is visible before it happens.
  expect(await selectItems(page))
    .toEqual(['all labels 3', 'same text style 3', 'same fill color 2']);
  // "Same text style" is offered whatever it matches, and here it matches the
  // layer -- a count that says the labels are uniform. No label has a symbol,
  // so "same icon" has nothing to ask about and is left out.
  expect(errors).toEqual([]);
});

test('a right-click leaves the selection it found alone', async function({page}) {
  // The predicate comes from the label pointed at, not from what is selected,
  // so the menu must not disturb what a right-click lands on.
  await threeLabels(page);
  await selectLabel(page, 0);
  await rightClickLabel(page, 1);

  expect(await getPanelStatus(page)).toContain('1 selected');
  expect(await getCueCount(page)).toBe(1);
});

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

test('a control shows "mixed" where the selected labels disagree',
  async function({page}) {
    // Blank is also what an unset property looks like, so a field blank
    // because the selection disagrees has to say which of the two it is.
    var errors = collectPageErrors(page);
    await threeLabels(page); // label 0 is a different colour
    await runCommand(page, '-style font-family=Georgia ids=0');
    await runCommand(page, '-style font-size=18 ids=1,2');
    await page.keyboard.press('ControlOrMeta+a');
    await page.waitForTimeout(150);

    var panel = page.locator('.text-style-panel');
    expect(await panel.locator('select').first().inputValue()).toBe('');
    expect(await panel.locator('select').first().locator('option').first()
      .textContent()).toBe('mixed');
    // the sizes disagree only because one label was left as it was: an unset
    // size is the size it renders at, and that is not 18
    expect(await placeholderOf(panel.locator('.label-size-row input'))).toBe('mixed');
    var colorRow = panel.locator('.label-color-row').first();
    expect(await colorRow.locator('.label-color-field input').inputValue()).toBe('');
    expect(await placeholderOf(colorRow.locator('.label-color-field input'))).toBe('mixed');
    // an empty swatch is how the field says "no colour", so a mixed one is
    // marked rather than left blank to mean two things
    await expect(colorRow.locator('.label-color-chit')).toHaveClass(/mixed/);
    expect(errors).toEqual([]);
  });

test('a control that agrees shows its value, and its own placeholder back',
  async function({page}) {
    await threeLabels(page);
    await runCommand(page, '-style fill=#cc0000');
    await runCommand(page, '-style font-size=18');
    await page.keyboard.press('ControlOrMeta+a');
    await page.waitForTimeout(150);

    var panel = page.locator('.text-style-panel');
    expect(await panel.locator('select').first().locator('option').first()
      .textContent()).not.toBe('mixed');
    expect(await panel.locator('.label-size-row input').inputValue()).toBe('18');
    var colorRow = panel.locator('.label-color-row').first();
    expect(await colorRow.locator('.label-color-field input').inputValue()).toBe('#cc0000');
    await expect(colorRow.locator('.label-color-chit')).not.toHaveClass(/mixed/);
    // a spacing field shows what the renderer does with a property nobody set,
    // which "mixed" displaces while the selection disagrees about it
    expect(await placeholderOf(
      panel.locator('.label-spacing-row .label-measure-input').last())).toBe('auto');
  });

test('a selection too large to outline is still visible', async function({page}) {
  // Over the cue's outline budget this drew nothing at all, so selecting a
  // whole layer to restyle it left the map looking untouched.
  var errors = collectPageErrors(page);
  await manyLabels(page);
  await rightClickLabel(page, firstRenderedId(page));
  await clickMenuItem(page, 'all labels');

  expect(await getPanelStatus(page)).toContain('435 selected');
  expect(await getCueCount(page)).toBe(0);
  expect(await getMarkedCount(page)).toBeGreaterThan(200);
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

async function manyLabels(page) {
  await loadFixture(page, MANY_FIXTURE);
  await runCommand(page, '-style \'label-text="L"+this.id\'');
  await enterLabelMode(page);
}

async function enterLabelMode(page) {
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('label');
  });
  await page.locator('.floating-toolbar.label-toolbar').waitFor();
  await page.waitForTimeout(150);
}

// The feature id of any rendered label, for a layer whose labels are too many
// and too small to pick one out of.
async function firstRenderedId(page) {
  return page.evaluate(function() {
    var node = document.querySelector(
      '.mapshaper-symbol-layer .mapshaper-svg-symbol[data-id]');
    return Number(node.getAttribute('data-id'));
  });
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

async function selectLabel(page, id) {
  var p = await labelPoint(page, id);
  await page.mouse.move(p.x - 8, p.y);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(120);
}

async function menuHeadings(page) {
  return page.locator('.contextmenu .contextmenu-label').allTextContents();
}

async function menuItems(page) {
  var items = await page.locator('.contextmenu .contextmenu-item').allTextContents();
  return items.map(cleanItemText);
}

// Without the bullet and the non-breaking space every item is prefixed with.
function cleanItemText(str) {
  return str.replace(/^[•✓]\s*/, '').replace(/\u00a0/g, '').trim();
}

// The items in the select section, which are the ones carrying a count.
async function selectItems(page) {
  var items = await page.locator(
    '.contextmenu .contextmenu-item:has(.contextmenu-count)').allTextContents();
  return items.map(cleanItemText);
}

async function clickMenuItem(page, text) {
  await page.locator('.contextmenu .contextmenu-item')
    .filter({hasText: text}).click();
  await page.waitForTimeout(250);
}

async function getCueCount(page) {
  return page.locator('.label-cue-selected').count();
}

async function getMarkedCount(page) {
  return page.locator('.label-cue-marked').count();
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

async function placeholderOf(locator) {
  return locator.first().getAttribute('placeholder');
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
