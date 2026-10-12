import { expect, test } from '@playwright/test';
import {
  getSectionPresence, openSection, removeSectionStyle
} from './style-panel-helpers.mjs';

// The Icon section of the label style panel, and what it does when the
// selected labels disagree about having a symbol.
//
// The section's heading says whether the labels have a symbol -- all, some or
// none of them. Choosing a shape adds one, the heading's × removes it, and the
// size and colour act on the labels that have a symbol rather than creating
// symbols on the rest.
//
// See docs/development/label-tool-design.md.

var FIXTURE = 'test/data/features/snip/ring_and_line.json';
var PANEL = '.text-style-panel';
var SECTION = 'label-icon-section';

test('the × takes the symbol off every selected label, with its settings',
  async function({page}) {
    await twoLabels(page);
    await giveIcon(page, 0);
    await setIconSize(page, 9);
    await selectLabels(page, [0, 1]);
    await removeSectionStyle(page, PANEL, SECTION);

    expect(await getLabelField(page, 0, 'icon')).toBeFalsy();
    expect(await getLabelField(page, 0, 'icon-size')).toBeFalsy();
    expect(await getLabelField(page, 1, 'icon')).toBeFalsy();
    expect(await page.evaluate(function() {
      return window.mapshaper.undoTest.getLayerInfo('labels').records.some(function(rec) {
        return Object.keys(rec).some(function(k) {
          return /^icon/.test(k) && rec[k] !== undefined && rec[k] !== null && rec[k] !== '';
        });
      });
    })).toBe(false);
    expect(await getSectionPresence(page, PANEL, SECTION)).toBe('off');
  });

test('a symbol size set on a mixed selection goes only to the labels that have one',
  async function({page}) {
    // An icon-size on a label with no icon draws nothing and adds a column to
    // the user's table. Choosing a shape stays the way to ask for a symbol.
    var errors = collectPageErrors(page);
    await twoLabels(page);
    await giveIcon(page, 0);
    await selectLabels(page, [0, 1]);
    await setIconSize(page, 9);

    expect(String(await getLabelField(page, 0, 'icon-size'))).toBe('9');
    expect(await getLabelField(page, 1, 'icon-size')).toBeFalsy();
    expect(await getLabelField(page, 1, 'icon')).toBeFalsy();
    expect(errors).toEqual([]);
  });

test('each shape starts at its own size, and the NYT star in its own red',
  async function({page}) {
    var errors = collectPageErrors(page);
    await twoLabels(page, 'nyt=on');
    await giveIcon(page, 0);
    expect(String(await getLabelField(page, 0, 'icon-size'))).toBe('5');

    await clickShape(page, 'ring');
    expect(String(await getLabelField(page, 0, 'icon-size'))).toBe('8');
    await clickShape(page, 'nyt-star');
    expect(String(await getLabelField(page, 0, 'icon-size'))).toBe('14');
    expect(await getLabelField(page, 0, 'icon-stroke')).toBe('#cc0000');
    // its outline has the logo's weight
    expect(await page.locator('.text-style-panel .label-icon-stroke-width-row').isVisible()).toBe(false);
    // the red was the shape's, not the user's, so it goes with the shape
    await clickShape(page, 'circle');
    expect(String(await getLabelField(page, 0, 'icon-size'))).toBe('5');
    expect(await getLabelField(page, 0, 'icon-stroke')).toBeFalsy();
    expect(errors).toEqual([]);
  });

test('a ring is a stroke whose width can be set, and it can take a fill', async function({page}) {
  var errors = collectPageErrors(page);
  await twoLabels(page);
  await giveIcon(page, 0);
  var fill = page.locator('.text-style-panel .label-icon-fill-row .label-color-input');
  var stroke = page.locator('.text-style-panel .label-icon-stroke-row .label-color-input');
  // a circle is filled, in the text's color, and has no stroke
  expect(await fill.inputValue()).toBe('#000000');
  expect(await stroke.inputValue()).toBe('');

  await clickShape(page, 'ring');
  expect(await fill.inputValue()).toBe('');
  expect(await stroke.inputValue()).toBe('#000000');
  await setPanelField(page, '.label-icon-stroke-width-row input', '3');
  expect(String(await getLabelField(page, 0, 'icon-stroke-width'))).toBe('3');
  await setPanelField(page, '.label-icon-fill-row .label-color-input', '#ffcc00');
  expect(await getLabelField(page, 0, 'icon-fill')).toBe('#ffcc00');
  // and the ring is drawn so
  expect(await page.locator('svg circle[stroke-width="3"]').getAttribute('fill')).toBe('#ffcc00');
  expect(errors).toEqual([]);
});

test('a triangle is a polygon of three sides, which goes when the shape changes',
  async function({page}) {
    // The shapes are the symbol tool's, and a triangle is stored as -symbols
    // stores one, which takes two fields where the other shapes take one.
    var errors = collectPageErrors(page);
    await twoLabels(page);
    await giveIcon(page, 0);
    await clickShape(page, 'triangle');
    expect(await getLabelField(page, 0, 'icon')).toBe('polygon');
    expect(Number(await getLabelField(page, 0, 'icon-sides'))).toBe(3);
    expect(String(await getLabelField(page, 0, 'icon-size'))).toBe('8');
    expect(await getSelectedShape(page)).toBe('triangle');
    expect(await page.locator('.mapshaper-svg-symbol[data-id="0"] path, ' +
      '.mapshaper-svg-symbol[data-id="0"] polygon').count()).toBeGreaterThan(0);

    await clickShape(page, 'star');
    expect(await getLabelField(page, 0, 'icon')).toBe('star');
    expect(await getLabelField(page, 0, 'icon-sides')).toBeFalsy();
    expect(errors).toEqual([]);
  });

// Two anchored labels, with nothing selected.
async function twoLabels(page, query) {
  await loadFixture(page, FIXTURE, query);
  await armTool(page, 'anchor');
  await clickMap(page, 0.25, 0.35);
  await writeLabel(page, 'Reno');
  await armTool(page, 'anchor');
  await clickMap(page, 0.25, 0.65);
  await writeLabel(page, 'Tahoe');
  await disarmTool(page);
  await openSection(page, PANEL, SECTION);
}

// Gives one label a circle, by choosing the shape -- which is how a symbol is
// asked for.
async function giveIcon(page, id) {
  await selectLabels(page, [id]);
  await clickShape(page, 'circle');
  await expect.poll(function() {
    return getLabelField(page, id, 'icon');
  }).toBe('circle');
}

// Selects labels by shift-clicking each of them, which adds rather than
// replaces -- and never opens a text editing session, as a plain click on the
// sole selected label would.
async function selectLabels(page, ids) {
  // Escape gives up whatever was selected, so that shift-clicking builds the
  // selection from nothing however the previous step left it.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  for (var i = 0; i < ids.length; i++) {
    await shiftClickLabel(page, ids[i]);
  }
  await expect.poll(function() {
    return getPanelStatus(page);
  }).toContain(ids.length + ' selected');
}

async function shiftClickLabel(page, id) {
  var box = await page.evaluate(function(args) {
    var symbol = document.querySelector(
      '.mapshaper-symbol-layer .mapshaper-svg-symbol[data-id="' + args.id + '"]');
    // A label with no symbol renders as the <text> node itself; one with an
    // icon renders as a group containing it. The glyphs are what is clicked.
    var node = symbol.tagName == 'text' ? symbol : symbol.querySelector('text');
    var r = node.getBoundingClientRect();
    return {x: r.x, y: r.y, width: r.width, height: r.height};
  }, {id: id});
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(100);
}

async function getSelectedShape(page) {
  return page.locator('.text-style-panel .label-icon-buttons .selected')
    .getAttribute('data-icon');
}

async function clickShape(page, name) {
  await page.locator('.text-style-panel .label-icon-buttons ' +
    '[data-icon="' + name + '"]').click();
  await page.waitForTimeout(250);
}

async function setPanelField(page, selector, value) {
  var input = page.locator('.text-style-panel ' + selector);
  await input.fill(String(value));
  await input.press('Enter');
  await page.waitForTimeout(250);
}

async function setIconSize(page, value) {
  var input = page.locator('.text-style-panel .label-icon-size-row input');
  await input.fill(String(value));
  await input.press('Enter');
  await page.waitForTimeout(250);
}

async function getPanelStatus(page) {
  return page.locator('.text-style-panel .label-editing-status').textContent();
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

async function loadFixture(page, fixture, query) {
  await page.goto('/?undo=on&undo-test=on&' + (query ? query + '&' : '') +
    'files=' + encodeURIComponent(fixture));
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
  var x = box.x + box.width * fx;
  var y = box.y + box.height * fy;
  await page.mouse.click(x, y);
  await page.waitForTimeout(80);
}

async function writeLabel(page, text) {
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
}
