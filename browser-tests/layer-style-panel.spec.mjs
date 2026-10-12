import { expect, test } from '@playwright/test';
import {
  getSectionPresence, openAllSections, openSection, removeSectionStyle
} from './style-panel-helpers.mjs';

var PANEL = '.layer-style-panel';
var PATTERNS = 'layer-pattern-section';
var EFFECTS = 'layer-effects-section';

var FIXTURE = 'test/data/issues/389_clipping_error/inner_polygon.json';
var LAYER = 'inner_polygon';

test('a colour is set from its field, and its opacity from the one beside it', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var fill = colorRow(page, 'Fill');
  var stroke = colorRow(page, 'Stroke');

  await setField(fill.locator('.label-color-input'), '#3366cc');
  await setField(fill.locator('.label-opacity-input'), '40%');
  await setField(stroke.locator('.label-color-input'), '#ff0000');
  await setField(stroke.locator('.label-opacity-input'), '80%');

  expect(await getStyleValue(page, 'fill')).toBe('#3366cc');
  expect(await getStyleValue(page, 'fill-opacity')).toBe(0.4);
  expect(await getStyleValue(page, 'stroke')).toBe('#ff0000');
  expect(await getStyleValue(page, 'stroke-opacity')).toBe(0.8);
  expect(errors).toEqual([]);
});

test('a typed colour is kept exactly, not snapped to the picker\'s grid', async function({page}) {
  await loadFixture(page, FIXTURE);
  var row = colorRow(page, 'Fill');
  var fill = row.locator('.label-color-input');
  await setField(fill, '#ff8800');
  await expect(fill).toHaveValue('#ff8800');
  expect(await getStyleValue(page, 'fill')).toBe('#ff8800');

  // opening and closing the picker leaves it alone too
  await row.locator('.label-color-chit').click();
  await row.locator('.label-color-picker button').filter({hasText: 'Close'}).click();
  await page.waitForTimeout(150);
  await expect(fill).toHaveValue('#ff8800');

  // and a preset is applied as the colour it is
  await row.locator('.label-color-chit').click();
  await row.locator('.label-color-preset[aria-label="#e39652"]').click();
  await page.waitForTimeout(250);
  await expect(fill).toHaveValue('#e39652');
  expect(await getStyleValue(page, 'fill')).toBe('#e39652');
});

test('stroke width is typed or stepped in a size field', async function({page}) {
  // It was a value between a − and a +, three clicks wide, with no way to
  // type a width at all until the value itself was clicked.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var strokeRow = colorRow(page, 'Stroke');
  var input = strokeRow.locator('.size-field-input');

  await setField(input, '3');
  expect(await getStyleValue(page, 'stroke-width')).toBe(3);

  // The stepper walks a ladder of widths rather than adding a fixed amount:
  // the useful ones are quarters of a pixel at the hairline end.
  await input.press('ArrowDown');
  await page.waitForTimeout(200);
  expect(await getStyleValue(page, 'stroke-width')).toBe(2);
  await strokeRow.locator('.size-field-down').click();
  await page.waitForTimeout(200);
  expect(await getStyleValue(page, 'stroke-width')).toBe(1.5);
  await expect(input).toHaveValue('1.5');

  // a quarter-pixel width survives the field it is shown in
  await setField(input, '0.25');
  expect(await getStyleValue(page, 'stroke-width')).toBe(0.25);
  expect(errors).toEqual([]);
});

var LINE_FIXTURE = 'test/data/features/divide/ex1_line.json';
var LINE_LAYER = 'ex1_line';

test('clearing a line stroke also clears its width', async function({page}) {
  await loadFixture(page, LINE_FIXTURE, 'line_style');
  await runConsoleCommand(page, "-style stroke='#333333' stroke-width=2");

  await setField(colorRow(page, 'Stroke').locator('.label-color-input'), '');
  expect(await getStyleValue(page, 'stroke', LINE_LAYER)).toBeUndefined();
  expect(await getStyleValue(page, 'stroke-width', LINE_LAYER)).toBeUndefined();
});

test('dashes are typed as a -style stroke-dasharray value', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, LINE_FIXTURE, 'line_style');
  var input = page.locator('.layer-style-panel .layer-dash-cell input');
  await expect(page.locator('.layer-style-panel .layer-dash-cell .label-style-row-label'))
    .toContainText('Dashes');
  await expect(page.locator('.layer-style-panel .layer-dash-cell .tip-button')).toHaveCount(1);

  await setField(input, '6 3');
  expect(await getStyleValue(page, 'stroke-dasharray', LINE_LAYER)).toBe('6 3');
  expect((await getSessionCommands(page)).join('\n')).toContain("stroke-dasharray='6 3'");

  // commas and extra spaces are tidied into the form -style takes
  await setField(input, ' 4,  2 ');
  expect(await getStyleValue(page, 'stroke-dasharray', LINE_LAYER)).toBe('4 2');
  await expect(input).toHaveValue('4 2');

  // a value -style would not accept puts the field back and changes nothing
  await setField(input, 'dotted');
  expect(await getStyleValue(page, 'stroke-dasharray', LINE_LAYER)).toBe('4 2');
  await expect(input).toHaveValue('4 2');

  // blank makes the line solid again
  await setField(input, '');
  expect(await getStyleValue(page, 'stroke-dasharray', LINE_LAYER)).toBeUndefined();
  expect(errors).toEqual([]);
});

test('line caps are a three-way toggle, round by default', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, LINE_FIXTURE, 'line_style');
  var btn = function(cap) {
    return page.locator('.layer-style-panel .layer-cap-buttons [data-line-cap="' + cap + '"]');
  };
  await expect(page.locator('.layer-style-panel .layer-cap-buttons .label-panel-btn'))
    .toHaveText(['Round', 'Butt', 'Square']);
  await expect(btn('round')).toHaveClass(/selected/);

  await btn('square').click();
  await page.waitForTimeout(200);
  expect(await getStyleValue(page, 'stroke-linecap', LINE_LAYER)).toBe('square');
  // a line with no stroke gets the default one, as with the other controls,
  // or the styled line would not be drawn
  expect(await getStyleValue(page, 'stroke', LINE_LAYER)).toBe('#000000');
  expect((await getSessionCommands(page)).join('\n')).toContain("stroke-linecap='square' stroke='#000000'");
  await expect(btn('square')).toHaveClass(/selected/);
  await expect(btn('round')).not.toHaveClass(/selected/);

  // the default is unset rather than stored
  await btn('round').click();
  await page.waitForTimeout(200);
  expect(await getStyleValue(page, 'stroke-linecap', LINE_LAYER)).toBeUndefined();
  expect(await getStyleValue(page, 'stroke', LINE_LAYER)).toBe('#000000');
  await expect(btn('round')).toHaveClass(/selected/);

  // dashed lines default to butt caps, so round has to be stored for them
  await setField(page.locator('.layer-style-panel .layer-dash-cell input'), '4');
  await expect(btn('butt')).toHaveClass(/selected/);
  await btn('round').click();
  await page.waitForTimeout(200);
  expect(await getStyleValue(page, 'stroke-linecap', LINE_LAYER)).toBe('round');

  await page.evaluate(function() { window.mapshaper.undoTest.undo(); });
  await page.waitForTimeout(250);
  expect(await getStyleValue(page, 'stroke-linecap', LINE_LAYER)).toBeUndefined();
  await expect(btn('butt')).toHaveClass(/selected/);
  expect(errors).toEqual([]);
});

var POLY_FIXTURE = 'test/data/features/join/ex1_polyB.json';
var POLY_LAYER = 'ex1_polyB';

test('a hatch pattern is drawn over the fill, and follows it', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, POLY_FIXTURE, null, {open: false});
  var fill = colorRow(page, 'Fill');
  // closed to begin with, showing only its heading
  expect(await getSectionPresence(page, PANEL, PATTERNS)).toBe('off');
  await expect(patternSelect(page)).toBeHidden();
  await setField(fill.locator('.label-color-input'), '#eeeeee');

  // open, with no pattern, the menu says so
  await openSection(page, PANEL, PATTERNS);
  await expect(patternSelect(page)).toHaveValue('none');
  await expect(page.locator('.layer-pattern-color-row')).toBeHidden();

  // choosing a type adds the pattern
  await selectPattern(page, 'hatches');
  expect(await getPatterns(page)).toEqual(Array(3).fill('hatches 3px #eeeeee 1px #000000'));
  expect(await getSectionPresence(page, PANEL, PATTERNS)).toBe('on');
  await expect(patternSelect(page)).toHaveValue('hatches');
  await expect(page.locator('.layer-pattern-size-row span').first()).toHaveText('Width');

  await setField(patternSizeField(page, 'Width'), '2');
  await setField(patternSizeField(page, 'Gap'), '4');
  await setField(page.locator('.layer-pattern-color-row .size-field-input'), '90');
  await setField(page.locator('.layer-pattern-color-row .label-color-input'), '#ff0000');
  expect((await getPatterns(page))[0]).toBe('hatches 90deg 4px #eeeeee 2px #ff0000');

  // a new fill is the pattern's new background, in the same undo step
  await setField(fill.locator('.label-color-input'), '#cccccc');
  expect((await getPatterns(page))[0]).toBe('hatches 90deg 4px #cccccc 2px #ff0000');
  await page.evaluate(function() { window.mapshaper.undoTest.undo(); });
  await page.waitForTimeout(250);
  expect((await getPatterns(page))[0]).toBe('hatches 90deg 4px #eeeeee 2px #ff0000');
  expect(await getStyleValue(page, 'fill', POLY_LAYER)).toBe('#eeeeee');
  expect(errors).toEqual([]);
});

test('each feature gets its pattern over its own fill', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, POLY_FIXTURE);
  await runConsoleCommand(page, "-style fill='#aaaaaa' ids=0");
  await runConsoleCommand(page, "-style fill='#bbbbbb' ids=1");

  await selectPattern(page, 'dots');
  expect(await getPatterns(page)).toEqual([
    'dots 2px #000000 3px #aaaaaa',
    'dots 2px #000000 3px #bbbbbb',
    'dots 2px #000000 3px none' // no fill, so a clear background
  ]);
  // the same pattern over different fills is still one pattern
  await expect(patternSelect(page)).toHaveValue('dots');
  await expect(page.locator('.layer-pattern-size-row span').first()).toHaveText('Size');
  expect(errors).toEqual([]);
});

test('a glow is added by picking its color, and removed by emptying it',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, POLY_FIXTURE, null, {open: false});
    var outerRow = page.locator('.layer-style-panel .layer-outer-glow-row');
    var innerRow = page.locator('.layer-style-panel .layer-inner-glow-row');
    expect(await getSectionPresence(page, PANEL, EFFECTS)).toBe('off');
    await expect(outerRow).toBeHidden();

    // opening the section adds nothing
    await openSection(page, PANEL, EFFECTS);
    expect(await getSectionPresence(page, PANEL, EFFECTS)).toBe('off');
    await expect(outerRow.locator('.label-color-input')).toHaveValue('');
    await expect(outerRow.locator('.label-opacity-input')).toHaveValue('');
    await expect(outerRow.locator('.size-field-input')).toHaveValue('10');
    expect(await getGlows(page, 'outer')).toEqual(Array(3).fill('  '));

    // a width typed before the color goes with it
    await setField(outerRow.locator('.size-field-input'), '14');
    await setField(outerRow.locator('.label-color-input'), '#000000');
    expect(await getGlows(page, 'outer')).toEqual(Array(3).fill('#000000 14 '));
    await expect(outerRow.locator('.label-opacity-input')).toHaveValue('100%');
    await setField(outerRow.locator('.label-opacity-input'), '50%');
    expect(await getGlows(page, 'outer')).toEqual(Array(3).fill('#000000 14 0.5'));

    await setField(innerRow.locator('.label-color-input'), '#ff0000');
    expect(await getGlows(page, 'inner')).toEqual(Array(3).fill('#ff0000  '));

    // emptying the color removes the glow, and is one undo step
    await setField(innerRow.locator('.label-color-input'), '');
    expect(await getGlows(page, 'inner')).toEqual(Array(3).fill('  '));
    await expect(innerRow.locator('.label-opacity-input')).toHaveValue('');
    await page.evaluate(function() { window.mapshaper.undoTest.undo(); });
    await page.waitForTimeout(250);
    expect(await getGlows(page, 'inner')).toEqual(Array(3).fill('#ff0000  '));

    // the × removes both glows and their settings, and leaves the section open
    expect(await getSectionPresence(page, PANEL, EFFECTS)).toBe('on');
    await removeSectionStyle(page, PANEL, EFFECTS);
    expect(await getGlows(page, 'outer')).toEqual(Array(3).fill('  '));
    expect(await getGlows(page, 'inner')).toEqual(Array(3).fill('  '));
    expect(await getSectionPresence(page, PANEL, EFFECTS)).toBe('off');
    await expect(outerRow).toBeVisible();
    expect(errors).toEqual([]);
  });

test('an emptied fill or stroke is unset, and an emptied pattern color is the default',
  async function({page}) {
    await loadFixture(page, POLY_FIXTURE);
    var fill = colorRow(page, 'Fill').locator('.label-color-input');
    await runConsoleCommand(page, "-style fill='#aaaaaa' stroke='#333333' stroke-width=2");
    await setField(fill, '');
    expect((await getRecords(page)).map(function(rec) { return rec.fill; })).toEqual(Array(3).fill(undefined));
    await expect(fill).toHaveValue('');
    await setField(colorRow(page, 'Stroke').locator('.label-color-input'), '');
    var records = await getRecords(page);
    expect(records.map(function(rec) { return rec.stroke; })).toEqual(Array(3).fill(undefined));
    expect(records.map(function(rec) { return rec['stroke-width']; })).toEqual(Array(3).fill(undefined));

    await selectPattern(page, 'dots');
    var color = page.locator('.layer-pattern-color-row .label-color-input');
    await setField(color, '#ff0000');
    expect((await getPatterns(page))[0]).toBe('dots 2px #ff0000 3px none');
    await setField(color, '');
    expect((await getPatterns(page))[0]).toBe('dots 2px #000000 3px none');
    await expect(color).toHaveValue('#000000');
  });

test('clearing a selected feature stroke leaves other feature strokes alone',
  async function({page}) {
    await loadFixture(page, POLY_FIXTURE);
    await runConsoleCommand(page, "-style stroke='#333333' stroke-width=2");
    await selectFeature(page, POLY_LAYER, 0);

    await setField(colorRow(page, 'Stroke').locator('.label-color-input'), '');
    var records = await getRecords(page);
    expect(records[0].stroke).toBeUndefined();
    expect(records[0]['stroke-width']).toBeUndefined();
    expect(records.slice(1).map(function(rec) {
      return [rec.stroke, rec['stroke-width']];
    })).toEqual([['#333333', 2], ['#333333', 2]]);
    expect((await getSessionCommands(page)).join('\n'))
      .toContain("-style stroke='' stroke-width='' ids=0");
  });

async function getGlows(page, type) {
  return (await getRecords(page)).map(function(rec) {
    return ['color', 'width', 'opacity'].map(function(name) {
      var val = rec[type + '-glow-' + name];
      return val === undefined ? '' : val;
    }).join(' ');
  });
}

// The colour row with the caption @label, wherever the panel puts it.
function colorRow(page, label) {
  return page.locator('.layer-style-panel .label-split-row').filter({
    has: page.locator('.label-split-cell > span', {hasText: new RegExp('^' + label + '$')})
  });
}

function patternSelect(page) {
  return page.locator('.layer-style-panel .layer-pattern-type-row select');
}

async function selectPattern(page, type) {
  await patternSelect(page).selectOption(type);
  await page.waitForTimeout(250);
}

function patternSizeField(page, label) {
  return page.locator('.layer-pattern-size-row .label-split-cell')
    .filter({hasText: label}).locator('.size-field-input');
}

async function getRecords(page) {
  return page.evaluate(function(layer) {
    return window.mapshaper.undoTest.getLayerInfo(layer).records;
  }, POLY_LAYER);
}

async function getPatterns(page) {
  return (await getRecords(page)).map(function(rec) { return rec['fill-pattern']; });
}

async function selectFeature(page, layer, id) {
  var p = await page.evaluate(function(o) {
    var points = window.mapshaper.undoTest.getLayerPathPixels(o.layer)[o.id][0];
    var xs = points.map(function(point) { return point[0]; });
    var ys = points.map(function(point) { return point[1]; });
    return [(Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2,
      (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2];
  }, {layer: layer, id: id});
  var box = await page.locator('.map-layers').boundingBox();
  var x = box.x + p[0], y = box.y + p[1];
  await page.mouse.move(x - 5, y - 5);
  await page.mouse.move(x, y, {steps: 3});
  await page.waitForTimeout(100);
  await page.mouse.click(x, y);
  await expect.poll(function() {
    return page.evaluate(function() {
      return window.mapshaper.undoTest.getSelectionIds();
    });
  }).toEqual([id]);
}

async function runConsoleCommand(page, cmd) {
  await page.evaluate(function(str) {
    return window.mapshaper.undoTest.runCommand(str);
  }, cmd);
  await page.waitForTimeout(150);
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

async function getStyleValue(page, field, layer) {
  return page.evaluate(function(o) {
    var lyr = window.mapshaper.undoTest.getLayerInfo(o.layer);
    return lyr && lyr.records[0] && lyr.records[0][o.field];
  }, {layer: layer || LAYER, field: field});
}

// opts.open: false to leave the panel's sections closed, as they start
async function loadFixture(page, fixture, mode, opts) {
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(fixture));
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest;
  });
  await page.waitForFunction(function() {
    return window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
  await page.evaluate(function(mode) {
    window.mapshaper.undoTest.clearUndoHistory();
    window.mapshaper.undoTest.setInteractionMode(mode);
  }, mode || 'polygon_style');
  await page.locator('.layer-style-panel').waitFor({state: 'visible'});
  if (!opts || opts.open !== false) await openAllSections(page);
}

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}
