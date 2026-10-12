import fs from 'fs';
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

test('the GMT and JSON buttons save the classes and colors', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  await methodSelect(page).selectOption('equal-interval');
  await setField(panel.locator('.size-field-input'), '2');
  var colors = await getTileColors(page);

  var download = page.waitForEvent('download');
  await panel.locator('.color-scheme-export-row').getByText('JSON').click();
  var file = await download;
  expect(file.suggestedFilename()).toBe('ex8_britain-id.json');
  var data = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
  expect(data.field).toBe('id');
  expect(data.breaks).toEqual([3620]);
  expect(await Promise.all(data.colors.map(function(c) { return toCssColor(page, c); }))).toEqual(colors);
  expect(data.expression[0]).toBe('case');

  download = page.waitForEvent('download');
  await panel.locator('.color-scheme-export-row').getByText('GMT').click();
  file = await download;
  expect(file.suggestedFilename()).toBe('ex8_britain-id.cpt');
  var lines = fs.readFileSync(await file.path(), 'utf8').trim().split('\n');
  expect(lines.filter(function(line) { return line[0] != '#'; }).map(function(line) {
    return line.split('\t')[0];
  })).toEqual(['1806', '3620', 'B', 'F', 'N']);

  // nothing to export for non-adjacent colors
  await panel.locator('.color-scheme-tab').filter({hasText: 'Categorical'}).click();
  await methodSelect(page).selectOption('non-adjacent');
  await expect(panel.locator('.color-scheme-export-row .label-panel-action-btn.disabled')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('a pasted palette is imported, and not loaded as a data file', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  var dialog = page.locator('.color-scheme-import-dialog');
  await panel.locator('.color-scheme-export-row').getByText('Import').click();
  await expect(dialog).toBeVisible();

  await pasteText(page, 'not a palette at all');
  await expect(dialog.locator('.color-scheme-import-message.error')).toContainText('isn\'t a GMT color palette');

  // with a picture of the text, as some apps copy it
  await pasteText(page, '"#ff0000", "#00ff00", "#0000ff"', true);
  await expect(dialog).toBeHidden();
  expect(await getTileColors(page)).toEqual(['rgb(255, 0, 0)', 'rgb(0, 255, 0)', 'rgb(0, 0, 255)']);
  expect(new Set(await getFills(page))).toEqual(new Set(['#ff0000', '#00ff00', '#0000ff']));
  expect(await page.evaluate(function() {
    return window.mapshaper.undoTest.getState().model.datasetCount;
  })).toBe(1);
  expect(errors).toEqual([]);
});

test('an exported palette dropped on the import dialog comes back as it was', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  await methodSelect(page).selectOption('equal-interval');
  var colors = await getTileColors(page);
  var download = page.waitForEvent('download');
  await panel.locator('.color-scheme-export-row').getByText('GMT').click();
  var text = fs.readFileSync(await (await download).path(), 'utf8');

  await panel.locator('.color-scheme-tab').filter({hasText: 'Diverging'}).click();
  await panel.locator('.color-scheme-export-row').getByText('Import').click();
  await page.locator('.color-scheme-import-drop').evaluate(function(el, text) {
    var transfer = new DataTransfer();
    transfer.items.add(new File([text], 'palette.cpt', {type: 'text/plain'}));
    el.dispatchEvent(new DragEvent('drop', {dataTransfer: transfer, bubbles: true, cancelable: true}));
  }, text);
  await expect(page.locator('.color-scheme-import-dialog')).toBeHidden();
  await expect(panel.locator('.color-scheme-tab.selected')).toHaveText('Sequential');
  await expect(methodSelect(page)).toHaveValue('equal-interval');
  expect(await getTileColors(page)).toEqual(colors);
  expect(errors).toEqual([]);
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
  await expect(panel.locator('.color-scheme-palette-name')).toHaveText('batlowS');
  // the whole palette, with a bar under the three swatches in use
  await expect(panel.locator('.color-scheme-tile')).toHaveCount(20);
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
  // the numeric id field gives a swatch to each of its 12 values
  await expect(fieldSelect(page)).toHaveValue('id');
  await expect(panel.locator('.color-scheme-pin.used')).toHaveCount(12);

  await methodSelect(page).selectOption('non-adjacent');
  await page.waitForTimeout(300);
  await expect(fieldSelect(page)).toBeHidden();
  await expect(panel.locator('.size-field-input')).toHaveValue('5');
  await expect(panel.locator('.color-scheme-pin.used')).toHaveCount(5);
  await setField(panel.locator('.size-field-input'), '4');
  await expect(panel.locator('.color-scheme-tile')).toHaveCount(20);
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
  await expect(panel.locator('.color-scheme-pin.used')).toHaveCount(11);

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

test('the class breaks dialog edits the breaks, by value or by dragging', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page);
  await openSchemePanel(page);
  var panel = schemePanel(page);
  var dialog = breaksDialog(page);
  await methodSelect(page).selectOption('equal-interval');
  await setField(panel.locator('.size-field-input'), '4');
  await expect(panel.locator('.color-scheme-select-row > span').nth(1)).toHaveText('Breaks');

  // ids from 1806 to 5434, in four equal intervals
  await panel.getByText('Customize').click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.class-breaks-bar')).toHaveCount(40);
  await expect(dialog.locator('.class-breaks-handle')).toHaveCount(3);
  var inputs = dialog.locator('.class-breaks-table input');
  await expect(inputs).toHaveCount(3);
  await expect(inputs.nth(1)).toHaveValue('3620');

  var before = await getFills(page);
  // the ids are 1806 to 2023, 4358 to 4361 and 5430 to 5434: the break goes
  // between 4359 and 4361
  await setField(inputs.nth(1), '4360');
  await expect(methodSelect(page)).toHaveValue('breaks');
  await expect(methodSelect(page).locator('option:checked')).toHaveText('Custom');
  await expect(panel.locator('.color-scheme-tile').nth(1)).toHaveAttribute('data-tooltip', /4360/);
  expect(await getFills(page)).not.toEqual(before);
  // each class, with its color and number of features, between the breaks
  await expect(dialog.locator('.class-breaks-count')).toHaveText(
    ['6 features', '2', '1', '3']);
  var swatchColors = await dialog.locator('.class-breaks-swatch').evaluateAll(function(els) {
    return els.map(function(el) { return getComputedStyle(el).backgroundColor; });
  });
  var tileColors = await panel.locator('.color-scheme-tile').evaluateAll(function(els) {
    return els.map(function(el) { return getComputedStyle(el).backgroundColor; });
  });
  expect(swatchColors).toEqual(tileColors);

  // a dragged break goes to a round value, and the map follows it: to below
  // the ids from 2016 to 2023
  before = await getFills(page);
  var handle = dialog.locator('.class-breaks-handle').nth(0);
  var box = await handle.boundingBox();
  var track = await dialog.locator('.class-breaks-handles').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.04, box.y + box.height / 2, {steps: 5});
  await page.mouse.up();
  var dragged = Number(await inputs.nth(0).inputValue());
  expect(dragged).toBeLessThan(2016);
  expect(dragged).toBeGreaterThan(1815);
  expect(String(dragged).replace(/^-|0+$/g, '').length).toBeLessThanOrEqual(3);
  expect(await getFills(page)).not.toEqual(before);

  // more colors keep the custom breaks, splitting a class
  await setField(panel.locator('.size-field-input'), '5');
  await expect(methodSelect(page)).toHaveValue('breaks');
  await expect(inputs).toHaveCount(4);
  await expect(inputs.nth(0)).toHaveValue(String(dragged));

  // choosing a method starts over with its breaks
  await methodSelect(page).selectOption('equal-interval');
  await expect(methodSelect(page).locator('option[value="breaks"]')).toHaveCount(0);
  await expect(inputs.nth(0)).not.toHaveValue(String(dragged));

  await closeSchemePanel(page);
  await expect(dialog).toBeHidden();
  var classify = (await getSessionCommands(page)).filter(function(cmd) {
    return /^-classify/.test(cmd);
  });
  expect(classify.length).toBe(1);
  expect(classify[0]).toMatch(/method=equal-interval/);
  expect(errors).toEqual([]);
});

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

async function pasteText(page, text, withImage) {
  await page.evaluate(function(args) {
    var transfer = new DataTransfer();
    transfer.setData('text/plain', args.text);
    if (args.withImage) transfer.items.add(new File(['not text'], 'image.png', {type: 'image/png'}));
    document.body.dispatchEvent(new ClipboardEvent('paste', {clipboardData: transfer, bubbles: true, cancelable: true}));
  }, {text: text, withImage: !!withImage});
}

async function getTileColors(page) {
  return schemePanel(page).locator('.color-scheme-tile').evaluateAll(function(tiles) {
    return tiles.map(function(tile) { return tile.style.backgroundColor; });
  });
}

function fieldSelect(page) {
  return schemePanel(page).getByLabel('Data field');
}

// "Breaks" on the numeric tabs, "Method" on the categorical tab
function methodSelect(page) {
  return schemePanel(page).locator('select[aria-label="Class breaks"], select[aria-label="Classification method"]');
}

function breaksDialog(page) {
  return page.locator('.class-breaks-dialog');
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

async function getSelectionIds(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getSelectionIds();
  });
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

// nyt: 'on' to offer the NYT presets; off by default, so that the menu is the
// same on any machine (see gui-nyt.mjs)
async function loadFixture(page, nyt) {
  await page.goto('/?undo=on&undo-test=on&nyt=' + (nyt || 'off') + '&files=' + encodeURIComponent(FIXTURE));
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
