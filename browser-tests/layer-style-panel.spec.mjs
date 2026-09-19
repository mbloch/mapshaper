import { expect, test } from '@playwright/test';

var FIXTURE = 'test/data/issues/389_clipping_error/inner_polygon.json';
var LAYER = 'inner_polygon';

test('a style field gives the keyboard back when it is finished with', async function({page}) {
  // A control that keeps focus keeps the keyboard, so the next Escape or
  // Enter goes to the field rather than to the map -- and it goes on showing
  // its focus ring over a value that has already been applied, which reads as
  // a value still being edited.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var fill = page.locator('.layer-style-panel .label-color-field input').first();

  await fill.fill('#00ff00');
  await fill.press('Enter');
  await page.waitForTimeout(150);
  expect(await getFocusedElement(page)).toBe('BODY');
  expect(await getStyleValue(page, 'fill')).toBe('#00ff00');

  // Escape puts back what the panel was showing and lets go of the field too
  await fill.fill('#123456');
  await fill.press('Escape');
  await page.waitForTimeout(150);
  await expect(fill).toHaveValue('#00ff00');
  expect(await getFocusedElement(page)).toBe('BODY');
  expect(await getStyleValue(page, 'fill')).toBe('#00ff00');
  expect(errors).toEqual([]);
});

test('a colour is set from its field, and its opacity from the one beside it', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var rows = page.locator('.layer-style-panel .label-split-row');

  // fill on the first line, stroke on the second
  await setField(rows.nth(0).locator('.label-color-field input'), '#3366cc');
  await setField(rows.nth(0).locator('.label-opacity-input'), '40%');
  await setField(rows.nth(1).locator('.label-color-field input'), '#ff0000');
  await setField(rows.nth(1).locator('.label-opacity-input'), '80%');

  expect(await getStyleValue(page, 'fill')).toBe('#3366cc');
  expect(await getStyleValue(page, 'fill-opacity')).toBe(0.4);
  expect(await getStyleValue(page, 'stroke')).toBe('#ff0000');
  expect(await getStyleValue(page, 'stroke-opacity')).toBe(0.8);
  expect(errors).toEqual([]);
});

test('stroke width is typed or stepped in a size field', async function({page}) {
  // It was a value between a − and a +, three clicks wide, with no way to
  // type a width at all until the value itself was clicked.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var input = page.locator('.layer-style-panel .size-field-input');

  await setField(input, '3');
  expect(await getStyleValue(page, 'stroke-width')).toBe(3);

  // The stepper walks a ladder of widths rather than adding a fixed amount:
  // the useful ones are quarters of a pixel at the hairline end.
  await input.press('ArrowDown');
  await page.waitForTimeout(200);
  expect(await getStyleValue(page, 'stroke-width')).toBe(2);
  await page.locator('.layer-style-panel .size-field-down').click();
  await page.waitForTimeout(200);
  expect(await getStyleValue(page, 'stroke-width')).toBe(1.5);
  await expect(input).toHaveValue('1.5');

  // a quarter-pixel width survives the field it is shown in
  await setField(input, '0.25');
  expect(await getStyleValue(page, 'stroke-width')).toBe(0.25);
  expect(errors).toEqual([]);
});

test('the panel buttons still do what they say', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await setField(page.locator('.layer-style-panel .label-color-field input').first(), '#00ff00');
  expect(await getStyleValue(page, 'fill')).toBe('#00ff00');

  await clickButton(page, 'Random fills');
  expect(await getStyleValue(page, 'fill')).not.toBe('#00ff00');

  await clickButton(page, 'Clear style');
  expect(await getStyleValue(page, 'fill')).toBeUndefined();
  expect(errors).toEqual([]);
});

async function clickButton(page, label) {
  await page.locator('.layer-style-panel .label-panel-action-btn')
    .filter({hasText: label}).click();
  await page.waitForTimeout(300);
}

async function setField(locator, value) {
  await locator.fill(value);
  await locator.press('Enter');
  await locator.page().waitForTimeout(250);
}

async function getStyleValue(page, field) {
  return page.evaluate(function(o) {
    var lyr = window.mapshaper.undoTest.getLayerInfo(o.layer);
    return lyr && lyr.records[0] && lyr.records[0][o.field];
  }, {layer: LAYER, field: field});
}

// What has the keyboard: a tag name, or 'BODY' for nothing in particular.
async function getFocusedElement(page) {
  return page.evaluate(function() {
    var el = document.activeElement;
    return el ? el.nodeName : 'none';
  });
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
    window.mapshaper.undoTest.setInteractionMode('polygon_style');
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
