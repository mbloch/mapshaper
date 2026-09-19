import { expect, test } from '@playwright/test';

var FIXTURE = 'test/data/issues/389_clipping_error/inner_polygon.json';

test('a style field gives the keyboard back when it is finished with', async function({page}) {
  // A control that keeps focus keeps the keyboard, so the next Escape or
  // Enter goes to the field rather than to the map -- and it goes on showing
  // its focus ring over a value that has already been applied, which reads as
  // a value still being edited.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var fill = page.locator('.layer-style-panel .layer-color-row input').first();

  await fill.fill('#00ff00');
  await fill.press('Enter');
  await page.waitForTimeout(150);
  expect(await getFocusedElement(page)).toBe('BODY');
  expect(await getFillColor(page)).toBe('#00ff00');

  // Escape puts back what the panel was showing and lets go of the field too
  await fill.fill('#123456');
  await fill.press('Escape');
  await page.waitForTimeout(150);
  await expect(fill).toHaveValue('#00ff00');
  expect(await getFocusedElement(page)).toBe('BODY');
  expect(await getFillColor(page)).toBe('#00ff00');
  expect(errors).toEqual([]);
});

async function getFillColor(page) {
  return page.evaluate(function() {
    var lyr = window.mapshaper.undoTest.getLayerInfo('inner_polygon');
    return lyr && lyr.records[0] && lyr.records[0].fill;
  });
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
