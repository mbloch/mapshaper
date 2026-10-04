import { expect, test } from '@playwright/test';

// 12 polygons with a numeric "id" field and no fills
var FIXTURE = 'test/data/features/clean/ex8_britain.json';
var LAYER = 'ex8_britain';
var DEFAULT_VIBRANCE = 0;

test('Color palettes colors the fills by a numeric field', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await openSchemePanel(page);

  var panel = schemePanel(page);
  await expect(panel.locator('.color-scheme-select-row select').first()).toHaveValue('id');
  await expect(panel.locator('.color-scheme-tile')).toHaveCount(5);
  // a custom ramp, pinned at its ends
  await expect(panel.locator('.color-scheme-palette-name')).toHaveText('Custom');
  expect(await getPinStates(page)).toEqual(['', '', '', '', '']);

  var fills = await getFills(page);
  expect(new Set(fills).size).toBe(5);
  expect(fills.every(function(fill) { return /^#[0-9a-f]{6}$/.test(fill); })).toBe(true);

  // The style panel shows the scheme in place of the fill's single color
  await expect(page.locator('.layer-style-panel .label-color-field.has-scheme')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('edits made while the panel is open are one undo state and one command', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  var before = await getFills(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);

  await setField(panel.locator('.size-field-input'), '7');
  await expect(panel.locator('.color-scheme-tile')).toHaveCount(7);
  await panel.locator('.color-scheme-tile').nth(3).click();
  await setPickerColor(panel, '#b11b1b');
  await page.waitForTimeout(300);
  expect(await getPinStates(page)).toEqual(['', '', '', 'pin', '', '', '']);
  var pinned = await getVibrantColor(page, '#b11b1b');
  expect(await getFills(page)).toContain(pinned);

  // unpinning the tile puts it back to an interpolated color
  await panel.locator('.color-scheme-pin.pinned').click();
  await page.waitForTimeout(300);
  expect(await getPinStates(page)).toEqual(['', '', '', '', '', '', '']);
  expect(await getFills(page)).not.toContain(pinned);
  var after = await getFills(page);

  await closeSchemePanel(page);
  var classify = (await getSessionCommands(page)).filter(function(cmd) {
    return /^-classify/.test(cmd);
  });
  expect(classify.length).toBe(1);
  expect(classify[0].split(',').length).toBe(7);

  await undo(page);
  expect(await getFills(page)).toEqual(before);
  await redo(page);
  expect(await getFills(page)).toEqual(after);
  expect(errors).toEqual([]);
});

test('undo while the panel is open takes back the edits made in it', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  var before = await getFills(page);
  await openSchemePanel(page);
  await setField(schemePanel(page).locator('.size-field-input'), '4');
  expect(new Set(await getFills(page)).size).toBe(4);

  await undo(page);
  expect(await getFills(page)).toEqual(before);
  // the scheme went with its colors, so there is nothing left to edit
  await expect(schemePanel(page)).toBeHidden();
  await expect(page.locator('.layer-style-panel .label-color-field.has-scheme')).toHaveCount(0);
  expect(await getSessionCommands(page)).not.toContainEqual(expect.stringMatching(/^-classify/));
  expect(errors).toEqual([]);
});

test('a preset can be chosen, and editing it makes a custom ramp', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);

  await panel.locator('.color-scheme-palette-btn').click();
  await panel.locator('.color-scheme-palette-item').filter({hasText: /^Viridis$/}).click();
  await page.waitForTimeout(300);
  await expect(panel.locator('.color-scheme-palette-name')).toHaveText('Viridis');
  expect(await getPinStates(page)).toEqual(['', '', '', '', '']);
  var viridis = await getTileColors(page);

  await panel.locator('.color-scheme-tile').nth(2).click();
  await setPickerColor(panel, '#ffffff');
  await page.waitForTimeout(300);
  await expect(panel.locator('.color-scheme-palette-name')).toHaveText('Custom');
  expect(await getPinStates(page)).toEqual(['', '', 'pin', '', '']);
  // the ends keep the preset's colors, which vibrance raises in the ramp
  await panel.locator('.color-scheme-tile').nth(0).click();
  await expect(panel.locator('.label-color-picker-input')).toHaveValue(await getVibrantColor(page, viridis[0], 0));
  var colors = await getTileColors(page);
  expect(colors[0]).toBe(await toCssColor(page, await getVibrantColor(page, viridis[0])));
  expect(errors).toEqual([]);
});

test('a tile is highlighted only while the picker is editing it', async function({page}) {
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  await panel.locator('.color-scheme-tile').nth(1).click();
  await expect(panel.locator('.color-scheme-tile.selected')).toHaveCount(1);
  await setPickerColor(panel, '#b11b1b');
  await page.waitForTimeout(300);
  // still editing the same tile after a color is picked
  await expect(panel.locator('.color-scheme-tile').nth(1)).toHaveClass(/selected/);
  await panel.locator('.label-color-picker button').filter({hasText: 'Close'}).click();
  await expect(panel.locator('.color-scheme-tile.selected')).toHaveCount(0);

  // clicking the tile again closes the picker, and the highlight with it
  await panel.locator('.color-scheme-tile').nth(1).click();
  await expect(panel.locator('.color-scheme-tile.selected')).toHaveCount(1);
  await panel.locator('.color-scheme-tile').nth(1).click();
  await expect(panel.locator('.label-color-picker')).toBeHidden();
  await expect(panel.locator('.color-scheme-tile.selected')).toHaveCount(0);
});

test('reopening the panel shows the scheme that was applied', async function({page}) {
  await loadFixture(page);
  await openSchemePanel(page);
  await setField(schemePanel(page).locator('.size-field-input'), '3');
  await closeSchemePanel(page);
  await page.locator('.layer-style-panel .layer-scheme-strip').click();
  await expect(schemePanel(page)).toBeVisible();
  await expect(schemePanel(page).locator('.color-scheme-tile')).toHaveCount(3);
});

test('removing the scheme unsets the fills', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await openSchemePanel(page);
  await closeSchemePanel(page);
  await page.locator('.layer-style-panel .layer-scheme-remove').click();
  await page.waitForTimeout(300);
  expect((await getFills(page)).every(function(fill) { return !fill; })).toBe(true);
  await expect(schemePanel(page)).toBeHidden();
  await expect(page.locator('.layer-style-panel .label-color-field.has-scheme')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the tile picker takes a typed or pasted color, and has no presets', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  await panel.locator('.color-scheme-tile').nth(2).click();
  var picker = panel.locator('.label-color-picker');
  var input = picker.locator('.label-color-picker-input');
  await expect(picker.locator('.label-color-preset')).toHaveCount(0);
  await expect(picker.locator('.label-color-picker-fields label')).toHaveCount(0);

  // typed, in another CSS form, and applied when the field is left
  await setPickerColor(panel, 'rgb(255, 128, 0)');
  await expect(input).toHaveValue('#ff8000');
  expect(await getFills(page)).toContain('#ff8000');

  // pasted, without its "#", and applied straight away
  await input.focus();
  await input.selectText();
  await page.evaluate(function() {
    var el = document.querySelector('.color-scheme-panel .label-color-picker-input');
    var data = new DataTransfer();
    data.setData('text/plain', '3a7');
    el.value = '3a7';
    el.dispatchEvent(new ClipboardEvent('paste', {clipboardData: data, bubbles: true}));
  });
  await page.waitForTimeout(300);
  await expect(input).toHaveValue('#33aa77');
  expect(await getFills(page)).toContain(await getVibrantColor(page, '#33aa77'));
  // reopened, the picker shows the pinned color, not the one vibrance raised
  await panel.locator('.label-color-picker button').filter({hasText: 'Close'}).click();
  await panel.locator('.color-scheme-tile').nth(2).click();
  await expect(input).toHaveValue('#33aa77');

  // something that isn't a color puts the field back
  await setPickerColor(panel, 'not a color');
  await expect(input).toHaveValue('#33aa77');
  expect(errors).toEqual([]);
});

test('the vibrance slider recolors a custom ramp', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  var slider = panel.getByLabel('Vibrance');
  await expect(slider).toBeVisible();
  await expect(slider).toHaveValue('0');
  await expect(slider).toHaveAttribute('max', '90');
  await expect(panel.locator('.color-scheme-slider-row')).not.toHaveAttribute('title');
  await expect(panel.locator('.color-scheme-slider-value')).toHaveCount(0);
  await expect(panel.locator('.color-scheme-slider-label')).toHaveAttribute('data-tooltip', /vivid/);
  var before = await getTileColors(page);
  expect(before[0]).toBe('rgb(52, 74, 114)'); // the default end, #344a72

  await slider.fill('60');
  await page.waitForTimeout(300);
  var vivid = await getTileColors(page);
  // vibrance raises the pinned ends too
  expect(vivid[0]).not.toBe(before[0]);
  expect(vivid[2]).not.toBe(before[2]);
  expect(new Set(await getFills(page)).size).toBe(5);
  await closeSchemePanel(page);
  var classify = (await getSessionCommands(page)).filter(function(cmd) {
    return /^-classify/.test(cmd);
  });
  expect(classify.length).toBe(1);

  // presets have no interpolated tiles
  await openSchemePanel(page);
  await panel.locator('.color-scheme-palette-btn').click();
  await panel.locator('.color-scheme-palette-item').nth(1).click();
  await expect(slider).toBeHidden();
  await expect(panel.getByLabel('Go the long way around the color wheel')).toBeHidden();
  await expect(panel.getByLabel('Reverse the colors')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the reverse button reverses the colors', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  var before = await getTileColors(page);
  await panel.getByLabel('Reverse the colors').click();
  await page.waitForTimeout(300);
  expect(await getTileColors(page)).toEqual(before.slice().reverse());

  await panel.locator('.color-scheme-palette-btn').click();
  await panel.locator('.color-scheme-palette-item').filter({hasText: /^Viridis$/}).click();
  await page.waitForTimeout(300);
  var viridis = await getTileColors(page);
  await panel.getByLabel('Reverse the colors').click();
  await page.waitForTimeout(300);
  expect(await getTileColors(page)).toEqual(viridis.slice().reverse());
  expect(errors).toEqual([]);
});

test('the hue button takes the long way around the color wheel', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  var btn = panel.getByLabel('Go the long way around the color wheel');
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  var before = await getTileColors(page);
  await btn.click();
  await page.waitForTimeout(300);
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  var after = await getTileColors(page);
  expect(after[0]).toBe(before[0]);
  expect(after[4]).toBe(before[4]);
  expect(after[2]).not.toBe(before[2]);
  await btn.click();
  await page.waitForTimeout(300);
  expect(await getTileColors(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('the panel takes the polygon style panel\'s place until it closes', async function({page}) {
  await loadFixture(page);
  var stylePanel = page.locator('.layer-style-panel');
  var styleBox = await stylePanel.boundingBox();
  await openSchemePanel(page);
  await expect(stylePanel).toBeHidden();
  var schemeBox = await schemePanel(page).boundingBox();
  expect(Math.round(schemeBox.x + schemeBox.width)).toBe(Math.round(styleBox.x + styleBox.width));
  expect(Math.round(schemeBox.y)).toBe(Math.round(styleBox.y));
  await closeSchemePanel(page);
  await expect(stylePanel).toBeVisible();
  await expect(schemePanel(page)).toBeHidden();
});

test('tiles fitted to the sRGB gamut are marked', async function({page}) {
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  await panel.getByLabel('Vibrance').fill('0');
  await page.waitForTimeout(300);
  await expect(panel.locator('.color-scheme-pin.adjusted')).toHaveCount(0);
  // the ends are always pinned, and have no dot
  for (var end of [0, 4]) {
    var endPin = panel.locator('.color-scheme-pin').nth(end);
    await expect(endPin).not.toHaveClass(/pinned/);
    await expect(endPin).not.toHaveAttribute('data-tooltip');
  }

  for (var [i, color] of [[0, '#001e56'], [4, '#fcf1cd']]) {
    await panel.locator('.color-scheme-tile').nth(i).click();
    await setPickerColor(panel, color);
  }
  await panel.getByLabel('Vibrance').fill('90');
  await page.waitForTimeout(300);
  var marks = panel.locator('.color-scheme-pin.adjusted');
  expect(await marks.count()).toBeGreaterThan(0);
  await expect(marks.first()).toHaveAttribute('data-tooltip',
    /^Shifted to fit the sRGB gamut:\n(lightness [+-]\d\.\d{3}(, )?)?(chroma [+-]\d\.\d{3})?$/);
  // the navy end can't take all of the vibrance
  await expect(panel.locator('.color-scheme-pin').nth(0)).toHaveAttribute('data-tooltip',
    /^Shifted to fit the sRGB gamut:\nchroma -\d\.\d{3}$/);
});

test('the tile picker shows colors in the chosen format, which it keeps', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  var picker = panel.locator('.label-color-picker');
  var input = picker.locator('.label-color-picker-input');
  var tab = function(label) {
    return picker.locator('.label-color-format-tab').filter({hasText: label});
  };
  await panel.locator('.color-scheme-tile').nth(0).click();
  await expect(tab('HEX')).toHaveClass(/selected/);
  await expect(input).toHaveValue('#344a72');

  await tab('RGB').click();
  await expect(input).toHaveValue('rgb(52, 74, 114)');
  await tab('OKLCH').click();
  await expect(input).toHaveValue(/^oklch\(0\.\d{4} 0\.\d{4} [\d.]+\)$/);
  await expect(tab('OKLCH')).toHaveClass(/selected/);
  await expect(tab('RGB')).not.toHaveClass(/selected/);

  // any format can be typed, and is shown in the chosen one
  await setPickerColor(panel, '#ff0000');
  await expect(input).toHaveValue(/^oklch\(/);
  expect(await getFills(page)).toContain('#ff0000');

  // kept from one picker to the next
  await picker.locator('button').filter({hasText: 'Close'}).click();
  await panel.locator('.color-scheme-tile').nth(4).click();
  await expect(tab('OKLCH')).toHaveClass(/selected/);
  await expect(input).toHaveValue(/^oklch\(/);
  expect(errors).toEqual([]);
});

test('the tile picker is drawn over the undo toolbar', async function({page}) {
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  await expect(page.locator('.edit-toolbar.visible')).toHaveCount(1);
  await panel.locator('.color-scheme-tile').nth(2).click();
  var picker = panel.locator('.label-color-picker');
  await expect(picker).toBeVisible();

  // where the picker opens depends on the window size, so put it over the toolbar
  var onTop = await page.evaluate(function() {
    var picker = document.querySelector('.color-scheme-panel .label-color-picker');
    var bar = document.querySelector('.edit-toolbar').getBoundingClientRect();
    picker.style.left = (bar.left - 10) + 'px';
    picker.style.top = (bar.top - 10) + 'px';
    var el = document.elementFromPoint(bar.left + bar.width / 2, bar.top + bar.height / 2);
    return !!(el && el.closest('.label-color-picker'));
  });
  expect(onTop).toBe(true);

  await expect(panel).toHaveClass(/color-picker-open/);
  await picker.locator('button').filter({hasText: 'Close'}).dispatchEvent('click');
  await expect(panel).not.toHaveClass(/color-picker-open/);
});

async function setPickerColor(panel, str) {
  var input = panel.locator('.label-color-picker-input');
  await input.fill(str);
  await input.press('Enter');
  await panel.page().waitForTimeout(300);
}

function schemePanel(page) {
  return page.locator('.color-scheme-panel');
}

async function openSchemePanel(page) {
  await page.locator('.layer-style-panel .label-panel-action-btn')
    .filter({hasText: 'Palettes'}).click();
  await expect(schemePanel(page)).toBeVisible();
  await page.waitForTimeout(300);
}

async function closeSchemePanel(page) {
  await schemePanel(page).locator('.label-style-close').click();
  await page.waitForTimeout(300);
}

// 'pin' or '' for each tile; the ends are always pinned, and have no dot
async function getPinStates(page) {
  return schemePanel(page).locator('.color-scheme-pin').evaluateAll(function(pins) {
    return pins.map(function(pin) {
      return pin.classList.contains('pinned') ? 'pin' : '';
    });
  });
}

// a color as vibrance (the panel's, by default) raises it in a ramp, as hex
async function getVibrantColor(page, color, vibrance) {
  return page.evaluate(function(args) {
    return window.mapshaper.internal.getVibrantColor(args[0], args[1]);
  }, [color, vibrance === undefined ? DEFAULT_VIBRANCE : vibrance]);
}

async function toCssColor(page, color) {
  return page.evaluate(function(color) {
    var el = document.createElement('div');
    el.style.backgroundColor = color;
    return el.style.backgroundColor;
  }, color);
}

async function getTileColors(page) {
  return schemePanel(page).locator('.color-scheme-tile').evaluateAll(function(tiles) {
    return tiles.map(function(tile) { return tile.style.backgroundColor; });
  });
}

async function getFills(page) {
  return page.evaluate(function(layer) {
    return window.mapshaper.undoTest.getLayerInfo(layer).records.map(function(rec) {
      return rec.fill;
    });
  }, LAYER);
}

async function getSessionCommands(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory().commands;
  });
}

async function undo(page) {
  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await page.waitForTimeout(300);
}

async function redo(page) {
  await page.evaluate(function() {
    return window.mapshaper.undoTest.redo();
  });
  await page.waitForTimeout(300);
}

async function setField(locator, value) {
  await locator.fill(value);
  await locator.press('Enter');
  await locator.page().waitForTimeout(300);
}

async function loadFixture(page) {
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(FIXTURE));
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
