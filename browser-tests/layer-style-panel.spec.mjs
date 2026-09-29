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
  var fill = page.locator('.layer-style-panel .label-color-input').first();

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
  await setField(rows.nth(0).locator('.label-color-input'), '#3366cc');
  await setField(rows.nth(0).locator('.label-opacity-input'), '40%');
  await setField(rows.nth(1).locator('.label-color-input'), '#ff0000');
  await setField(rows.nth(1).locator('.label-opacity-input'), '80%');

  expect(await getStyleValue(page, 'fill')).toBe('#3366cc');
  expect(await getStyleValue(page, 'fill-opacity')).toBe(0.4);
  expect(await getStyleValue(page, 'stroke')).toBe('#ff0000');
  expect(await getStyleValue(page, 'stroke-opacity')).toBe(0.8);
  expect(errors).toEqual([]);
});

test('an opacity is blank with no colour, and 100% with one', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var rows = page.locator('.layer-style-panel .label-split-row');
  // the fixture has a fill and no fill-opacity, and no stroke at all
  expect(await getStyleValue(page, 'fill')).toBe('#a50000');
  await expect(rows.nth(0).locator('.label-opacity-input')).toHaveValue('100%');
  await expect(rows.nth(1).locator('.label-opacity-input')).toHaveValue('');

  // full opacity is the default, so it is shown without being stored
  await setField(rows.nth(1).locator('.label-color-input'), '#3366cc');
  await expect(rows.nth(1).locator('.label-opacity-input')).toHaveValue('100%');
  expect(await getStyleValue(page, 'stroke-opacity')).toBeUndefined();

  // blanking a field is not a way to set it to zero
  await setField(rows.nth(0).locator('.label-opacity-input'), '');
  await expect(rows.nth(0).locator('.label-opacity-input')).toHaveValue('100%');
  expect(await getStyleValue(page, 'fill-opacity')).toBeUndefined();
  expect(errors).toEqual([]);
});

// Each colour's opacity is inside its field, and the stroke's width sits
// beside the stroke's colour in the narrow column, so that it reads as
// belonging to the stroke rather than as a row of its own.
test('layer style fields are laid out in two columns by what they belong to',
  async function({page}) {
    await loadFixture(page, FIXTURE);
    expect(await page.evaluate(function() {
      var rows = Array.prototype.filter.call(
        document.querySelectorAll('.layer-style-panel .label-split-row'),
        function(row) { return row.offsetParent !== null; });
      return rows.map(function(row) {
        return Array.prototype.map.call(row.children, function(cell) {
          var span = cell.querySelector('span');
          return span ? span.textContent : '-';
        }).join(' | ');
      });
    })).toEqual(['Fill | -', 'Stroke | Width']);
    // the opacity is part of the colour's field, not a column of its own
    expect(await page.locator('.layer-style-panel .label-color-field .label-opacity-input').count()).toBe(2);
  });

test('stroke width is typed or stepped in a size field', async function({page}) {
  // It was a value between a − and a +, three clicks wide, with no way to
  // type a width at all until the value itself was clicked.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var strokeRow = page.locator('.layer-style-panel .label-split-row').nth(1);
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
  await setField(page.locator('.layer-style-panel .label-color-input').first(), '#00ff00');
  expect(await getStyleValue(page, 'fill')).toBe('#00ff00');

  await clickButton(page, 'Random fills');
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
  var rows = page.locator('.layer-style-panel .label-split-row');
  // off to begin with, showing only its heading
  await expect(patternToggle(page)).toHaveAttribute('aria-checked', 'false');
  await expect(patternSelect(page)).toBeHidden();
  await setField(rows.nth(0).locator('.label-color-input'), '#eeeeee');

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
  await setField(rows.nth(0).locator('.label-color-input'), '#cccccc');
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
    .filter({hasText: 'Random fills'}).click();
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

test('the pattern section heading matches the label panel\'s switched sections', async function({page}) {
  await loadFixture(page, POLY_FIXTURE);
  var title = page.locator('.layer-style-panel .label-style-section-title')
    .filter({has: page.locator('.layer-pattern-toggle')});
  await expect(title.locator('.label-style-section-name')).toHaveText('Pattern');
  // the menu has no caption, and no None -- the switch is how to have none
  await expect(page.locator('.layer-pattern-type-row .label-style-row-label')).toHaveCount(0);
  expect(await patternSelect(page).locator('option:not(.hidden)').allTextContents())
    .toEqual(['Hatches', 'Dots', 'Squares', 'Custom']);
});

test('the pattern section is only on the polygon panel', async function({page}) {
  await loadFixture(page, LINE_FIXTURE, 'line_style');
  await expect(page.locator('.layer-style-panel .layer-pattern-type-row')).toBeHidden();
});

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
