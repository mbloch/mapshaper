import { expect, test } from '@playwright/test';
import {
  getSectionPresence, openSection, removeSectionStyle
} from './style-panel-helpers.mjs';

var FIXTURE = 'test/data/features/divide/ex1_line.json';
var LAYER = 'ex1_line';
var PANEL = '.layer-style-panel';
var SECTION = 'layer-arrow-section';

test('the arrowhead controls set line-start and line-end, one undo step each',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, {open: false});
    await expect(arrowSection(page)).toBeVisible();
    // closed, the section is just its heading
    expect(await getSectionPresence(page, PANEL, SECTION)).toBe('off');
    await expect(shapeButton(page, 'arrow')).toBeHidden();
    await openSection(page, PANEL, SECTION);
    await expect(shapeButton(page, 'none')).toHaveCount(0);

    // Choosing an end puts a solid head there
    await addArrows(page);
    expect(await getArrowStyles(page)).toEqual({start: undefined, end: 'arrow', size: undefined});
    expect(await getSectionPresence(page, PANEL, SECTION)).toBe('on');
    await expect(shapeButton(page, 'arrow')).toHaveClass(/selected/);
    await expect(positionButton(page, 'end')).toHaveClass(/selected/);
    // the size shown is the one the 1px line gives it
    await expect(sizeField(page)).toHaveValue('10');

    // Both ends keep the shape; a new shape keeps the ends
    await positionButton(page, 'both').click();
    await page.waitForTimeout(250);
    expect(await getArrowStyles(page)).toEqual({start: 'arrow', end: 'arrow', size: undefined});
    await shapeButton(page, 'open-arrow').click();
    await page.waitForTimeout(250);
    expect(await getArrowStyles(page)).toEqual({start: 'open-arrow', end: 'open-arrow', size: undefined});

    await setField(sizeField(page), '14');
    expect(await getArrowStyles(page)).toEqual({start: 'open-arrow', end: 'open-arrow', size: 14});

    // The × removes the heads and their size, in one undo step
    await removeSectionStyle(page, PANEL, SECTION);
    expect(await getArrowStyles(page)).toEqual({start: undefined, end: undefined, size: undefined});
    expect(await getSectionPresence(page, PANEL, SECTION)).toBe('off');

    await page.evaluate(function() { window.mapshaper.undoTest.undo(); });
    await page.waitForTimeout(250);
    expect(await getArrowStyles(page)).toEqual({start: 'open-arrow', end: 'open-arrow', size: 14});
    expect(await getSectionPresence(page, PANEL, SECTION)).toBe('on');

    var commands = (await getSessionCommands(page)).join('\n');
    expect(commands).toContain("-style line-end='arrow' stroke='#000000'");
    expect(commands).toContain("line-end-size='14'");
    expect(errors).toEqual([]);
  });

test('a dot is sized by its diameter', async function({page}) {
  await loadFixture(page);
  await shapeButton(page, 'dot').click();
  await page.waitForTimeout(250);
  expect(await getArrowStyles(page)).toEqual({start: undefined, end: 'dot', size: undefined});
  await expect(shapeButton(page, 'dot')).toHaveClass(/selected/);
  await expect(sizeField(page)).toHaveValue('6');
  await setField(sizeField(page), '9');
  expect(await getArrowStyles(page)).toEqual({start: undefined, end: 'dot', size: 9});
  await expect(sizeField(page)).toHaveValue('9');
});

test('the marker follows styles set from the console', async function({page}) {
  await loadFixture(page);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand('-style line-start=dot where="false"');
  });
  await page.waitForTimeout(250);
  expect(await getSectionPresence(page, PANEL, SECTION)).toBe('off');
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand('-style line-start=dot');
  });
  await page.waitForTimeout(250);
  expect(await getSectionPresence(page, PANEL, SECTION)).toBe('on');
  await expect(positionButton(page, 'start')).toHaveClass(/selected/);
});

test('arrowheads are drawn on the map', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  var before = await getCanvasInkCount(page);
  await positionButton(page, 'both').click();
  await page.waitForTimeout(400);
  var after = await getCanvasInkCount(page);
  // Solid heads add more ink than the bits of line they replace
  expect(after).toBeGreaterThan(before);
  expect(errors).toEqual([]);
});

test('the fade is set as a percent, removed with the heads, and drawn', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await addArrows(page);
  await expect(fadeField(page)).toHaveValue('0');
  var solid = await getCanvasInkCount(page);

  await setField(fadeField(page), '40');
  expect(await getFade(page)).toBe(0.4);
  expect((await getSessionCommands(page)).join('\n')).toContain("line-fade='0.4'");
  await page.waitForTimeout(250);
  // the faded stretch is lighter, so there is less dark ink
  expect(await getCanvasInkCount(page)).toBeLessThan(solid);

  await fadeField(page).press('ArrowUp');
  await page.waitForTimeout(250);
  expect(await getFade(page)).toBe(0.45);

  // no fade is unset rather than stored
  await setField(fadeField(page), '0');
  expect(await getFade(page)).toBeUndefined();

  await page.evaluate(function() { window.mapshaper.undoTest.undo(); });
  await page.waitForTimeout(250);
  expect(await getFade(page)).toBe(0.45);
  await expect(fadeField(page)).toHaveValue('45');

  // the × removes the fade along with the heads
  await removeSectionStyle(page, PANEL, SECTION);
  expect(await getFade(page)).toBeUndefined();
  expect(errors).toEqual([]);
});

test('the arrowhead section is only for lines', async function({page}) {
  await page.goto('/?undo=on&undo-test=on&files=' +
    encodeURIComponent('test/data/issues/389_clipping_error/inner_polygon.json'));
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest &&
      window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('polygon_style');
  });
  await page.locator('.layer-style-panel').waitFor({state: 'visible'});
  await expect(arrowSection(page)).toBeHidden();
});

function arrowSection(page) {
  return page.locator('.layer-style-panel .label-style-section')
    .filter({has: page.locator('.layer-arrow-shape-buttons')});
}

// A head at the end, which is what choosing an end gives lines with none
async function addArrows(page) {
  await positionButton(page, 'end').click();
  await page.waitForTimeout(250);
}

function shapeButton(page, name) {
  return page.locator('.layer-style-panel [data-arrow-shape="' + name + '"]');
}

function positionButton(page, name) {
  return page.locator('.layer-style-panel [data-arrow-position="' + name + '"]');
}

function sizeField(page) {
  return page.locator('.layer-style-panel .layer-arrow-size-row .size-field-input');
}

function fadeField(page) {
  return page.locator('.layer-style-panel .layer-arrow-fade-cell .size-field-input');
}

async function getFade(page) {
  return page.evaluate(function(layer) {
    return window.mapshaper.undoTest.getLayerInfo(layer).records[0]['line-fade'];
  }, LAYER);
}

async function getArrowStyles(page) {
  return page.evaluate(function(layer) {
    var rec = window.mapshaper.undoTest.getLayerInfo(layer).records[0];
    return {start: rec['line-start'], end: rec['line-end'], size: rec['line-end-size']};
  }, LAYER);
}

// Dark pixels on the map's canvases
async function getCanvasInkCount(page) {
  return page.evaluate(function() {
    var count = 0;
    document.querySelectorAll('.map-layers canvas').forEach(function(canvas) {
      var ctx = canvas.getContext('2d');
      var data;
      if (!ctx || !canvas.width || !canvas.height) return;
      data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (var i=3; i<data.length; i+=4) {
        if (data[i] > 128 && data[i-1] < 100 && data[i-2] < 100 && data[i-3] < 100) count++;
      }
    });
    return count;
  });
}

async function getSessionCommands(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory().commands;
  });
}

async function setField(locator, value) {
  await locator.fill(value);
  await locator.press('Enter');
  await locator.page().waitForTimeout(250);
}

// opts.open: false to leave the Arrowheads section closed, as it starts
async function loadFixture(page, opts) {
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(FIXTURE));
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest &&
      window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.clearUndoHistory();
    window.mapshaper.undoTest.setInteractionMode('line_style');
  });
  await page.locator('.layer-style-panel').waitFor({state: 'visible'});
  if (!opts || opts.open !== false) await openSection(page, PANEL, SECTION);
}

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}
