import { expect, test } from '@playwright/test';

// Numbered markers: a circle or square with a number or letter in it, made and
// styled in the symbol tool, and kept as a label with an icon behind it.

test('typing a number makes the next symbol a marker, without leaving the field', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await openTextSection(page);
  await textInput(page).fill('7');
  await clickMap(page, 0.2, 0.5);
  await clickMap(page, 0.35, 0.5);
  var recs = (await getSymbolLayer(page)).records;
  // Auto is off, so both say 7
  expect(recs.map(function(rec) { return rec['label-text']; })).toEqual(['7', '7']);
  expect(await textInput(page).inputValue()).toBe('7');
  expect(errors).toEqual([]);
});

test('Auto with nothing typed starts at 1, as a circle with room for it', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await page.locator('.symbol-style-panel .label-icon-buttons [data-icon="star"]').click();
  await openTextSection(page);
  expect(await autoToggle(page).getAttribute('aria-checked')).toBe('false');
  await autoToggle(page).click();
  await page.waitForTimeout(100);
  expect(await textInput(page).inputValue()).toBe('1');
  expect(await page.locator('.symbol-style-panel .label-icon-buttons [data-icon="circle"]')
    .evaluate(function(el) { return el.classList.contains('selected'); })).toBe(true);
  await clickMap(page, 0.3, 0.5);
  var rec = (await getSymbolLayer(page)).records[0];
  expect(rec['label-text']).toBe('1');
  expect(rec.icon).toBe('circle');
  expect(rec['icon-size']).toBe(20);
  expect(errors).toEqual([]);
});

test('Auto turned on after a 1 has been placed moves on to 2', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await openTextSection(page);
  await setText(page, '1');
  await clickMap(page, 0.2, 0.5);
  expect(await textInput(page).inputValue()).toBe('1');
  await autoToggle(page).click();
  await page.waitForTimeout(100);
  expect(await textInput(page).inputValue()).toBe('2');
  await clickMap(page, 0.35, 0.5);
  var recs = (await getSymbolLayer(page)).records;
  expect(recs.map(function(rec) { return rec['label-text']; })).toEqual(['1', '2']);
  expect(errors).toEqual([]);
});

test('with Auto on, the next symbols count up', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await openTextSection(page);
  await setText(page, '1');
  await autoToggle(page).click();
  // a marker is a circle or a square
  expect(await shapeIsDisabled(page, 'star')).toBe(true);
  expect(await shapeIsDisabled(page, 'square')).toBe(false);

  await clickMap(page, 0.2, 0.5);
  await clickMap(page, 0.35, 0.5);
  await clickMap(page, 0.5, 0.5);
  var recs = (await getSymbolLayer(page)).records;
  expect(recs.map(function(rec) { return rec['label-text']; })).toEqual(['1', '2', '3']);
  expect(recs[0].icon).toBe('circle');
  expect(recs[0]['label-pos']).toBe('c');
  // grown from the default size, which has no room for a number
  expect(recs[0]['icon-size']).toBe(20);
  expect(recs[0]['icon-fill']).toBe('#333333');
  expect(recs[0].fill).toBe('#ffffff');
  expect(await textInput(page).inputValue()).toBe('4');
  // one command per marker, in the session history
  expect((await getSessionHistory(page)).match(/-labels coordinates=/g).length).toBe(3);

  await undo(page);
  expect((await getSymbolLayer(page)).records.length).toBe(2);
  expect(errors).toEqual([]);
});

test('text typed for a selected circle makes it a marker; the × takes it off', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await clickMap(page, 0.4, 0.5);
  await armTool(page, null);
  await clickMap(page, 0.4, 0.5);
  expect(await getSelection(page)).toEqual([0]);
  await openTextSection(page);

  await setText(page, 'A');
  var rec = (await getSymbolLayer(page)).records[0];
  expect(rec['label-text']).toBe('A');
  expect(rec.icon).toBe('circle');
  expect(rec['icon-fill']).toBe('#333333');
  expect(rec.r).toBe(undefined);
  expect(await getSelection(page)).toEqual([0]);
  expect(await shapeIsDisabled(page, 'star')).toBe(true);

  await page.locator('.symbol-style-panel .label-section-remove[aria-label="Remove label"]').click();
  await page.waitForTimeout(200);
  rec = (await getSymbolLayer(page)).records[0];
  expect(rec['label-text']).toBe(undefined);
  expect(rec.r).toBe(5);
  expect(rec.fill).toBe('#333333');

  await undo(page);
  expect((await getSymbolLayer(page)).records[0]['label-text']).toBe('A');
  expect(errors).toEqual([]);
});

test("a marker's baseline steps from where it is drawn, and goes back to auto", async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await openTextSection(page);
  await setText(page, '1');
  await clickMap(page, 0.3, 0.5);
  await armTool(page, null);
  await clickMap(page, 0.3, 0.5);
  expect(await getSelection(page)).toEqual([0]);
  var field = page.locator('.symbol-style-panel input[aria-label^="Baseline"]');
  var auto = Number(await field.inputValue());
  expect(auto).toBeGreaterThan(3);
  expect(auto).toBeLessThan(5);
  var reset = page.locator('.symbol-style-panel .symbol-baseline-auto');
  expect(await reset.isVisible()).toBe(false);

  await field.focus();
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  var rec = (await getSymbolLayer(page)).records[0];
  // in em, so that it scales with the type
  expect(parseFloat(rec.dy) * 12).toBeCloseTo(auto + 0.5, 1);
  expect(rec.dy).toMatch(/em$/);
  expect(await reset.isVisible()).toBe(true);

  await reset.click();
  await page.waitForTimeout(200);
  expect((await getSymbolLayer(page)).records[0].dy).toBe(undefined);
  expect(Number(await field.inputValue())).toBe(auto);
  expect(errors).toEqual([]);
});

test('a mixed selection: the symbol controls style both, the text controls the markers', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await clickMap(page, 0.3, 0.5);
  await openTextSection(page);
  await setText(page, '1');
  await clickMap(page, 0.6, 0.5);
  await armTool(page, null);
  await page.keyboard.press('ControlOrMeta+a');
  await page.waitForTimeout(150);
  expect(await getSelection(page)).toEqual([0, 1]);

  await setColor(page, 'Fill', '#cc0000');
  var recs = (await getSymbolLayer(page)).records;
  expect(recs[0].fill).toBe('#cc0000');
  expect(recs[1]['icon-fill']).toBe('#cc0000');
  // the marker keeps its text, and its text color
  expect(recs[1]['label-text']).toBe('1');
  expect(recs[1].fill).toBe('#ffffff');

  await setColor(page, 'Text', '#ffff00');
  recs = (await getSymbolLayer(page)).records;
  expect(recs[1].fill).toBe('#ffff00');
  expect(recs[0].fill).toBe('#cc0000');
  expect(recs[0]['label-text']).toBe(undefined);

  await undo(page);
  expect((await getSymbolLayer(page)).records[1].fill).toBe('#ffffff');
  expect(errors).toEqual([]);
});

test('Cmd-A selects markers in the symbol tool and text labels in the label tool', async function({page}) {
  var errors = collectPageErrors(page);
  await openTool(page);
  await openTextSection(page);
  await setText(page, '1');
  await clickMap(page, 0.3, 0.5);
  await clickMap(page, 0.5, 0.5);
  await runCommand(page, '-labels coordinates=0,0 text=Paris target=symbols');
  expect((await getSymbolLayer(page)).records.length).toBe(3);

  await armTool(page, null);
  await page.keyboard.press('ControlOrMeta+a');
  await page.waitForTimeout(150);
  expect(await getSelection(page)).toEqual([0, 1]);

  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('label');
  });
  await page.waitForTimeout(200);
  await page.mouse.click(5, 5);
  await page.keyboard.press('ControlOrMeta+a');
  await page.waitForTimeout(150);
  expect(await getSelection(page)).toEqual([2]);
  expect(errors).toEqual([]);
});

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}

async function openTool(page) {
  await page.goto('/?undo=on&undo-test=on');
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest;
  });
  await page.locator('#import-options .cancel-btn').click();
  await page.waitForTimeout(150);
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('symbols');
  });
  await page.locator('.floating-toolbar.symbol-toolbar').waitFor();
  await page.locator('.symbol-style-panel').waitFor();
}

function toolbarButtons(page) {
  return page.locator('.floating-toolbar.symbol-toolbar .floating-toolbar-content > .floating-toolbar-btn');
}

async function armTool(page, kind) {
  var names = ['icon', 'curve'];
  for (var i = 0; i < names.length; i++) {
    var btn = toolbarButtons(page).nth(i);
    var on = await btn.evaluate(function(el) { return el.classList.contains('selected'); });
    if (on != (names[i] == kind)) {
      await btn.click();
      await page.waitForTimeout(60);
    }
  }
}

async function openTextSection(page) {
  var heading = page.locator('.symbol-style-panel .label-section-heading', {hasText: 'Label'});
  if (await heading.getAttribute('aria-expanded') != 'true') await heading.click();
}

function autoToggle(page) {
  return page.locator('.symbol-style-panel .label-toggle[aria-label="Auto"]');
}

function textInput(page) {
  return page.locator('.symbol-style-panel input[aria-label="Label text"]');
}

async function setText(page, value) {
  await textInput(page).fill(value);
  await textInput(page).press('Enter');
  await page.waitForTimeout(200);
}

async function shapeIsDisabled(page, shape) {
  return page.locator('.symbol-style-panel .label-icon-buttons [data-icon="' + shape + '"]')
    .evaluate(function(el) { return el.classList.contains('disabled'); });
}

async function setColor(page, label, value) {
  var input = page.locator('.symbol-style-panel input[aria-label="' + label + ' color"]').first();
  await input.fill(value);
  await input.press('Enter');
  await page.waitForTimeout(200);
}

async function clickMap(page, fx, fy) {
  var box = await page.locator('.mshp-main-map').boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(200);
}

async function runCommand(page, cmd) {
  await page.evaluate(function(str) {
    return window.mapshaper.undoTest.runCommand(str);
  }, cmd);
  await page.waitForTimeout(150);
}

async function undo(page) {
  await page.evaluate(function() { return window.mapshaper.undoTest.undo(); });
  await page.waitForTimeout(200);
}

async function getSymbolLayer(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getLayerInfo('symbols');
  });
}

async function getSelection(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getSelectionIds();
  });
}

async function getSessionHistory(page) {
  return JSON.stringify(await page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory();
  }));
}
