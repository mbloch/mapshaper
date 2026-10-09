import { expect, test } from '@playwright/test';
import {
  getSectionPresence, openSection, removeSectionStyle, sectionIsOpen
} from './style-panel-helpers.mjs';

// The Callout section of the label style panel, and the opening and closing
// of the panel's sections from their headings.
//
// See docs/development/text-annotation-design.md.

var FIXTURE = 'test/data/features/snip/ring_and_line.json';
var PANEL = '.text-style-panel';

test('sections open and close from their headings, which say what the selection has',
  async function({page}) {
    var errors = collectPageErrors(page);
    await oneLabel(page);
    await selectLabels(page, [0]);
    // Only Text starts open
    expect(await sectionIsOpen(page, PANEL, 'label-halo-section')).toBe(false);
    expect(await sectionIsOpen(page, PANEL, 'label-icon-section')).toBe(false);
    expect(await sectionIsOpen(page, PANEL, 'label-callout-section')).toBe(false);
    expect(await sectionIsOpen(page, PANEL, 'label-saved-style-row')).toBe(false);
    expect(await page.locator(PANEL + ' .label-style-section').first()
      .evaluate(function(el) { return el.classList.contains('collapsed'); })).toBe(false);
    expect(await getSectionPresence(page, PANEL, 'label-icon-section')).toBe('off');
    expect(await page.locator(PANEL + ' .label-icon-section .label-section-remove').isVisible()).toBe(false);

    await clickHeading(page, 'icon');
    expect(await sectionIsOpen(page, PANEL, 'label-icon-section')).toBe(true);
    expect(await getLabelField(page, 0, 'icon')).toBeFalsy();
    await page.locator(PANEL + ' .label-icon-buttons [data-icon="circle"]').click();
    await expect.poll(function() { return getLabelField(page, 0, 'icon'); }).toBe('circle');
    expect(await getSectionPresence(page, PANEL, 'label-icon-section')).toBe('on');

    // Closing a section changes no style, and its heading still says what is there
    await clickHeading(page, 'icon');
    expect(await sectionIsOpen(page, PANEL, 'label-icon-section')).toBe(false);
    expect(await getLabelField(page, 0, 'icon')).toBe('circle');
    expect(await getSectionPresence(page, PANEL, 'label-icon-section')).toBe('on');

    // The × works from a closed section, and leaves it closed
    await removeSectionStyle(page, PANEL, 'label-icon-section');
    await expect.poll(function() { return getLabelField(page, 0, 'icon'); }).toBeFalsy();
    expect(await getLabelField(page, 0, 'icon-size')).toBeFalsy();
    expect(await getSectionPresence(page, PANEL, 'label-icon-section')).toBe('off');
    expect(await sectionIsOpen(page, PANEL, 'label-icon-section')).toBe(false);
    expect(errors).toEqual([]);
  });

test('a section stays open or closed whatever is selected', async function({page}) {
  await oneLabel(page);
  await runCommand(page, '-style icon=circle target=labels');
  await selectLabels(page, [0]);
  expect(await sectionIsOpen(page, PANEL, 'label-icon-section')).toBe(false);
  await clickHeading(page, 'halo');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await selectLabels(page, [0]);
  expect(await sectionIsOpen(page, PANEL, 'label-halo-section')).toBe(true);
  expect(await sectionIsOpen(page, PANEL, 'label-icon-section')).toBe(false);
});

test('a halo color adds a halo, and an emptied one removes it', async function({page}) {
  var errors = collectPageErrors(page);
  await oneLabel(page);
  await selectLabels(page, [0]);
  await openSection(page, PANEL, 'label-halo-section');
  var color = page.locator(PANEL + ' .label-halo-color-row input[type=text]').first();
  var width = page.locator(PANEL + ' .label-halo-section .size-field-input');
  // The width a color will add the halo with, shown before there is one
  expect(await color.inputValue()).toBe('');
  expect(await width.inputValue()).toBe('2');
  expect(await width.getAttribute('placeholder')).toBe('');

  // A width set with no halo is kept for the color, and adds nothing yet
  await width.fill('3');
  await width.press('Enter');
  await page.waitForTimeout(200);
  expect(await getLabelField(page, 0, 'halo-width')).toBeFalsy();
  expect(await width.inputValue()).toBe('3');

  await color.fill('#ffcc00');
  await color.press('Enter');
  await expect.poll(function() { return getLabelField(page, 0, 'halo-color'); }).toBe('#ffcc00');
  expect(await getLabelField(page, 0, 'halo-width')).toBe(3);
  expect(await getSectionPresence(page, PANEL, 'label-halo-section')).toBe('on');

  await color.fill('');
  await color.press('Enter');
  await expect.poll(function() { return getLabelField(page, 0, 'halo-width'); }).toBeFalsy();
  expect(await getLabelField(page, 0, 'halo-color')).toBeFalsy();
  expect(await getSectionPresence(page, PANEL, 'label-halo-section')).toBe('off');

  // A halo with a width and no color is drawn in white, and shows as white
  await runCommand(page, '-style halo-width=1.5 target=labels');
  await selectLabels(page, [0]);
  expect(await color.inputValue()).toBe('#ffffff');
  expect(await width.inputValue()).toBe('1.5');
  expect(errors).toEqual([]);
});

test('a callout shape draws the line, and the section styles it', async function({page}) {
  var errors = collectPageErrors(page);
  await oneLabel(page);
  // Far enough from the anchor for a line to have somewhere to go
  await runCommand(page, '-style dx=40 dy=-40 label-pos= target=labels');
  await selectLabels(page, [0]);
  await openSection(page, PANEL, 'label-callout-section');

  await clickCalloutButton(page, 'line');
  await expect.poll(function() { return getLabelField(page, 0, 'callout'); }).toBe('line');
  expect(await getSectionPresence(page, PANEL, 'label-callout-section')).toBe('on');
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

  var gap = page.locator(PANEL + ' .label-callout-gap-row input.label-measure-input');
  await gap.fill('4');
  await gap.press('Enter');
  await expect.poll(function() { return getLabelField(page, 0, 'callout-gap'); }).toBe(4);
  // blanked, it is unset again, and shows the gap that leaves: with no symbol
  // at the anchor, none
  await gap.fill('');
  await gap.press('Enter');
  await expect.poll(function() { return getLabelField(page, 0, 'callout-gap'); }).toBeFalsy();
  expect(await gap.inputValue()).toBe('0');

  // The × removes the callout and everything it was drawn with.
  await runCommand(page, '-style callout-width=2 callout-via=10,-20 target=labels');
  await selectLabels(page, [0]);
  await removeSectionStyle(page, PANEL, 'label-callout-section');
  await expect.poll(function() { return getLabelField(page, 0, 'callout'); }).toBeFalsy();
  expect(await getLabelField(page, 0, 'callout-width')).toBeFalsy();
  expect(await getLabelField(page, 0, 'callout-via')).toBeFalsy();
  expect(await countCalloutPaths(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('an unset property shows its default as a value', async function({page}) {
  var errors = collectPageErrors(page);
  await oneLabel(page);
  await runCommand(page, '-style dx=40 dy=-40 label-pos= callout=line icon=circle icon-size=10 target=labels');
  await selectLabels(page, [0]);
  await openSection(page, PANEL, 'label-callout-section');
  var spacing = page.locator(PANEL + ' .label-measure-input').first();
  var padding = page.locator(PANEL + ' .label-padding-row input');
  var gap = page.locator(PANEL + ' .label-callout-gap-row input.label-measure-input');
  expect(await spacing.inputValue()).toBe('0');
  expect(await padding.inputValue()).toBe('0');
  expect(await spacing.getAttribute('placeholder')).toBe('');
  // the gap the line is drawn with: to the edge of the symbol
  expect(await gap.inputValue()).toBe('4.5');
  expect(await getLabelField(page, 0, 'callout-gap')).toBeFalsy();
  // 0 is a gap, not a blank: it runs the line to the anchor, and shows
  await gap.fill('0');
  await gap.press('Enter');
  await expect.poll(function() { return getLabelField(page, 0, 'callout-gap'); }).toBe(0);
  expect(await gap.inputValue()).toBe('0');

  // A click selects the default, so what is typed replaces it
  await spacing.click();
  await page.keyboard.type('3');
  await page.keyboard.press('Enter');
  await expect.poll(function() { return getLabelField(page, 0, 'letter-spacing'); }).toBe(3);
  // and so do the size fields and the opacities
  await page.locator(PANEL + ' .label-size-row input').first().click();
  await page.keyboard.type('20');
  await page.keyboard.press('Enter');
  await expect.poll(async function() { return Number(await getLabelField(page, 0, 'font-size')); }).toBe(20);
  await page.locator(PANEL + ' .label-opacity-input').first().click();
  await page.keyboard.type('50');
  await page.keyboard.press('Enter');
  await expect.poll(async function() { return Number(await getLabelField(page, 0, 'opacity')); }).toBe(0.5);
  expect(errors).toEqual([]);
});

test('the marker size shows the drawn size, and is inert with no marker', async function({page}) {
  var errors = collectPageErrors(page);
  await oneLabel(page);
  await runCommand(page, '-style dx=40 dy=-40 label-pos= callout=line target=labels');
  await selectLabels(page, [0]);
  await openSection(page, PANEL, 'label-callout-section');
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

test('a ring circles the anchor, sized by its diameter', async function({page}) {
  var errors = collectPageErrors(page);
  await oneLabel(page);
  await runCommand(page, '-style dx=40 dy=-60 label-pos= callout=line callout-width=1.5 target=labels');
  await selectLabels(page, [0]);
  await openSection(page, PANEL, 'label-callout-section');
  var size = page.locator('.text-style-panel .label-callout-end-size-row .size-field-input');

  await clickCalloutButton(page, 'ring');
  await expect.poll(function() { return getLabelField(page, 0, 'callout-end'); }).toBe('ring');
  // twice an arrowhead's default for the line
  expect(await size.inputValue()).toBe('23');
  await size.fill('30');
  await size.press('Enter');
  await expect.poll(function() { return getLabelField(page, 0, 'callout-end-size'); }).toBe(30);
  // the stroke is inside the diameter, and as wide as the line
  await expect.poll(function() {
    return page.evaluate(function() {
      var c = document.querySelector('.mapshaper-svg-symbol .label-callout circle');
      return c && [c.getAttribute('r'), c.getAttribute('stroke-width'), c.getAttribute('fill')];
    });
  }).toEqual(['14.25', '1.5', 'none']);
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

async function clickHeading(page, name) {
  await page.locator(PANEL + ' .label-' + name + '-section .label-section-heading').click();
  await page.waitForTimeout(100);
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
