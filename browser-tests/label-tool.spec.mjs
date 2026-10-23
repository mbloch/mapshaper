import { expect, test } from '@playwright/test';
import { closeSidebarAfterImport, openLayersPanel } from './sidebar-helpers.mjs';
import { openAllSections } from './style-panel-helpers.mjs';

// A square polygon layer: a target the label tool cannot add to, so it should
// create a label layer beside it.
var FIXTURE = 'test/data/features/snip/ring_and_line.json';

test('the anchored label tool creates a label where the map was clicked', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);

  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  // the click puts a caret where the label will go; typing is what creates it
  expect(await getLabelLayer(page)).toBeNull();
  await writeLabel(page, 'Reno');

  var lyr = await getLabelLayer(page);
  expect(lyr).not.toBeNull();
  expect(lyr.shapeCount).toBe(1);
  expect(lyr.geometryTypes).toEqual(['Point']);
  expect(errors).toEqual([]);
});

test('the tool works in a session that has imported nothing', async function({page}) {
  // Nothing is loaded and the import dialog has been dismissed, so there is no
  // layer for a label to go into -- and the tool used to show its toolbar, arm
  // a tool and set a crosshair cursor over a map where clicking did nothing.
  var errors = collectPageErrors(page);
  await loadEmpty(page);
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('label');
  });
  await page.locator('.floating-toolbar.label-toolbar').waitFor();
  var defaultFont = await getDefaultFont(page);

  // entering the mode makes the layer the tool needs, named for what it holds
  var lyr = await getLabelLayer(page);
  expect(lyr).not.toBeNull();
  expect(lyr.shapeCount).toBe(0);

  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await writeLabel(page, 'Reno');

  lyr = await getLabelLayer(page);
  // and the label goes into that layer rather than beside it, and the layer
  // still answers to its name afterwards
  expect(lyr.shapeCount).toBe(1);
  expect(lyr.records).toEqual([{'label-text': 'Reno', 'label-pos': 'c',
    'font-family': defaultFont}]);
  expect(errors).toEqual([]);
});

test("a label layer's menu opens the label tool rather than a style panel",
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await armTool(page, 'anchor');
    await clickMap(page, 0.4, 0.45);
    await writeLabel(page, 'Reno');
    // leave label mode, so that entering it from the menu is what is tested
    await page.evaluate(function() {
      window.mapshaper.undoTest.setInteractionMode('info');
    });
    await page.waitForTimeout(120);
    expect(await getInteractionMode(page)).toBe('info');

    await openLayerMenu(page, 'labels');
    var item = page.locator('.contextmenu-item').filter({hasText: 'style/edit labels'});
    await expect(item).toBeVisible();
    await expect(page.locator('.contextmenu-item')
      .filter({hasText: 'style layer'})).toHaveCount(0);
    await item.click();
    await page.waitForTimeout(150);

    // the label tool, acting on that layer
    expect(await getInteractionMode(page)).toBe('label');
    expect(await page.evaluate(function() {
      return window.mapshaper.undoTest.getState().model.activeLayer;
    })).toBe('labels');
    expect(errors).toEqual([]);
  });

test('right-clicking a label deletes it, through a command', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await writeLabel(page, 'Reno');
  await armTool(page, 'anchor');
  await clickMap(page, 0.6, 0.55);
  await writeLabel(page, 'Tahoe');
  expect((await getLabelLayer(page)).shapeCount).toBe(2);

  await rightClickLabel(page, 0);
  var item = page.locator('.contextmenu-item').filter({hasText: 'delete label'});
  await expect(item).toBeVisible();
  await item.click();
  await page.waitForTimeout(250);

  // the right label went, and the other one is untouched
  var lyr = await getLabelLayer(page);
  expect(lyr.shapeCount).toBe(1);
  expect(lyr.records[0]['label-text']).toBe('Tahoe');

  // a command, so it is in the session history and undoes as one step
  var history = await page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory();
  });
  expect(JSON.stringify(history)).toContain('-filter');
  await page.evaluate(function() { window.mapshaper.undoTest.undo(); });
  await page.waitForTimeout(150);
  expect((await getLabelLayer(page)).shapeCount).toBe(2);
  expect(errors).toEqual([]);
});

test('deleting the label being typed into does not save its text first',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await armTool(page, 'anchor');
    await clickMap(page, 0.4, 0.45);
    await writeLabel(page, 'Reno');

    // open its text and change it, then delete the label instead of leaving it
    await clickLabel(page, 0);
    await clickLabel(page, 0);
    await page.keyboard.type('XY');
    await rightClickLabel(page, 0);
    await page.locator('.contextmenu-item').filter({hasText: 'delete label'})
      .click();
    await page.waitForTimeout(250);

    // the last label of a layer leaves the layer behind, empty
    expect((await getLabelLayer(page)).shapeCount).toBe(0);
    expect(await getCaretCount(page)).toBe(0);
    // one command, not a text save followed by a delete
    var history = await page.evaluate(function() {
      return window.mapshaper.undoTest.getSessionHistory();
    });
    expect(JSON.stringify(history)).not.toContain('XY');
    expect(errors).toEqual([]);
  });

test('a created label is undoable and appears in the session history', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);

  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await writeLabel(page, 'Reno');
  expect(await getLabelLayer(page)).not.toBeNull();

  var history = await page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory();
  });
  expect(JSON.stringify(history)).toContain('-labels coordinates=');

  await page.evaluate(function() { window.mapshaper.undoTest.undo(); });
  expect(await getLabelLayer(page)).toBeNull();
  expect(errors).toEqual([]);
});

test('the path label tool turns several clicks into one multipoint label', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);

  await armTool(page, 'path');
  await clickMap(page, 0.3, 0.4);
  await clickMap(page, 0.45, 0.3);
  await clickMap(page, 0.6, 0.4);
  // nothing is written until the curve is finished
  expect(await getLabelLayer(page)).toBeNull();

  await finishCurve(page);
  // and finishing the curve only opens its text: the knots are held by the
  // editor until there is something to set along them
  expect(await getLabelLayer(page)).toBeNull();
  await writeLabel(page, 'Sierra');

  var lyr = await getLabelLayer(page);
  expect(lyr).not.toBeNull();
  expect(lyr.shapeCount).toBe(1);
  expect(lyr.geometryTypes).toEqual(['MultiPoint']);
  expect(lyr.pointCounts).toEqual([3]);
  expect(errors).toEqual([]);
});

test('an abandoned curve leaves nothing behind', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var before = await getChecksum(page);

  await armTool(page, 'path');
  await clickMap(page, 0.3, 0.4);
  await clickMap(page, 0.45, 0.3);
  // backspace is the way back out: escape finishes the path now
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(120);

  expect(await getLabelLayer(page)).toBeNull();
  expect((await getChecksum(page)).checksum).toBe(before.checksum);
  expect(await page.evaluate(function() {
    return window.mapshaper.undoTest.getState().undo.canUndo;
  })).toBe(false);
  expect(errors).toEqual([]);
});

test('escape finishes the path at the last point and opens its text', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);

  await armTool(page, 'path');
  await clickMap(page, 0.3, 0.4);
  await clickMap(page, 0.45, 0.3);
  await clickMap(page, 0.6, 0.4);
  // the pointer sits past the last knot, and the preview runs out to it -- the
  // path must end at the knot, not wherever the pointer happened to be
  await hoverMap(page, 0.8, 0.2);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // it lands in text editing, the same as any other way of finishing
  expect(await getCaretCount(page)).toBe(1);
  await writeLabel(page, 'Sierra');

  var lyr = await getLabelLayer(page);
  expect(lyr).not.toBeNull();
  expect(lyr.pointCounts).toEqual([3]);
  expect(errors).toEqual([]);
});

test('escape discards a path that has only one point', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var before = await getChecksum(page);

  await armTool(page, 'path');
  await clickMap(page, 0.4, 0.4);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  expect(await getLabelLayer(page)).toBeNull();
  expect((await getChecksum(page)).checksum).toBe(before.checksum);
  expect(errors).toEqual([]);
});

test('a one-knot curve is discarded rather than becoming an anchored label', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);

  await armTool(page, 'path');
  await clickMap(page, 0.4, 0.4);
  await finishCurve(page);

  expect(await getLabelLayer(page)).toBeNull();
  expect(errors).toEqual([]);
});

test('a label left with no glyphs is never created', async function({page}) {
  // A label that draws nothing cannot be seen, clicked or selected, so one left
  // behind is a feature only an export would reveal. Rather than creating it
  // and cleaning it up, the click creates nothing at all and the feature waits
  // for a glyph. Whitespace is not one: three spaces are as invisible as no
  // text at all.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var before = await getChecksum(page);

  await armTool(page, 'anchor');
  await clickMap(page, 0.35, 0.45);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  expect(await getLabelLayer(page)).toBeNull();

  await clickMap(page, 0.5, 0.5);
  await page.keyboard.type('   ');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect(await getLabelLayer(page)).toBeNull();

  await armTool(page, 'path');
  await clickMap(page, 0.3, 0.5);
  await clickMap(page, 0.45, 0.4);
  await clickMap(page, 0.6, 0.5);
  await page.keyboard.press('Enter'); // finishes the path, opens its text
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect(await getLabelLayer(page)).toBeNull();

  // the map is as it was found, and no command ran to make it so
  expect((await getChecksum(page)).checksum).toBe(before.checksum);
  expect(await getSessionHistory(page)).not.toContain('coordinates=');
  expect(errors).toEqual([]);
});

test('placing labels needs no undo history to stay clean', async function({page}) {
  // Undo is a setting, and a rule about what may exist in the data cannot
  // depend on one. With undo off there is no session to unwind, so both halves
  // of the rule have to hold without it: an untyped label is never created, and
  // an existing label emptied of its text is removed by a command.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE, {undo: false});
  expect(await page.evaluate(function() {
    return window.mapshaper.undoTest.appUndoIsEnabled();
  })).toBe(false);

  await armTool(page, 'anchor');
  await clickMap(page, 0.35, 0.45);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  expect(await getLabelLayer(page)).toBeNull();

  await clickMap(page, 0.5, 0.5);
  await writeLabel(page, 'Reno');
  // label-pos is the tool's default for a new label: 'c' centres the text on
  // the anchor, where no position at all would sit it on the anchor's baseline.
  // font-family is the other: every label the tool makes names its font.
  expect((await getLabelLayer(page)).records)
    .toEqual([{'label-text': 'Reno', 'label-pos': 'c',
      'font-family': await getDefaultFont(page)}]);

  await disarmTool(page);
  await clickLabel(page, 0);
  await clickLabel(page, 0);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  expect(await getLabelLayer(page)).toMatchObject({shapeCount: 0});
  expect(errors).toEqual([]);
});

test('an existing label emptied of its text is removed by a command', async function({page}) {
  // There is no session to abandon here: the label may have been created in an
  // earlier session or by the script the file was built by, so the feature is
  // deleted instead -- by a command, so that it works whether or not undo is on.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.3, 0.4);
  await page.keyboard.type('A');
  await clickMap(page, 0.15, 0.85); // finishes label A
  await clickMap(page, 0.55, 0.6);
  await page.keyboard.type('B');
  await clickMap(page, 0.15, 0.85); // finishes label B
  await disarmTool(page);
  await page.waitForTimeout(200);

  await clickLabel(page, 0); // selects A
  await clickLabel(page, 0); // reaches into its text
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // B is all that is left, and it keeps its own geometry rather than inheriting
  // A's -- the record and the point go together
  var lyr = await getLabelLayer(page);
  expect(lyr.records).toEqual([{'label-text': 'B', 'label-pos': 'c',
    'font-family': await getDefaultFont(page)}]);
  expect(await getSessionHistory(page)).toContain('-filter');
  expect(errors).toEqual([]);
});

test('a style set with nothing selected is given to the next label', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var panel = page.locator('.text-style-panel');

  await panel.locator('select').first().selectOption('Georgia');
  await panel.locator('.label-size-row .size-field-up').click();
  await page.waitForTimeout(80);

  // held in GUI state, not written anywhere: there is no label to write it to,
  // and a tool default does not belong in the undo history
  expect(await getNewLabelStyle(page))
    .toEqual({'label-pos': 'c', 'font-family': 'Georgia', 'font-size': 13});
  expect(await getSessionHistory(page)).not.toMatch(/-style|-labels/);

  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await writeLabel(page, 'Reno');

  // -labels coordinates= writes it, so creating a styled label is still one command
  expect(await getSessionHistory(page)).toContain("font-family='Georgia'");
  var lyr = await getLabelLayer(page);
  expect(lyr.records[0]).toMatchObject({'font-family': 'Georgia', 'font-size': '13'});
  expect(errors).toEqual([]);
});

test('a shape is what gives a label a symbol, and the × takes it away', async function({page}) {
  // The size and colour controls are inert until there is a symbol to style:
  // an icon-size or icon-color on a label with no icon draws nothing.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await writeLabel(page, 'Reno');
  await disarmTool(page);
  await clickLabel(page, 0);

  var panel = page.locator('.text-style-panel');
  var starBtn = panel.locator('.label-icon-buttons [data-icon="star"]');
  var iconColor = panel.locator('.label-icon-color-row .label-color-input');
  expect(await iconColor.isDisabled()).toBe(true);

  await starBtn.click();
  await page.waitForTimeout(150);
  expect((await getLabelLayer(page)).records[0]).toMatchObject({
    icon: 'star',
    'icon-opacity': 1
  });
  await setFieldValue(iconColor, '#cc0000');
  expect((await getLabelLayer(page)).records[0]).toMatchObject({
    icon: 'star',
    'icon-fill': '#cc0000'
  });

  // the × takes the symbol off the record, with everything it was drawn
  // with, rather than leaving an empty name where one was
  await panel.locator('.label-icon-section .label-section-remove').click();
  await page.waitForTimeout(150);
  var rec = (await getLabelLayer(page)).records[0];
  expect(rec.icon).toBeUndefined();
  expect(rec['icon-fill']).toBeUndefined();
  expect(rec['icon-size']).toBeUndefined();
  expect(errors).toEqual([]);
});

test('an aligned label keeps its place while its lines re-justify', async function({page}) {
  // text-anchor justifies the lines AND decides where the block of them sits,
  // so left-aligning a label centred on its anchor used to slide it half its
  // own width to the right. label-align asks only the first question, and the
  // measured width of the text is what pays for the second.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);

  await armTool(page, 'anchor');
  await clickMap(page, 0.5, 0.45);
  await page.keyboard.type('North');
  await page.keyboard.press('Shift+Enter');
  await writeLabel(page, 'Dakota');
  await disarmTool(page);
  await clickLabel(page, 0);
  await turnIconOn(page);
  await setLabelPosition(page, 'n');
  await page.waitForTimeout(150);
  var before = await getLabelBox(page, 0);

  await page.locator('.text-style-panel .label-align-buttons [data-align="left"]').click();
  await page.waitForTimeout(200);
  var rec = (await getLabelLayer(page)).records[0];
  var after = await getLabelBox(page, 0);

  expect(rec['label-align']).toBe('left');
  // the lines are left-aligned now, so the box is no wider than it was...
  expect(Math.abs(after.width - before.width)).toBeLessThan(1);
  // ...and it did not move: half a width to the right is what this is about,
  // and the label is some tens of pixels wide
  expect(Math.abs(after.x - before.x)).toBeLessThan(1);
  expect(errors).toEqual([]);
});

test('measurements stay out of the data', async function({page}) {
  // A text measurement is derived from the text and the font, so it lives in a
  // cache keyed by those (svg-label-metrics.mjs) and never in the user's
  // table: a label edited in the panel carries the properties the user set and
  // nothing the app needed along the way.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);

  await armTool(page, 'anchor');
  await clickMap(page, 0.5, 0.45);
  await page.keyboard.type('North');
  await page.keyboard.press('Shift+Enter');
  await writeLabel(page, 'Dakota');
  await disarmTool(page);
  await clickLabel(page, 0);
  await page.locator('.text-style-panel .label-align-buttons [data-align="center"]').click();
  await page.waitForTimeout(150);
  await setFieldValue(page.locator('.text-style-panel .label-size-row input'), '18');
  await page.waitForTimeout(250);

  // label-pos and font-family are there because the tool centres every label
  // it creates and names the font it draws it in, not because anything here
  // set them
  var layer = await getLabelLayer(page);
  var fields = ['font-family', 'font-size', 'label-align', 'label-pos', 'label-text'];
  expect(layer.fields.sort()).toEqual(fields);
  expect(Object.keys(layer.records[0]).sort()).toEqual(fields);

  // and the command history is the edits themselves, with no measurement
  // commands chained onto them
  expect(await getSessionHistory(page)).not.toMatch(/label-text-width|label-text-hash/);
  expect(errors).toEqual([]);
});

test('styling a selected label restyles it rather than the whole layer', async function({page}) {
  // Selecting is what points the panel at one label. With nothing selected it
  // holds a default for the next label instead of restyling every label on the
  // layer, which is not what a click on a font control means while labels are
  // being placed.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var defaultFont = await getDefaultFont(page);
  await armTool(page, 'anchor');
  await clickMap(page, 0.35, 0.4);
  await page.keyboard.type('A');
  await clickMap(page, 0.6, 0.7); // finishes label A, and nothing more
  await clickMap(page, 0.65, 0.6); // places label B
  await page.keyboard.type('B');
  await clickMap(page, 0.15, 0.85); // finishes label B
  await disarmTool(page); // so a click makes nothing
  await page.waitForTimeout(200);

  await clickLabel(page, 0); // selects label A, and only A
  var panel = page.locator('.text-style-panel');
  await panel.locator('select').first().selectOption('Georgia');
  await page.waitForTimeout(200);

  var records = (await getLabelLayer(page)).records;
  expect(records.length).toBe(2);
  expect(records[0]['font-family']).toBe('Georgia');
  // B keeps the font it was created in rather than following A
  expect(records[1]['font-family']).toBe(defaultFont);
  expect(errors).toEqual([]);
});

test('the next label is made in the style of the label last selected', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var defaultFont = await getDefaultFont(page);
  await armTool(page, 'anchor');
  await clickMap(page, 0.35, 0.4);
  await page.keyboard.type('A');
  await clickMap(page, 0.6, 0.7); // finishes label A
  await clickMap(page, 0.65, 0.6);
  await page.keyboard.type('B');
  await clickMap(page, 0.15, 0.85); // finishes label B
  await disarmTool(page);
  await page.waitForTimeout(200);

  await clickLabel(page, 0);
  await page.locator('.text-style-panel select').first().selectOption('Georgia');
  await page.waitForTimeout(200);
  expect((await getNewLabelStyle(page))['font-family']).toBe('Georgia');

  // selecting B, which is in the default font, is what the next label follows
  await clickLabel(page, 1);
  expect((await getNewLabelStyle(page))['font-family']).toBe(defaultFont);

  // and selecting A again matches A
  await clickLabel(page, 0);
  expect((await getNewLabelStyle(page))['font-family']).toBe('Georgia');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await armTool(page, 'anchor');
  await clickMap(page, 0.3, 0.65);
  await writeLabel(page, 'C');
  var records = (await getLabelLayer(page)).records;
  expect(records.length).toBe(3);
  expect(records[2]['font-family']).toBe('Georgia');
  expect(records[2]['label-pos']).toBe('c');
  expect(errors).toEqual([]);
});

test('a new label names the font it is drawn in', async function({page}) {
  // "Default font" named nothing: an unfonted label is drawn in whatever this
  // browser resolves sans-serif to, which is a different face on the next
  // machine and is not a family Node can find metrics for. The menu shows the
  // font by name and the label is created carrying it.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var panel = page.locator('.text-style-panel');
  var fontSelect = panel.locator('select').first();

  expect(await fontSelect.locator('option').allTextContents())
    .not.toContain('Default font');
  var shown = await fontSelect.inputValue();
  expect(shown).not.toBe(''); // the detector found which font that is

  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await writeLabel(page, 'Reno');

  // the label is created in the font the menu was showing, so what the panel
  // said before there was a label is what the label turns out to be
  expect((await getLabelLayer(page)).records[0]['font-family']).toBe(shown);
  expect(errors).toEqual([]);
});

test('a label that arrived without a font is given one when it is styled', async function({page}) {
  // Labels made by the CLI carry no font-family, and the panel cannot show
  // one without saying which. Choosing a face is the point at which the font
  // it is a face of stops being a guess about the machine it is opened on.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand(
      '-add-label coordinates=2,3 text=Reno no-replace name=labels');
  });
  await disarmTool(page);
  await page.waitForTimeout(200);
  await clickLabel(page, 0);

  var panel = page.locator('.text-style-panel');
  var shown = await panel.locator('select').first().inputValue();
  expect(shown).not.toBe('');
  expect((await getLabelLayer(page)).records[0]['font-family']).toBeUndefined();

  await panel.locator('.label-font-style-row select').selectOption('normal|700');
  await page.waitForTimeout(150);
  expect((await getLabelLayer(page)).records[0])
    .toMatchObject({'font-family': shown, 'font-weight': '700'});
  expect(errors).toEqual([]);
});

test('a face carries across a change of font, and Regular is stored as none', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.35, 0.4);
  await page.keyboard.type('A');
  await clickMap(page, 0.15, 0.85);
  await disarmTool(page);
  await page.waitForTimeout(150);
  await clickLabel(page, 0);

  var panel = page.locator('.text-style-panel');
  var fontSelect = panel.locator('select').first();
  var styleSelect = panel.locator('.label-font-style-row select');
  await fontSelect.selectOption('Georgia');
  await styleSelect.selectOption('italic|700');
  await page.waitForTimeout(150);
  expect((await getLabelLayer(page)).records[0])
    .toMatchObject({'font-style': 'italic', 'font-weight': '700'});

  // the label was in Bold Italic before the font changed and is in Bold Italic
  // after it: the face is the user's choice, not a property of the old font
  await fontSelect.selectOption('Verdana');
  await page.waitForTimeout(150);
  expect((await getLabelLayer(page)).records[0])
    .toMatchObject({'font-family': 'Verdana', 'font-style': 'italic', 'font-weight': '700'});
  expect(await styleSelect.inputValue()).toBe('italic|700');

  // and going back to Regular takes the face off the record rather than
  // writing the values a label with no face renders in anyway
  await styleSelect.selectOption('normal|400');
  await page.waitForTimeout(150);
  var rec = (await getLabelLayer(page)).records[0];
  expect(rec['font-family']).toBe('Verdana');
  expect(rec['font-style']).toBeUndefined();
  expect(rec['font-weight']).toBeUndefined();
  expect(errors).toEqual([]);
});

test('double-clicking empty map finishes the curve at that point', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'path');

  await clickMap(page, 0.3, 0.4);
  await clickMap(page, 0.45, 0.3);
  await dblclickMap(page, 0.6, 0.4);
  await writeLabel(page, 'Sierra');

  var lyr = await getLabelLayer(page);
  expect(lyr).not.toBeNull();
  expect(lyr.pointCounts).toEqual([3]);
  expect(errors).toEqual([]);
});

test('a selected curve shows a handle on each knot, and dragging one moves it',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);

    await armTool(page, 'path');
    await clickMap(page, 0.3, 0.4);
    await clickMap(page, 0.45, 0.3);
    await clickMap(page, 0.6, 0.4);
    await finishCurve(page);
    // finishing opens the label's text. It needs some, because a label left
    // empty is undone when its session closes. Leaving the session deselects a
    // label the tool just made, so it has to be clicked to get its handles.
    await page.keyboard.type('Ridge');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    await disarmTool(page);
    await clickLabel(page, 0);

    var handles = await getKnotHandles(page);
    expect(handles.length).toBe(3);

    var before = (await getLabelLayer(page)).shapes[0];
    await dragBy(page, handles[1], 0, -40);
    var after = (await getLabelLayer(page)).shapes[0];

    // the dragged knot moved, and only it
    expect(after[1]).not.toEqual(before[1]);
    expect(after[0]).toEqual(before[0]);
    expect(after[2]).toEqual(before[2]);
    expect(after.length).toBe(3);
    expect(JSON.stringify(await getSessionHistory(page))).toContain('-update-label');
    expect(errors).toEqual([]);
  });

// In Fixed mode the text is fixed to its anchor, so dragging the glyphs is
// dragging the label: the anchor moves and the text goes with it. It runs
// through the same machinery as a knot drag, because the anchor is one knot;
// it is here because the grab is measured from the pointer's hover position,
// and getting that from the dragstart position instead left the label
// trailing the first move's distance behind the pointer.
test('an anchored label is moved by dragging its text', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);

  // the anchor tool is armed on entry to a layer with no labels
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  await disarmTool(page);
  await clickLabel(page, 0);

  var before = (await getLabelLayer(page)).shapes[0];
  await dragBy(page, await getGlyphPoint(page, 0, 0.5), 70, 45);
  var lyr = await getLabelLayer(page);

  expect(lyr.shapes[0]).not.toEqual(before);
  expect(lyr.shapes[0].length).toBe(1);
  // the label moved, rather than its text moving away from it
  expect(lyr.records[0].dx).toBeUndefined();
  expect(lyr.records[0]['label-pos']).toBe('c');
  expect(JSON.stringify(await getSessionHistory(page))).toContain('-update-label');
  expect(errors).toEqual([]);
});

test('in Draggable mode the same drag offsets the text from its anchor',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);

    await clickMap(page, 0.4, 0.45);
    await writeLabel(page, 'Reno');
    await disarmTool(page);
    await clickLabel(page, 0);
    await setDragMode(page, 'draggable');
    var before = (await getLabelLayer(page)).shapes[0];

    await dragBy(page, await getGlyphPoint(page, 0, 0.5), -60, -40);

    var rec = (await getLabelLayer(page)).records[0];
    // the anchor stayed where it was and the text came off it
    expect((await getLabelLayer(page)).shapes[0]).toEqual(before);
    expect(rec.dx).toBeLessThan(0);
    expect(rec.dy).toBeLessThan(0);
    // all three properties, not a delta, and the position it replaces is gone
    expect(rec['text-anchor']).toBe('end');
    expect(rec['label-pos']).toBeUndefined();

    // one -style, so one undo step and one line of session history
    expect(await getSessionHistory(page)).toMatch(/-labels dx=/);
    await page.evaluate(function() { window.mapshaper.undoTest.undo(); });
    await page.waitForTimeout(200);
    expect((await getLabelLayer(page)).records[0].dx).toBeFalsy();
    expect(errors).toEqual([]);
  });

test('the justification follows the text across its anchor', async function({page}) {
  // Text dragged to the left of its anchor is right-justified, so that a
  // longer name or a bigger font extends it away from the point it labels
  // rather than back across it -- which is also what keeps a label off its
  // symbol when the export font is not the browser's.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);

  await clickMap(page, 0.45, 0.45);
  await writeLabel(page, 'Winnemucca');
  await disarmTool(page);
  await clickLabel(page, 0);
  await setDragMode(page, 'draggable');

  await dragBy(page, await getGlyphPoint(page, 0, 0.5), 80, 0);
  expect((await getLabelLayer(page)).records[0]['text-anchor']).toBe('start');
  var box = await getLabelBox(page, 0);

  // dragged back across the anchor, and the text is where the pointer left it
  // rather than half its own width away: changing the anchor moves the block,
  // so dx is re-expressed against the new one in the same command
  //
  // The pointer goes away and comes back first. What a drag takes hold of is
  // found on hover, and the command's redraw left the pointer sitting on the
  // label it had just moved without a mousemove to re-test it.
  await hoverNothing(page);
  await dragBy(page, await getGlyphPoint(page, 0, 0.5), -160, 0);
  expect((await getLabelLayer(page)).records[0]['text-anchor']).toBe('end');
  var after = await getLabelBox(page, 0);
  expect(Math.abs(after.x - (box.x - 160))).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('a symbol arriving under a centred label moves it out from under it',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);

    await clickMap(page, 0.4, 0.45);
    await writeLabel(page, 'Reno');
    await disarmTool(page);
    await clickLabel(page, 0);

    // the whole grid is live with nothing at the anchor: a labels layer whose
    // dots live in another layer still has text to place around them
    await setLabelPosition(page, 'sw');
    expect((await getLabelLayer(page)).records[0]['label-pos']).toBe('sw');

    await setLabelPosition(page, 'c');
    expect((await getLabelLayer(page)).records[0]['label-pos']).toBe('c');

    // a symbol answers the question, and the label moves out from under it
    await turnIconOn(page);
    expect((await getLabelLayer(page)).records[0]['label-pos']).toBe('ne');

    // the icon and the position move together, in one command and so in one
    // undo step
    expect(await getSessionHistory(page)).toMatch(/-labels icon=.*label-pos='ne'/);
    await page.evaluate(function() { window.mapshaper.undoTest.undo(); });
    await page.waitForTimeout(200);
    var rec = (await getLabelLayer(page)).records[0];
    expect(rec.icon).toBeFalsy();
    expect(rec['label-pos']).toBe('c');
    expect(errors).toEqual([]);
  });

test('a knot drag is one undo step', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);

  await armTool(page, 'path');
  await clickMap(page, 0.3, 0.4);
  await clickMap(page, 0.45, 0.3);
  await clickMap(page, 0.6, 0.4);
  await finishCurve(page);
  await page.keyboard.type('Ridge');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  await disarmTool(page);
  await clickLabel(page, 0);

  var before = (await getLabelLayer(page)).shapes[0];
  var handles = await getKnotHandles(page);
  await dragBy(page, handles[1], 0, -40);
  expect((await getLabelLayer(page)).shapes[0][1]).not.toEqual(before[1]);

  await page.evaluate(function() { window.mapshaper.undoTest.undo(); });
  await page.waitForTimeout(120);
  expect((await getLabelLayer(page)).shapes[0]).toEqual(before);
  expect(errors).toEqual([]);
});

test('dragging a selected path label slides its text along its curve',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await drawPathLabel(page, [[0.15, 0.6], [0.45, 0.55], [0.75, 0.6]], 'SIERRA');
    await disarmTool(page);
    await clickGlyph(page, 0, 0.5);
    var view = await getViewBounds(page);
    var knots = (await getLabelLayer(page)).shapes[0];

    await dragBy(page, await getGlyphPoint(page, 0, 0.5), 70, 0);

    // the offset is a percentage of the curve, so that editing the curve or
    // the font afterwards cannot push the text off the end
    var lyr = await getLabelLayer(page);
    expect(lyr.records[0]['label-start-offset']).toMatch(/^\d+(\.\d+)?%$/);
    expect(parseFloat(lyr.records[0]['label-start-offset'])).toBeGreaterThan(50);
    // the text moved and nothing else did: the curve is where it was, and the
    // drag did not pan the map out from under it
    expect(lyr.shapes[0]).toEqual(knots);
    expect(await getViewBounds(page)).toEqual(view);

    // one command, and so one undo step and one line of history
    expect(await getSessionHistory(page)).toContain('label-start-offset');
    await page.evaluate(function() { window.mapshaper.undoTest.undo(); });
    await page.waitForTimeout(150);
    expect((await getLabelLayer(page)).records[0]['label-start-offset'])
      .toBeUndefined();
    expect(errors).toEqual([]);
  });

test('dragging a path label across its curve flips it', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await drawPathLabel(page, [[0.15, 0.6], [0.45, 0.55], [0.75, 0.6]], 'SIERRA');
  await disarmTool(page);
  await clickGlyph(page, 0, 0.5);
  var before = (await getLabelLayer(page)).shapes[0];

  // across the curve rather than along it: the side the pointer is on is the
  // side the text goes
  await dragBy(page, await getGlyphPoint(page, 0, 0.5), 0, 60);

  // flipped by reversing the knots, because textPath's own side attribute is
  // not usable in a browser
  var after = (await getLabelLayer(page)).shapes[0];
  expect(after).toEqual(before.concat().reverse());
  // and no label-side written to go with it
  expect((await getLabelLayer(page)).records[0]['label-side']).toBeUndefined();

  // one undo step covers the whole flip, knots and placement together
  await page.evaluate(function() { window.mapshaper.undoTest.undo(); });
  await page.waitForTimeout(150);
  expect((await getLabelLayer(page)).shapes[0]).toEqual(before);
  expect(errors).toEqual([]);
});

test('the context menu flips a path label and carries its placement',
  async function({page}) {
    // The drag is undiscoverable on its own -- nothing on screen suggests that
    // text can be dragged across its own curve -- so the menu offers it too.
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await drawPathLabel(page, [[0.15, 0.6], [0.45, 0.55], [0.75, 0.6]], 'SIERRA');
    await disarmTool(page);
    await page.evaluate(function() {
      return window.mapshaper.undoTest.runCommand(
        '-style text-anchor=start label-start-offset=20% ids=0 target=labels');
    });
    await page.waitForTimeout(250);
    var before = (await getLabelLayer(page)).shapes[0];

    await rightClickGlyph(page, 0, 0.5);
    await page.locator('.contextmenu-item')
      .filter({hasText: 'flip to other side of path'}).click();
    await page.waitForTimeout(250);

    var lyr = await getLabelLayer(page);
    expect(lyr.shapes[0]).toEqual(before.concat().reverse());
    // the placement goes round with the path, or the text jumps to the far end
    // of the curve as it flips
    expect(lyr.records[0]['label-start-offset']).toBe('80%');
    expect(lyr.records[0]['text-anchor']).toBe('end');
    expect(errors).toEqual([]);
  });

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}

async function loadFixture(page, fixture, opts) {
  var undo = opts && opts.undo === false ? 'off' : 'on';
  await page.goto('/?undo=' + undo + '&undo-test=on&files=' +
    encodeURIComponent(fixture));
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest;
  });
  await page.waitForFunction(function() {
    return window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
  await closeSidebarAfterImport(page);
  await page.evaluate(function() {
    window.mapshaper.undoTest.clearUndoHistory();
    window.mapshaper.undoTest.setInteractionMode('label');
  });
  await page.locator('.floating-toolbar.label-toolbar').waitFor();
  await openAllSections(page);
}

// The app as it stands before anything is imported: the "Import files" dialog
// dismissed, no layer, no interaction mode.
async function loadEmpty(page) {
  await page.goto('/?undo=on&undo-test=on');
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest;
  });
  await page.locator('#import-options .cancel-btn').click();
  await page.waitForTimeout(150);
}

// Arms a creation tool by clicking its toolbar button, the way a user would.
// Clicks the middle of a label's rendered text.
async function clickLabel(page, id) {
  var box = await page.evaluate(function(args) {
    var node = document.querySelector(
      '.mapshaper-symbol-layer .mapshaper-svg-symbol[data-id="' + args.id + '"]');
    var r = node.getBoundingClientRect();
    return {x: r.x, y: r.y, width: r.width, height: r.height};
  }, {id: id});
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(120);
}

// Where a label's text is on screen, which is the thing an alignment change
// must not move. The text node's own box, not the symbol group's: an icon
// beside it would hide the shift this is watching for.
async function getLabelBox(page, id) {
  return page.evaluate(function(args) {
    var symbol = document.querySelector(
      '.mapshaper-symbol-layer .mapshaper-svg-symbol[data-id="' + args.id + '"]');
    var node = symbol && (symbol.tagName == 'text' ? symbol : symbol.querySelector('text'));
    var r = node.getBoundingClientRect();
    return {x: r.x, y: r.y, width: r.width, height: r.height};
  }, {id: id});
}

async function setLabelPosition(page, pos) {
  await page.locator('.text-style-panel .label-position-grid [data-position="' + pos + '"]').click();
  await page.waitForTimeout(150);
}

async function setDragMode(page, mode) {
  await page.locator('.text-style-panel .label-drag-mode-buttons [data-drag-mode="' +
    mode + '"]').click();
  await page.waitForTimeout(150);
}

async function turnIconOn(page) {
  await page.locator('.text-style-panel .label-icon-buttons [data-icon="circle"]').click();
  await page.waitForTimeout(250);
}

async function getCaretCount(page) {
  return page.evaluate(function() {
    return document.querySelectorAll('.label-edit-caret').length;
  });
}

// Arms a creation tool, leaving it armed whether or not it already was. The
// tool arms itself on a layer with no labels, so a helper that just clicked the
// button would disarm it there.
async function armTool(page, kind) {
  var i = {anchor: 0, block: 1, path: 2}[kind];
  var btn = page.locator('.floating-toolbar.label-toolbar .floating-toolbar-content > .floating-toolbar-btn').nth(i);
  if (!(await btn.evaluate(function(el) {
    return el.classList.contains('selected');
  }))) {
    await btn.click();
    await page.waitForTimeout(60);
  }
}

// Disarms whichever creation tool is armed, so that a click on the map does
// not place a label.
async function disarmTool(page) {
  var btns = page.locator('.floating-toolbar.label-toolbar .floating-toolbar-content > .floating-toolbar-btn');
  for (var i = 0; i < 3; i++) {
    if (await btns.nth(i).evaluate(function(el) {
      return el.classList.contains('selected');
    })) {
      await btns.nth(i).click();
      await page.waitForTimeout(60);
    }
  }
}

// Clicks the map at a fraction of its width and height, so the test does not
// depend on the viewport size.
async function clickMap(page, fx, fy) {
  var box = await page.locator('.mshp-main-map').boundingBox();
  var x = box.x + box.width * fx;
  var y = box.y + box.height * fy;
  await refuseToClickThroughThePanel(page, x, y);
  await page.mouse.click(x, y);
  await page.waitForTimeout(60); // let the click be processed and drawn
}

// The style panel is pinned over the top right of the map, so a point meant as
// empty map can land on a control instead -- which fails slowly and strangely:
// the click that was meant to finish a label saves a style preset, and the
// prompt it opens then swallows everything the test does next.
async function refuseToClickThroughThePanel(page, x, y) {
  var box = await page.locator('.text-style-panel').boundingBox();
  if (!box || x < box.x || y < box.y || x > box.x + box.width || y > box.y + box.height) return;
  throw new Error('clickMap(' + x + ', ' + y + ') lands on the style panel, ' +
    'not the map: pick a point to the left of it.');
}

async function dblclickMap(page, fx, fy) {
  var box = await page.locator('.mshp-main-map').boundingBox();
  await page.mouse.dblclick(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(120);
}

async function finishCurve(page) {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
}

// Types @text into the label being edited and ends the session, which is what
// creates the label: a label is not written until it has a glyph in it, so a
// test that wants a feature has to give it something to say.
async function writeLabel(page, text) {
  await page.keyboard.type(text || 'Label');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
}

async function setFieldValue(locator, value) {
  await locator.fill(value);
  await locator.press('Enter');
  await locator.page().waitForTimeout(200);
}

// Right-clicks the middle of a label's rendered text. Moves the pointer onto
// it first: the context menu reads the hit state the pointer left behind
// rather than testing afresh where the click landed.
async function rightClickLabel(page, id) {
  var box = await page.evaluate(function(args) {
    var node = document.querySelector(
      '.mapshaper-symbol-layer .mapshaper-svg-symbol[data-id="' + args.id + '"]');
    var r = node.getBoundingClientRect();
    return {x: r.x, y: r.y, width: r.width, height: r.height};
  }, {id: id});
  var x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.waitForTimeout(80);
  await page.mouse.click(x, y, {button: 'right'});
  await page.waitForTimeout(150);
}

// Opens a layer's own menu from the layer list, the way a user does.
async function openLayerMenu(page, layerName) {
  await openLayersPanel(page);
  var item = page.locator('.layer-list .layer-item')
    .filter({hasText: layerName}).first();
  await item.hover();
  await item.locator('.more-btn').click();
  await page.locator('.contextmenu-item').first().waitFor();
}

async function getViewBounds(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getViewBounds();
  });
}

async function getChecksum(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getModelChecksum();
  });
}

// Which tool has the map. Asked instead of looking for the toolbar or the
// panel, which are how a mode shows rather than what it is.
async function getInteractionMode(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getInteractionMode();
  });
}

// Summary of the layer the tool created, or null if it did not create one.
async function getLabelLayer(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getLayerInfo('labels');
  });
}

// The font the tool names a new label in: whatever this browser resolves
// sans-serif to, which is Helvetica on a Mac and Arial on Windows. Read from
// the panel rather than written into the test, and read with nothing selected,
// where the menu shows the default rather than a label's own font.
async function getDefaultFont(page) {
  return page.locator('.text-style-panel select').first().inputValue();
}

// Hover helpers. Hover highlighting is drawn to canvas, so they assert on the
// feature the hit control resolved rather than on anything in the DOM. Each one
// moves the pointer away first, so that a stale hit cannot pass for a fresh one.

async function hoverPoint(page, x, y) {
  var box = await page.locator('.mshp-main-map').boundingBox();
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.waitForTimeout(70);
  await page.mouse.move(x, y);
  await page.waitForTimeout(130);
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getHitId();
  });
}

async function hoverMap(page, fx, fy) {
  var box = await page.locator('.mshp-main-map').boundingBox();
  return hoverPoint(page, box.x + box.width * fx, box.y + box.height * fy);
}

async function hoverNothing(page) {
  return hoverMap(page, 0.92, 0.08);
}

async function getNewLabelStyle(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getNewLabelStyle();
  });
}

async function getSessionHistory(page) {
  return JSON.stringify(await page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory();
  }));
}

// Viewport positions of the knot handles drawn on a selected curve.
async function getKnotHandles(page) {
  return page.evaluate(function() {
    return Array.prototype.map.call(
      document.querySelectorAll('.label-cue-selected .label-cue-knot'),
      function(node) {
        var r = node.getBoundingClientRect();
        return {x: r.x + r.width / 2, y: r.y + r.height / 2};
      });
  });
}

// Places a path label and types its text. knots: [[fx, fy], ...] as fractions
// of the map, the way clickMap() takes them.
async function drawPathLabel(page, knots, text) {
  await armTool(page, 'path');
  for (var i = 0; i < knots.length; i++) {
    await clickMap(page, knots[i][0], knots[i][1]);
  }
  await finishCurve(page);
  await writeLabel(page, text);
}

// A point on a label's glyphs, in screen coordinates. The middle of a curved
// label's bounding box is usually off the text altogether, and only the glyphs
// are a hit target, so pointing at one of them is how a path label is reached.
async function getGlyphPoint(page, id, frac) {
  return page.evaluate(function(args) {
    var node = document.querySelector(
      '.mapshaper-svg-symbol[data-id="' + args.id + '"]');
    // a label with a symbol is a group, so the text is a child of it
    var content = node.querySelector('textPath') ||
      (node.tagName == 'text' ? node : node.querySelector('text'));
    var n = content.getNumberOfChars();
    var box = content.getExtentOfChar(Math.min(Math.floor(n * args.frac), n - 1));
    var pt = node.ownerSVGElement.createSVGPoint();
    pt.x = box.x + box.width / 2;
    pt.y = box.y + box.height / 2;
    pt = pt.matrixTransform(node.getScreenCTM());
    return {x: pt.x, y: pt.y};
  }, {id: id, frac: frac});
}

async function clickGlyph(page, id, frac) {
  var p = await getGlyphPoint(page, id, frac);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(150);
}

// Moves the pointer onto the glyph first: the context menu reads the hit state
// the pointer left behind rather than testing where the click landed.
async function rightClickGlyph(page, id, frac) {
  var p = await getGlyphPoint(page, id, frac);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(100);
  await page.mouse.click(p.x, p.y, {button: 'right'});
  await page.waitForTimeout(150);
}

async function dragBy(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  // a moment on the spot, because what a drag takes hold of is found on hover
  await page.waitForTimeout(80);
  await page.mouse.down();
  // several steps, so the drag registers as a drag rather than a click
  await page.mouse.move(from.x + dx, from.y + dy, {steps: 8});
  await page.mouse.up();
  await page.waitForTimeout(150);
}
