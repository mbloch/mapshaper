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
  var fill = colorRow(page, 'Fill').locator('.label-color-input');

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

test('an opacity is blank with no colour, and 100% with one', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var fill = colorRow(page, 'Fill');
  var stroke = colorRow(page, 'Stroke');
  // the fixture has a fill and no fill-opacity, and no stroke at all
  expect(await getStyleValue(page, 'fill')).toBe('#a50000');
  await expect(fill.locator('.label-opacity-input')).toHaveValue('100%');
  await expect(stroke.locator('.label-opacity-input')).toHaveValue('');

  // full opacity is the default, so it is shown without being stored
  await setField(stroke.locator('.label-color-input'), '#3366cc');
  await expect(stroke.locator('.label-opacity-input')).toHaveValue('100%');
  expect(await getStyleValue(page, 'stroke-opacity')).toBeUndefined();

  // blanking a field is not a way to set it to zero
  await setField(fill.locator('.label-opacity-input'), '');
  await expect(fill.locator('.label-opacity-input')).toHaveValue('100%');
  expect(await getStyleValue(page, 'fill-opacity')).toBeUndefined();
  expect(errors).toEqual([]);
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

test('the panel buttons still do what they say', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await setField(colorRow(page, 'Fill').locator('.label-color-input'), '#00ff00');
  expect(await getStyleValue(page, 'fill')).toBe('#00ff00');

  await clickButton(page, 'Random fill');
  expect(await getStyleValue(page, 'fill')).not.toBe('#00ff00');

  await clickButton(page, 'Clear style');
  expect(await getStyleValue(page, 'fill')).toBeUndefined();
  expect(errors).toEqual([]);
});

var LINE_FIXTURE = 'test/data/features/divide/ex1_line.json';
var LINE_LAYER = 'ex1_line';

test('dashes are typed as a -style stroke-dasharray value', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, LINE_FIXTURE, 'line_style');
  var input = page.locator('.layer-style-panel .layer-dash-row input');
  await expect(page.locator('.layer-style-panel .layer-dash-row .label-style-row-label'))
    .toContainText('Dashes');
  await expect(page.locator('.layer-style-panel .layer-dash-row .tip-button')).toHaveCount(1);

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

test('the dashes field is only on the line panel', async function({page}) {
  await loadFixture(page, FIXTURE);
  await expect(page.locator('.layer-style-panel .layer-dash-row')).toBeHidden();
});

var POLY_FIXTURE = 'test/data/features/join/ex1_polyB.json';
var POLY_LAYER = 'ex1_polyB';

test('a hatch pattern is drawn over the fill, and follows it', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, POLY_FIXTURE);
  var fill = colorRow(page, 'Fill');
  // off to begin with, showing only its heading
  await expect(patternToggle(page)).toHaveAttribute('aria-checked', 'false');
  await expect(patternSelect(page)).toBeHidden();
  await setField(fill.locator('.label-color-input'), '#eeeeee');

  // switching it on starts with a hatch
  await clickPatternToggle(page);
  expect(await getPatterns(page)).toEqual(Array(3).fill('hatches 3px #eeeeee 1px #000000'));
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

test('the pattern menu stays open when clicked', async function({page}) {
  // A native menu closes when its element is blurred, and the panel lets go of
  // focus after a click. Focus staying on the <select> is what "the menu is
  // open" looks like from here: the menu itself is drawn by the OS.
  await loadFixture(page, POLY_FIXTURE);
  await clickPatternToggle(page);
  var box = await patternSelect(page).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(250);
  expect(await getFocusedElement(page)).toBe('SELECT');
  // choosing from it applies the pattern and gives the keyboard back
  await patternSelect(page).selectOption('dots');
  await page.waitForTimeout(250);
  expect((await getPatterns(page))[0]).toBe('dots 2px #000000 3px none');
  expect(await getFocusedElement(page)).toBe('BODY');
});

test('each feature gets its pattern over its own fill', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, POLY_FIXTURE);
  await runConsoleCommand(page, "-style fill='#aaaaaa' ids=0");
  await runConsoleCommand(page, "-style fill='#bbbbbb' ids=1");

  await clickPatternToggle(page);
  await selectPattern(page, 'dots');
  expect(await getPatterns(page)).toEqual([
    'dots 2px #000000 3px #aaaaaa',
    'dots 2px #000000 3px #bbbbbb',
    'dots 2px #000000 3px none' // no fill, so a clear background
  ]);
  // the same pattern over different fills is still one pattern
  await expect(patternSelect(page)).toHaveValue('dots');
  await expect(page.locator('.layer-pattern-size-row span').first()).toHaveText('Size');

  // random fills are chosen by the command, and the patterns follow them
  await page.locator('.layer-style-panel .label-panel-action-btn')
    .filter({hasText: 'Random fill'}).click();
  await page.waitForTimeout(400);
  var records = await getRecords(page);
  records.forEach(function(rec) {
    expect(rec['fill-pattern']).toBe('dots 2px #000000 3px ' + rec.fill);
  });
  await expect(patternSelect(page)).toHaveValue('dots');
  expect(errors).toEqual([]);
});

test('a pattern the controls cannot describe is shown as its code', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, POLY_FIXTURE);
  var code = page.locator('.layer-pattern-code-row input');
  await runConsoleCommand(page, "-style fill-pattern='dashes 4px 2px 1px black 4px white'");
  await expect(patternToggle(page)).toHaveAttribute('aria-checked', 'true');
  await expect(patternSelect(page)).toHaveValue('custom');
  await expect(code).toHaveValue('dashes 4px 2px 1px black 4px white');
  await expect(page.locator('.layer-pattern-code-row .tip-button')).toHaveCount(1);

  // not a pattern: the field goes back and nothing changes
  await setField(code, 'zigzag 2px');
  await expect(code).toHaveValue('dashes 4px 2px 1px black 4px white');
  expect((await getPatterns(page))[0]).toBe('dashes 4px 2px 1px black 4px white');

  await setField(code, 'hatches 1px red 1px white 1px blue');
  expect((await getPatterns(page))[0]).toBe('hatches 1px red 1px white 1px blue');

  // off takes it away, and on again brings back the pattern that was showing
  await clickPatternToggle(page);
  expect(await getPatterns(page)).toEqual([undefined, undefined, undefined]);
  await expect(page.locator('.layer-pattern-code-row')).toBeHidden();
  await clickPatternToggle(page);
  expect(await getPatterns(page)).toEqual(Array(3).fill('hatches 1px red 1px white 1px blue'));
  expect(errors).toEqual([]);
});

test('choosing Custom shows the code for the pattern being replaced', async function({page}) {
  await loadFixture(page, POLY_FIXTURE);
  await clickPatternToggle(page);
  await selectPattern(page, 'squares');
  await selectPattern(page, 'custom');
  await expect(page.locator('.layer-pattern-code-row input')).toHaveValue('squares 2px #000000 2px none');
  await expect(patternSelect(page)).toHaveValue('custom');
});

test('a pattern on some of the features shows as mixed', async function({page}) {
  await loadFixture(page, POLY_FIXTURE);
  await runConsoleCommand(page, "-style fill-pattern='hatches 3px none 1px black' ids=0");
  await expect(patternToggle(page)).toHaveAttribute('aria-checked', 'mixed');
  await expect(patternSelect(page)).toHaveValue('mixed');
  await expect(page.locator('.layer-pattern-color-row')).toBeHidden();

  // switching on gives the rest the pattern the others have
  await clickPatternToggle(page);
  expect(await getPatterns(page)).toEqual(Array(3).fill('hatches 3px none 1px black'));
  await expect(patternToggle(page)).toHaveAttribute('aria-checked', 'true');
  await expect(patternSelect(page)).toHaveValue('hatches');
});

test('the pattern section is only on the polygon panel', async function({page}) {
  await loadFixture(page, LINE_FIXTURE, 'line_style');
  await expect(page.locator('.layer-style-panel .layer-pattern-type-row')).toBeHidden();
});

test('a glow is added by picking its color, and removed by emptying it',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, POLY_FIXTURE);
    var effects = page.locator('.layer-style-panel .layer-effects-toggle');
    var outerRow = page.locator('.layer-style-panel .layer-outer-glow-row');
    var innerRow = page.locator('.layer-style-panel .layer-inner-glow-row');
    await expect(effects).toHaveAttribute('aria-checked', 'false');
    await expect(outerRow).toBeHidden();

    // switching on opens the section, with no glow yet
    await effects.click();
    await page.waitForTimeout(250);
    await expect(effects).toHaveAttribute('aria-checked', 'true');
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

    // switching off removes both glows and their settings
    await effects.click();
    await page.waitForTimeout(250);
    expect(await getGlows(page, 'outer')).toEqual(Array(3).fill('  '));
    expect(await getGlows(page, 'inner')).toEqual(Array(3).fill('  '));
    await expect(effects).toHaveAttribute('aria-checked', 'false');
    await expect(outerRow).toBeHidden();
    expect(errors).toEqual([]);
  });

test('a glow on some of the features shows as mixed', async function({page}) {
  await loadFixture(page, POLY_FIXTURE);
  await runConsoleCommand(page, '-style inner-glow-color=white inner-glow-width=6 ids=0');
  await runConsoleCommand(page, '-style inner-glow-color=white inner-glow-width=4 ids=1');
  var innerRow = page.locator('.layer-style-panel .layer-inner-glow-row');
  await expect(page.locator('.layer-style-panel .layer-effects-toggle')).toHaveAttribute('aria-checked', 'mixed');
  await expect(innerRow.locator('.size-field-input')).toHaveValue('');
  await expect(innerRow.locator('.label-color-input')).toHaveValue('');
  await expect(innerRow.locator('.label-color-input')).toHaveAttribute('placeholder', 'mixed');
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
    expect((await getRecords(page))[0].stroke).toBeUndefined();

    await clickPatternToggle(page);
    await selectPattern(page, 'dots');
    var color = page.locator('.layer-pattern-color-row .label-color-input');
    await setField(color, '#ff0000');
    expect((await getPatterns(page))[0]).toBe('dots 2px #ff0000 3px none');
    await setField(color, '');
    expect((await getPatterns(page))[0]).toBe('dots 2px #000000 3px none');
    await expect(color).toHaveValue('#000000');
  });

test('glows are drawn on the map', async function({page}) {
  await loadFixture(page, POLY_FIXTURE);
  await runConsoleCommand(page, '-style fill=#cccccc');
  var before = await getMapPixels(page);
  // a glow is of what a shape paints, so a shape that paints nothing has none
  await runConsoleCommand(page, '-style fill=none outer-glow-width=20 outer-glow-color=#ff0000');
  expect((await getMapPixels(page)).red).toBe(before.red);
  await runConsoleCommand(page, '-style fill=#cccccc');
  await page.waitForTimeout(250);
  var after = await getMapPixels(page);
  expect(after.red).toBeGreaterThan(before.red + 100);
});

test('the Effects section is only on the polygon panel', async function({page}) {
  await loadFixture(page, LINE_FIXTURE, 'line_style');
  await expect(page.locator('.layer-style-panel .layer-effects-toggle')).toBeHidden();
});

async function getGlows(page, type) {
  return (await getRecords(page)).map(function(rec) {
    return ['color', 'width', 'opacity'].map(function(name) {
      var val = rec[type + '-glow-' + name];
      return val === undefined ? '' : val;
    }).join(' ');
  });
}

// How many of the map's pixels are mostly red.
async function getMapPixels(page) {
  return page.evaluate(function() {
    var red = 0;
    document.querySelectorAll('.map-layers canvas').forEach(function(canvas) {
      var data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (var i=0; i<data.length; i+=4) {
        if (data[i+3] > 30 && data[i] > 2 * data[i+1] && data[i] > 2 * data[i+2]) red++;
      }
    });
    return {red: red};
  });
}

// The colour row with the caption @label, wherever the panel puts it.
function colorRow(page, label) {
  return page.locator('.layer-style-panel .label-split-row').filter({
    has: page.locator('.label-split-cell > span', {hasText: new RegExp('^' + label + '$')})
  });
}

function patternToggle(page) {
  return page.locator('.layer-style-panel .layer-pattern-toggle');
}

async function clickPatternToggle(page) {
  await patternToggle(page).click();
  await page.waitForTimeout(250);
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

async function getStyleValue(page, field, layer) {
  return page.evaluate(function(o) {
    var lyr = window.mapshaper.undoTest.getLayerInfo(o.layer);
    return lyr && lyr.records[0] && lyr.records[0][o.field];
  }, {layer: layer || LAYER, field: field});
}

// What has the keyboard: a tag name, or 'BODY' for nothing in particular.
async function getFocusedElement(page) {
  return page.evaluate(function() {
    var el = document.activeElement;
    return el ? el.nodeName : 'none';
  });
}

async function loadFixture(page, fixture, mode) {
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
}

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}
