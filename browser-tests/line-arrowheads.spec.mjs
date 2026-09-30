import { expect, test } from '@playwright/test';

var FIXTURE = 'test/data/features/divide/ex1_line.json';
var LAYER = 'ex1_line';

test('the arrowhead controls set line-start and line-end, one undo step each',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page);
    await expect(arrowSection(page)).toBeVisible();
    // switched off, the section is just its heading
    await expect(arrowToggle(page)).toHaveAttribute('aria-checked', 'false');
    await expect(shapeButton(page, 'arrow')).toBeHidden();
    await expect(shapeButton(page, 'none')).toHaveCount(0);

    // Switching on puts a solid head at the end
    await clickToggle(page);
    expect(await getArrowStyles(page)).toEqual({start: undefined, end: 'arrow', size: undefined});
    await expect(arrowToggle(page)).toHaveAttribute('aria-checked', 'true');
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

    // Off keeps the size, and on again brings back the shape and ends
    await clickToggle(page);
    expect(await getArrowStyles(page)).toEqual({start: undefined, end: undefined, size: 14});
    await expect(shapeButton(page, 'open-arrow')).toBeHidden();
    await clickToggle(page);
    expect(await getArrowStyles(page)).toEqual({start: 'open-arrow', end: 'open-arrow', size: 14});

    await page.evaluate(function() { window.mapshaper.undoTest.undo(); });
    await page.waitForTimeout(250);
    expect(await getArrowStyles(page)).toEqual({start: undefined, end: undefined, size: 14});
    await expect(arrowToggle(page)).toHaveAttribute('aria-checked', 'false');

    var commands = (await getSessionCommands(page)).join('\n');
    expect(commands).toContain("-style line-end='arrow' stroke='#000000'");
    expect(commands).toContain("line-end-size='14'");
    expect(errors).toEqual([]);
  });

test('a dot is sized by its diameter', async function({page}) {
  await loadFixture(page);
  await clickToggle(page);
  await shapeButton(page, 'dot').click();
  await page.waitForTimeout(250);
  expect(await getArrowStyles(page)).toEqual({start: undefined, end: 'dot', size: undefined});
  await expect(shapeButton(page, 'dot')).toHaveClass(/selected/);
  await expect(sizeField(page)).toHaveValue('6');
  await setField(sizeField(page), '9');
  expect(await getArrowStyles(page)).toEqual({start: undefined, end: 'dot', size: 9});
  await expect(sizeField(page)).toHaveValue('9');
});

test('the switch follows styles set from the console', async function({page}) {
  await loadFixture(page);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand('-style line-start=dot where="false"');
  });
  await page.waitForTimeout(250);
  await expect(arrowToggle(page)).toHaveAttribute('aria-checked', 'false');
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand('-style line-start=dot');
  });
  await page.waitForTimeout(250);
  await expect(arrowToggle(page)).toHaveAttribute('aria-checked', 'true');
  await expect(positionButton(page, 'start')).toHaveClass(/selected/);
});

test('arrowheads are drawn on the map', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  var before = await getCanvasInkCount(page);
  await clickToggle(page);
  await positionButton(page, 'both').click();
  await page.waitForTimeout(400);
  var after = await getCanvasInkCount(page);
  // Solid heads add more ink than the bits of line they replace
  expect(after).toBeGreaterThan(before);
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

function arrowToggle(page) {
  return page.locator('.layer-style-panel .layer-arrow-toggle');
}

async function clickToggle(page) {
  await arrowToggle(page).click();
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

async function loadFixture(page) {
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
}

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}
