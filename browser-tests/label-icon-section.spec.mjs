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

test('a selection where only some labels have a symbol is marked mixed',
  async function({page}) {
    var errors = collectPageErrors(page);
    await twoLabels(page);
    await giveIcon(page, 0);
    await selectLabels(page, [0, 1]);

    expect(await getPanelStatus(page)).toContain('2 selected');
    expect(await getSectionPresence(page, PANEL, SECTION)).toBe('mixed');
    expect(await page.locator(PANEL + ' .' + SECTION + ' .label-section-marker')
      .getAttribute('aria-label')).toBe('Applied to some of the selection');
    // The section stays usable: there is a symbol in the selection to style,
    // and the shape the labels that have one share is the shape shown.
    expect(await shapesAreInert(page)).toBe(false);
    expect(await getSelectedShape(page)).toBe('circle');
    expect(errors).toEqual([]);
  });

test('the marker is on or off when the selection agrees', async function({page}) {
  await twoLabels(page);
  await selectLabels(page, [0, 1]);
  expect(await getSectionPresence(page, PANEL, SECTION)).toBe('off');
  // With no symbol the shapes are still live, since choosing one is how a
  // symbol is added
  expect(await shapesAreInert(page)).toBe(false);

  await clickShape(page, 'circle');
  await selectLabels(page, [0, 1]);
  expect(await getSectionPresence(page, PANEL, SECTION)).toBe('on');
});

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

test('a shape applied to a mixed selection gives every label the symbol size they share',
  async function({page}) {
    // Choosing a shape for a group is a plain statement about all of it, so
    // this one control does reach the labels with no symbol -- and the size it
    // gives them is the one already in the selection, not the default.
    await twoLabels(page);
    await giveIcon(page, 0);
    await selectLabels(page, [0]);
    await setIconSize(page, 9);
    await selectLabels(page, [0, 1]);
    await clickShape(page, 'star');

    expect(await getLabelField(page, 0, 'icon')).toBe('star');
    expect(await getLabelField(page, 1, 'icon')).toBe('star');
    expect(String(await getLabelField(page, 1, 'icon-size'))).toBe('9');
  });

test('the NYT star is offered only to NYT users', async function({page}) {
  await twoLabels(page, 'nyt=off');
  await selectLabels(page, [0]);
  expect(await getShapeNames(page)).toEqual(['circle', 'square', 'star', 'ring']);

  await twoLabels(page, 'nyt=on');
  await selectLabels(page, [0]);
  expect(await getShapeNames(page)).toEqual(['circle', 'square', 'star', 'ring', 'nyt-star']);
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
    expect(await getLabelField(page, 0, 'icon-color')).toBe('#cc0000');
    // the red was the shape's, not the user's, so it goes with the shape
    await clickShape(page, 'circle');
    expect(String(await getLabelField(page, 0, 'icon-size'))).toBe('5');
    expect(await getLabelField(page, 0, 'icon-color')).toBeFalsy();
    expect(errors).toEqual([]);
  });

test('a size chosen by hand survives a change of shape', async function({page}) {
  await twoLabels(page, 'nyt=on');
  await giveIcon(page, 0);
  await setIconSize(page, 12);
  await clickShape(page, 'nyt-star');
  expect(String(await getLabelField(page, 0, 'icon-size'))).toBe('12');
});

async function getShapeNames(page) {
  return page.locator('.text-style-panel .label-icon-buttons [data-icon]')
    .evaluateAll(function(nodes) {
      return nodes.map(function(node) { return node.getAttribute('data-icon'); });
    });
}

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

// Whether the shape buttons are inert, which they are only with nothing to
// style at all.
async function shapesAreInert(page) {
  return page.locator('.text-style-panel .label-icon-buttons').evaluate(function(el) {
    return el.classList.contains('disabled');
  });
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
