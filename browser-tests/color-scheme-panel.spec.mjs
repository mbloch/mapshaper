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

  // each tile shows its class's range: ids from 1806 to 5434, in two equal
  // intervals
  await methodSelect(page).selectOption('equal-interval');
  await setField(panel.locator('.size-field-input'), '2');
  await expect(panel.locator('.color-scheme-tile').nth(0)).toHaveAttribute('data-tooltip', 'Below 3620');
  await expect(panel.locator('.color-scheme-tile').nth(1)).toHaveAttribute('data-tooltip', '3620 and above');

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
  await expect(panel.locator('.color-scheme-tile-row .label-color-picker-input')).toHaveValue(await getVibrantColor(page, viridis[0], 0));
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
  await panel.locator('.color-scheme-tile-row .label-color-picker button').filter({hasText: 'Close'}).click();
  await expect(panel.locator('.color-scheme-tile.selected')).toHaveCount(0);

  // clicking the tile again closes the picker, and the highlight with it
  await panel.locator('.color-scheme-tile').nth(1).click();
  await expect(panel.locator('.color-scheme-tile.selected')).toHaveCount(1);
  await panel.locator('.color-scheme-tile').nth(1).click();
  await expect(panel.locator('.color-scheme-tile-row .label-color-picker')).toBeHidden();
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
  var picker = panel.locator('.color-scheme-tile-row .label-color-picker');
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
    var el = document.querySelector('.color-scheme-panel .color-scheme-tile-row .label-color-picker-input');
    var data = new DataTransfer();
    data.setData('text/plain', '3a7');
    el.value = '3a7';
    el.dispatchEvent(new ClipboardEvent('paste', {clipboardData: data, bubbles: true}));
  });
  await page.waitForTimeout(300);
  await expect(input).toHaveValue('#33aa77');
  expect(await getFills(page)).toContain(await getVibrantColor(page, '#33aa77'));
  // reopened, the picker shows the pinned color, not the one vibrance raised
  await panel.locator('.color-scheme-tile-row .label-color-picker button').filter({hasText: 'Close'}).click();
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
  var picker = panel.locator('.color-scheme-tile-row .label-color-picker');
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
  var picker = panel.locator('.color-scheme-tile-row .label-color-picker');
  await expect(picker).toBeVisible();

  // where the picker opens depends on the window size, so put it over the toolbar
  var onTop = await page.evaluate(function() {
    var picker = document.querySelector('.color-scheme-panel .color-scheme-tile-row .label-color-picker');
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
  var input = panel.locator('.color-scheme-tile-row .label-color-picker-input');
  await input.fill(str);
  await input.press('Enter');
  await panel.page().waitForTimeout(300);
}

test('the categorical tab gives each value of a field a swatch', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await runCommand(page, "-each 'kind = [\"farm\", \"city\", \"park\"][this.id % 3]'");
  var before = await getFills(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  var seqColors = await getTileColors(page);
  await expect(panel.locator('.color-scheme-tab.selected')).toHaveText('Sequential');

  await panel.locator('.color-scheme-tab').filter({hasText: 'Categorical'}).click();
  await page.waitForTimeout(300);
  await expect(panel.locator('.color-scheme-tab.selected')).toHaveText('Categorical');
  await expect(fieldSelect(page)).toHaveValue('kind');
  await expect(methodSelect(page)).toHaveValue('categorical');
  await expect(panel.locator('.color-scheme-palette-name')).toHaveText('Tableau10');
  // the whole palette, with a bar under the three swatches in use
  await expect(panel.locator('.color-scheme-tile')).toHaveCount(10);
  await expect(panel.locator('.color-scheme-pin.used')).toHaveCount(3);
  // no pins, and no vibrance for categories
  await expect(panel.locator('.color-scheme-pin.pinned')).toHaveCount(0);
  await expect(panel.getByLabel('Vibrance')).toBeHidden();

  var records = await getRecords(page);
  var byKind = {};
  records.forEach(function(rec) {
    expect(byKind[rec.kind] || rec.fill).toBe(rec.fill);
    byKind[rec.kind] = rec.fill;
  });
  expect(new Set(Object.values(byKind)).size).toBe(3);
  var firstKind = records[0].kind;
  await expect(panel.locator('.color-scheme-tile').first()).toHaveAttribute('data-tooltip', firstKind);

  // editing a swatch makes the palette custom
  await panel.locator('.color-scheme-tile').nth(1).click();
  await setPickerColor(panel, '#b11b1b');
  await page.waitForTimeout(300);
  await expect(panel.locator('.color-scheme-palette-name')).toHaveText('Custom');
  expect(await getFills(page)).toContain('#b11b1b');

  // each tab keeps its scheme while the panel is open
  await panel.locator('.color-scheme-tab').filter({hasText: 'Sequential'}).click();
  await page.waitForTimeout(300);
  expect(await getTileColors(page)).toEqual(seqColors);
  await panel.locator('.color-scheme-tab').filter({hasText: 'Categorical'}).click();
  await page.waitForTimeout(300);
  expect(await getFills(page)).toContain('#b11b1b');

  await closeSchemePanel(page);
  var classify = (await getSessionCommands(page)).filter(function(cmd) {
    return /^-classify/.test(cmd);
  });
  expect(classify).toEqual([expect.stringMatching(/^-classify field='kind' method=categorical colors=#[0-9a-f]{6},#b11b1b,#[0-9a-f]{6}$/)]);

  // reopening shows the categorical scheme that was applied
  await openSchemePanel(page);
  await expect(panel.locator('.color-scheme-tab.selected')).toHaveText('Categorical');
  await expect(panel.locator('.color-scheme-palette-name')).toHaveText('Custom');
  await closeSchemePanel(page);

  await undo(page);
  expect(await getFills(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('non-adjacent colors need no field', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  await panel.locator('.color-scheme-tab').filter({hasText: 'Categorical'}).click();
  await page.waitForTimeout(300);
  // the numeric id field gives a swatch to each of its 12 values, up to Tableau10's 10
  await expect(fieldSelect(page)).toHaveValue('id');
  await expect(panel.locator('.color-scheme-pin.used')).toHaveCount(10);

  await methodSelect(page).selectOption('non-adjacent');
  await page.waitForTimeout(300);
  await expect(fieldSelect(page)).toBeHidden();
  await expect(panel.locator('.size-field-input')).toHaveValue('5');
  await expect(panel.locator('.color-scheme-pin.used')).toHaveCount(5);
  await setField(panel.locator('.size-field-input'), '4');
  await expect(panel.locator('.color-scheme-tile')).toHaveCount(10);
  await expect(panel.locator('.color-scheme-pin.used')).toHaveCount(4);
  var colors = (await getTileColors(page)).slice(0, 4);
  var fills = await getFills(page);
  expect(new Set(fills).size).toBeLessThanOrEqual(4);
  for (var fill of fills) {
    expect(colors).toContain(await toCssColor(page, fill));
  }
  await expect(page.locator('.layer-style-panel .layer-scheme-strip'))
    .toHaveAttribute('title', 'Neighbors colored differently');

  await closeSchemePanel(page);
  var classify = (await getSessionCommands(page)).filter(function(cmd) {
    return /^-classify/.test(cmd);
  });
  expect(classify).toEqual([expect.stringMatching(/^-classify method=non-adjacent colors=(#[0-9a-f]{6},){3}#[0-9a-f]{6}$/)]);
  expect(errors).toEqual([]);
});

test('more than 12 swatches go on two rows', async function({page}) {
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  await panel.locator('.color-scheme-tab').filter({hasText: 'Categorical'}).click();
  await methodSelect(page).selectOption('non-adjacent');
  await panel.locator('.color-scheme-palette-btn').click();
  await panel.locator('.color-scheme-palette-item').filter({hasText: /^Category20$/}).click();
  var tiles = panel.locator('.color-scheme-tile');
  await expect(tiles).toHaveCount(20);
  // the bar under the swatches in use goes on to the second row
  await setField(panel.locator('.size-field-input'), '12');
  await expect(panel.locator('.color-scheme-pin.used')).toHaveCount(12);
  await expect(panel.locator('.color-scheme-pin.joined')).toHaveCount(10);
  var first = await tiles.nth(0).boundingBox();
  var eleventh = await tiles.nth(10).boundingBox();
  expect(eleventh.y).toBeGreaterThan(first.y + first.height);
  expect(Math.abs(eleventh.x - first.x)).toBeLessThan(1);
});

test('dragging a swatch into use pushes the last one out of use', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  await panel.locator('.color-scheme-tab').filter({hasText: 'Categorical'}).click();
  await methodSelect(page).selectOption('non-adjacent');
  await page.waitForTimeout(300);
  var before = await getTileColors(page);
  var tiles = panel.locator('.color-scheme-tile');

  // the eighth swatch, dropped in front of the second
  await dragTile(page, tiles.nth(7), tiles.nth(1), 'left');
  var after = await getTileColors(page);
  expect(after.slice(0, 6)).toEqual([before[0], before[7], before[1], before[2], before[3], before[4]]);
  await expect(panel.locator('.color-scheme-pin.used')).toHaveCount(5);
  // a preset keeps its name when its swatches are moved
  await expect(panel.locator('.color-scheme-palette-name')).toHaveText('Tableau10');
  // the picker didn't open
  await expect(panel.locator('.color-scheme-tile-row .label-color-picker')).toBeHidden();
  var fills = new Set(await getFills(page));
  expect(fills.has(await toHex(page, before[7]))).toBe(true);
  expect(fills.has(await toHex(page, before[4]))).toBe(false);

  // dropped past the last swatch
  await dragTile(page, tiles.nth(0), tiles.nth(9), 'right');
  expect((await getTileColors(page))[9]).toBe(before[0]);

  await closeSchemePanel(page);
  expect((await getSessionCommands(page)).filter(function(cmd) {
    return /^-classify/.test(cmd);
  }).length).toBe(1);
  expect(errors).toEqual([]);
});

test('shuffle reorders the whole palette', async function({page}) {
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  await expect(panel.getByLabel('Shuffle the colors')).toBeHidden();
  await expect(panel.getByLabel('Reverse the colors')).toBeVisible();
  await panel.locator('.color-scheme-tab').filter({hasText: 'Categorical'}).click();
  await page.waitForTimeout(300);
  await expect(panel.getByLabel('Reverse the colors')).toBeHidden();
  var before = await getTileColors(page);
  await panel.getByLabel('Shuffle the colors').click();
  await page.waitForTimeout(300);
  var after = await getTileColors(page);
  expect(after).not.toEqual(before);
  expect(after.concat().sort()).toEqual(before.concat().sort());
  await expect(panel.locator('.color-scheme-palette-name')).toHaveText('Tableau10');
});

test('features with no data get the no-data color, on both tabs', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await runCommand(page, "-each 'id = this.id === 0 ? null : id'");
  await openSchemePanel(page);
  var panel = schemePanel(page);
  var row = panel.locator('.color-scheme-null-row');
  var input = row.locator('.label-color-input');
  await expect(row.locator('.color-scheme-null-count')).toHaveText('1 feature');
  await expect(input).toHaveValue('#eeeeee');
  expect((await getFills(page))[0]).toBe('#eee');

  await setField(input, '#ff0000');
  expect((await getFills(page))[0]).toBe('#ff0000');
  expect(new Set((await getFills(page)).slice(1)).has('#ff0000')).toBe(false);

  // the same color on the categorical tab, where an empty value is no data too
  await panel.locator('.color-scheme-tab').filter({hasText: 'Categorical'}).click();
  await page.waitForTimeout(300);
  await expect(input).toHaveValue('#ff0000');
  await expect(row.locator('.color-scheme-null-count')).toHaveText('1 feature');
  expect((await getFills(page))[0]).toBe('#ff0000');
  // 11 values, and no swatch for the empty one
  await expect(panel.locator('.color-scheme-pin.used')).toHaveCount(10);

  // non-adjacent colors have no data to be missing
  await methodSelect(page).selectOption('non-adjacent');
  await page.waitForTimeout(300);
  await expect(row).toBeHidden();
  await methodSelect(page).selectOption('categorical');
  await page.waitForTimeout(300);

  // the chit's picker and the tiles' picker don't stay open together
  await row.locator('.label-color-chit').click();
  await expect(row.locator('.label-color-picker')).toBeVisible();
  await panel.locator('.color-scheme-tile').first().click();
  await expect(row.locator('.label-color-picker')).toBeHidden();
  await expect(panel.locator('.color-scheme-tile-row .label-color-picker')).toBeVisible();

  await closeSchemePanel(page);
  var classify = (await getSessionCommands(page)).filter(function(cmd) {
    return /^-classify/.test(cmd);
  });
  expect(classify).toEqual([expect.stringMatching(/^-classify field='id' method=categorical colors=\S+ null-value=#ff0000$/)]);
  // the style panel still shows the scheme
  await expect(page.locator('.layer-style-panel .label-color-field.has-scheme')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a swatch lists up to five values, then how many more', async function({page}) {
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  await panel.locator('.color-scheme-tab').filter({hasText: 'Categorical'}).click();
  await page.waitForTimeout(300);
  var ids = (await getRecords(page)).map(function(rec) { return String(rec.id); });
  var tiles = panel.locator('.color-scheme-tile');
  // 12 values on 2 swatches: 6 each
  await setField(panel.locator('.size-field-input'), '2');
  await expect(tiles.first()).toHaveAttribute('data-tooltip',
    [ids[0], ids[2], ids[4], ids[6], 'and 2 more'].join('\n'));
  // 12 values on 3 swatches: 4 each; with 11 values, one swatch has 5
  await runCommand(page, "-each 'id = this.id === 11 ? null : id'");
  await setField(panel.locator('.size-field-input'), '3');
  await setField(panel.locator('.size-field-input'), '2');
  await expect(tiles.nth(1)).toHaveAttribute('data-tooltip',
    [ids[1], ids[3], ids[5], ids[7], ids[9]].join('\n'));
});

test('the diverging tab colors classes on either side of a pivot', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  // 6 values below 0 and 6 above
  await runCommand(page, "-each 'v = id - 3000'");
  await openSchemePanel(page);
  var panel = schemePanel(page);
  await panel.locator('.color-scheme-tab').filter({hasText: 'Diverging'}).click();
  await page.waitForTimeout(300);
  await fieldSelect(page).selectOption('v');
  await page.waitForTimeout(300);
  await expect(panel.locator('.color-scheme-palette-name')).toHaveText('RdBu');
  // a custom diverging ramp has no hue path button
  await panel.locator('.color-scheme-palette-btn').click();
  await panel.locator('.color-scheme-palette-item').filter({hasText: /^Custom$/}).click();
  await page.waitForTimeout(300);
  await expect(panel.locator('.long-hue-btn')).toBeHidden();
  await expect(panel.getByLabel('Reverse the colors')).toBeVisible();
  await expect(panel.getByLabel('Pivot value')).toHaveValue('0');
  await expect(panel.getByLabel('Pivot value')).toBeDisabled();
  await expect(panel.getByText('6 features below the pivot, 6 at or above')).toBeVisible();

  // a pivot class and 6 others: the side with features farther from the
  // pivot gets more of them, and the tiles reach to its end
  var tiles = await getTileColors(page);
  var used = await getUsedTiles(page);
  var k = (tiles.length - 1) / 2;
  expect(used[k]).toBe(true);
  expect(used.filter(Boolean).length).toBe(7);
  var records = await getRecords(page);
  var fills = await getFills(page);
  var lowest = records.reduce(function(memo, rec, i) { return rec.v < records[memo].v ? i : memo; }, 0);
  var highest = records.reduce(function(memo, rec, i) { return rec.v > records[memo].v ? i : memo; }, 0);
  expect(fills[lowest]).toBe(await toHex(page, tiles[used.indexOf(true)]));
  expect(fills[highest]).toBe(await toHex(page, tiles[tiles.length - 1]));
  // a class range on each tile in use
  await expect(panel.locator('.color-scheme-tile').nth(tiles.length - 1)).toHaveAttribute('data-tooltip', /and above$/);

  // without the pivot class, 7 classes are split 4 and 3, and the bar has a
  // gap at the center
  await panel.getByRole('checkbox', {name: 'Pivot class'}).click();
  await page.waitForTimeout(300);
  used = await getUsedTiles(page);
  expect(used).toEqual([true, true, true, true, false, true, true, true, false]);
  expect(new Set(await getFills(page)).size).toBe(7);

  await closeSchemePanel(page);
  var classify = (await getSessionCommands(page)).filter(function(cmd) {
    return /^-classify/.test(cmd);
  });
  expect(classify).toEqual([expect.stringMatching(/^-classify field='v' method=quantile pivot=auto classes=7 no-pivot-class colors=\S+$/)]);
  // the style panel shows the scheme
  await expect(page.locator('.layer-style-panel .label-color-field.has-scheme')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a diverging pivot can be a value, with the same number of classes per side', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await runCommand(page, "-each 'v = id - 3000'");
  await openSchemePanel(page);
  var panel = schemePanel(page);
  await panel.locator('.color-scheme-tab').filter({hasText: 'Diverging'}).click();
  await page.waitForTimeout(300);
  await fieldSelect(page).selectOption('v');
  await page.waitForTimeout(300);

  await panel.getByLabel('Pivot', {exact: true}).selectOption('value');
  await page.waitForTimeout(300);
  var input = panel.getByLabel('Pivot value');
  await expect(input).toBeEnabled();
  await setField(input, '1500');
  await expect(panel.getByText('9 features below the pivot, 3 at or above')).toBeVisible();

  await panel.getByLabel('Classes on each side').selectOption('count');
  await page.waitForTimeout(300);
  await expect(panel.locator('.color-scheme-select-row, .label-split-cell').getByText('Per side', {exact: true})).toBeVisible();
  await expect(panel.locator('.size-field-input')).toHaveValue('3');
  expect(await getUsedTiles(page)).toEqual([true, true, true, true, true, true, true]);
  await setField(panel.locator('.size-field-input'), '2');
  expect((await getUsedTiles(page)).length).toBe(5);

  // reopening the panel shows the same scheme
  await closeSchemePanel(page);
  await openSchemePanel(page);
  await expect(panel.locator('.color-scheme-tab.selected')).toHaveText('Diverging');
  await expect(input).toHaveValue('1500');
  await closeSchemePanel(page);
  var classify = (await getSessionCommands(page)).filter(function(cmd) {
    return /^-classify/.test(cmd);
  });
  expect(classify).toEqual([expect.stringMatching(/^-classify field='v' method=quantile pivot=1500 classes=2,2 colors=\S+$/)]);
  expect(errors).toEqual([]);
});

test('continuous colors interpolate between the tiles, under a gradient', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  var button = panel.getByLabel('Continuous colors (unclassed)');
  await expect(panel.locator('.color-scheme-gradient')).toBeHidden();
  await button.click();
  await page.waitForTimeout(300);
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('.color-scheme-gradient-segment')).toHaveCount(1);
  var tiles = panel.locator('.color-scheme-tile');
  await expect(tiles).toHaveCount(5);
  expect((await tiles.first().boundingBox()).height).toBe(14);
  // the gradient runs from end to end of the tiles
  var bar = await panel.locator('.color-scheme-gradient-segment').boundingBox();
  var first = await tiles.first().boundingBox();
  var last = await tiles.last().boundingBox();
  expect(Math.abs(bar.x - first.x)).toBeLessThan(1);
  expect(Math.abs(bar.x + bar.width - last.x - last.width)).toBeLessThan(1);
  // each tile's tooltip is the data value at its stop
  await expect(tiles.first()).toHaveAttribute('data-tooltip', '1806 (min)');
  await expect(tiles.last()).toHaveAttribute('data-tooltip', '5434 (max)');

  var records = await getRecords(page);
  var fills = await getFills(page);
  var colors = await getTileColors(page);
  var lowest = records.reduce(function(memo, rec, i) { return rec.id < records[memo].id ? i : memo; }, 0);
  expect(fills[lowest]).toBe(await toHex(page, colors[0]));
  expect(new Set(fills).size).toBeGreaterThan(5);

  // the style panel keeps showing the scheme, and reopening the panel shows it
  await closeSchemePanel(page);
  await expect(page.locator('.layer-style-panel .label-color-field.has-scheme')).toHaveCount(1);
  await openSchemePanel(page);
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await closeSchemePanel(page);
  var classify = (await getSessionCommands(page)).filter(function(cmd) {
    return /^-classify/.test(cmd);
  });
  expect(classify).toEqual([expect.stringMatching(/^-classify field='id' method=quantile classes=4 continuous interpolation=oklch colors=\S+$/)]);
  expect(errors).toEqual([]);
});

test('continuous diverging colors: a gradient on each side, and an optional pivot class', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await runCommand(page, "-each 'v = id - 3000'");
  await openSchemePanel(page);
  var panel = schemePanel(page);
  await panel.locator('.color-scheme-tab').filter({hasText: 'Diverging'}).click();
  await page.waitForTimeout(300);
  await fieldSelect(page).selectOption('v');
  await page.waitForTimeout(300);
  var pivotClass = panel.getByRole('checkbox', {name: 'Pivot class'});
  await expect(pivotClass).toBeChecked();

  await panel.getByLabel('Continuous colors (unclassed)').click();
  await page.waitForTimeout(300);
  // no pivot class by default in this mode: two gradients, and no bar
  await expect(pivotClass).not.toBeChecked();
  await expect(panel.locator('.color-scheme-gradient-segment')).toHaveCount(2);
  await expect(panel.locator('.color-scheme-bar')).toHaveCount(0);
  var segments = await getSegmentBoxes(page);
  var center = await panel.locator('.color-scheme-tile').nth(await getCenterIndex(page)).boundingBox();
  expect(segments[0].x + segments[0].width).toBeLessThanOrEqual(center.x);
  expect(segments[1].x).toBeGreaterThanOrEqual(center.x + center.width);
  // the lowest and highest features have the outer stops' colors
  var records = await getRecords(page);
  var fills = await getFills(page);
  var colors = await getTileColors(page);
  var lowest = records.reduce(function(memo, rec, i) { return rec.v < records[memo].v ? i : memo; }, 0);
  var highest = records.reduce(function(memo, rec, i) { return rec.v > records[memo].v ? i : memo; }, 0);
  var tileBoxes = await Promise.all(colors.map(function(c, i) {
    return panel.locator('.color-scheme-tile').nth(i).boundingBox();
  }));
  // (7 intervals split 4 and 3: the upper side's gradient stops short of
  // the last tile)
  var firstUsed = tileBoxes.findIndex(function(box) { return box.x + box.width > segments[0].x; });
  var lastUsed = tileBoxes.findLastIndex(function(box) { return box.x < segments[1].x + segments[1].width; });
  expect(lastUsed).toBe(colors.length - 2);
  expect(fills[lowest]).toBe(await toHex(page, colors[firstUsed]));
  expect(fills[highest]).toBe(await toHex(page, colors[lastUsed]));

  await pivotClass.click();
  await page.waitForTimeout(300);
  await expect(panel.locator('.color-scheme-gradient-segment')).toHaveCount(3);
  await expect(panel.locator('.color-scheme-tile').nth(await getCenterIndex(page)))
    .toHaveAttribute('data-tooltip', /^-?[\d.]+ to [\d.]+$/);

  // the classed scheme kept its own pivot class setting
  await panel.getByLabel('Continuous colors (unclassed)').click();
  await page.waitForTimeout(300);
  await expect(pivotClass).toBeChecked();
  await expect(panel.locator('.color-scheme-gradient')).toBeHidden();
  await panel.getByLabel('Continuous colors (unclassed)').click();
  await page.waitForTimeout(300);
  await expect(pivotClass).toBeChecked();

  await closeSchemePanel(page);
  var classify = (await getSessionCommands(page)).filter(function(cmd) {
    return /^-classify/.test(cmd);
  });
  expect(classify).toEqual([expect.stringMatching(/^-classify field='v' method=quantile pivot=auto classes=7 pivot-class continuous interpolation=oklch colors=\S+$/)]);
  await expect(page.locator('.layer-style-panel .label-color-field.has-scheme')).toHaveCount(1);
  expect(errors).toEqual([]);
});

async function getSegmentBoxes(page) {
  var segments = schemePanel(page).locator('.color-scheme-gradient-segment');
  var boxes = [];
  for (var i=0; i<await segments.count(); i++) {
    boxes.push(await segments.nth(i).boundingBox());
  }
  return boxes;
}

async function getCenterIndex(page) {
  return (await schemePanel(page).locator('.color-scheme-tile').count() - 1) / 2;
}

// whether a class uses each diverging tile (the bar under it)
async function getUsedTiles(page) {
  return schemePanel(page).locator('.color-scheme-bar').evaluateAll(function(bars) {
    return bars.map(function(bar) { return bar.classList.contains('used'); });
  });
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

function fieldSelect(page) {
  return schemePanel(page).getByLabel('Data field');
}

function methodSelect(page) {
  return schemePanel(page).getByLabel('Classification method');
}

async function getRecords(page) {
  return page.evaluate(function(layer) {
    return window.mapshaper.undoTest.getLayerInfo(layer).records;
  }, LAYER);
}

async function runCommand(page, cmd) {
  await page.evaluate(function(str) {
    return window.mapshaper.undoTest.runCommand(str);
  }, cmd);
  await page.waitForTimeout(150);
}

async function dragTile(page, source, target, side) {
  var a = await source.boundingBox();
  var b = await target.boundingBox();
  var x = side == 'left' ? b.x + 2 : b.x + b.width - 2;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2, {steps: 2});
  await page.mouse.move(x, b.y + b.height / 2, {steps: 5});
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function toHex(page, cssColor) {
  return page.evaluate(function(color) {
    var internal = window.mapshaper.internal;
    return internal.formatColor(internal.parseColor(color));
  }, cssColor);
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
