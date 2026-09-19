import { expect, test } from '@playwright/test';

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

test('the first label in an empty project leaves the view alone', async function({page}) {
  // Committing the label used to reset the view to the label's own extent: it
  // was centered and the map zoomed to a box a few metres across, too far in
  // for a basemap to draw. The label layer's bounds are all there is to zoom
  // to in a project with nothing else in it, and the bounds being compared
  // against were the placeholder given to a project with no content, so the
  // map read the change as one big enough to warrant a reset.
  var errors = collectPageErrors(page);
  await loadEmpty(page);
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('label');
  });
  await page.locator('.floating-toolbar.label-toolbar').waitFor();
  // navigate first, so the view under test is one the user chose
  await page.evaluate(function() { window.mapshaper.undoTest.zoomByPct(4); });
  await page.waitForTimeout(150);
  var before = await getViewBounds(page);

  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await writeLabel(page, 'Reno');
  expect((await getLabelLayer(page)).shapeCount).toBe(1);

  // to 6 decimal places, which is a tenth of a metre in these degrees: the
  // view is rescaled around the layer's new bounds and back, and that round
  // trip leaves noise in the last few bits
  var after = await getViewBounds(page);
  after.forEach(function(coord, i) {
    expect(coord).toBeCloseTo(before[i], 6);
  });

  // and the second label, which is compared against the first label's bounds
  // rather than the placeholder, leaves it alone as well
  await armTool(page, 'anchor');
  await clickMap(page, 0.6, 0.55);
  await writeLabel(page, 'Tahoe');
  expect((await getLabelLayer(page)).shapeCount).toBe(2);
  (await getViewBounds(page)).forEach(function(coord, i) {
    expect(coord).toBeCloseTo(before[i], 6);
  });
  expect(errors).toEqual([]);
});

test('a label layer is offered the label tool and not the tools it replaces',
  async function({page}) {
    // 'style labels', 'add/drag points' and 'position labels' each did less
    // than the label tool beside them in the menu, which styles labels,
    // positions them against their anchors, and creates, moves and retypes
    // them as well.
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await armTool(page, 'anchor');
    await clickMap(page, 0.4, 0.45);
    await writeLabel(page, 'Reno');
    expect(await getLabelLayer(page)).not.toBeNull();
    // the label tool has a panel of its own, and hovering the arrow button
    // deliberately does not open the menu over it, so leave the mode first
    await page.evaluate(function() {
      window.mapshaper.undoTest.setInteractionMode('off');
    });
    await page.waitForTimeout(120);

    var modes = await getModeMenuItems(page);
    expect(modes).toContain('add/edit labels');
    expect(modes).not.toContain('style labels');
    expect(modes).not.toContain('add/drag points');
    expect(modes).not.toContain('position labels');
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
    var item = page.locator('.contextmenu-item').filter({hasText: 'edit labels'});
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
  expect(JSON.stringify(history)).toContain('-add-label');

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
  expect(await getSessionHistory(page)).not.toContain('-add-label');
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

test('the creation toggles are mutually exclusive', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var buttons = page.locator('.floating-toolbar.label-toolbar .floating-toolbar-btn');

  await expect(buttons).toHaveCount(2);
  // the fixture carries no labels, so the tool arms itself to place one
  await expect(buttons.nth(0)).toHaveClass(/selected/);
  await expect(buttons.nth(1)).not.toHaveClass(/selected/);

  await buttons.nth(1).click();
  await expect(buttons.nth(0)).not.toHaveClass(/selected/);
  await expect(buttons.nth(1)).toHaveClass(/selected/);

  // clicking the armed tool again disarms it
  await buttons.nth(1).click();
  await expect(buttons.nth(1)).not.toHaveClass(/selected/);
  await expect(buttons.nth(0)).not.toHaveClass(/selected/);
  expect(errors).toEqual([]);
});

test('the tool starts idle on a layer that already has labels', async function({page}) {
  // Arming there would make the first click place a label beside the one the
  // user meant to click.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var buttons = page.locator('.floating-toolbar.label-toolbar .floating-toolbar-btn');
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno');
  await disarmTool(page);
  await clickMap(page, 0.15, 0.85); // finishes the label

  // leave the mode and come back, now that the layer has a label on it
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('info');
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('label');
  });
  await page.waitForTimeout(200);
  await expect(buttons.nth(0)).not.toHaveClass(/selected/);
  await expect(buttons.nth(1)).not.toHaveClass(/selected/);
  expect(errors).toEqual([]);
});

test('a path label is hovered by its text, not by its knots', async function({page}) {
  // A curve's knots are construction points that sit off the glyphs, so
  // proximity to one reads as a hit on empty map. The glyphs were unhoverable
  // because the SVG hit test did not recognize <textPath>, leaving the knots as
  // the only way to reach the label -- exactly backwards.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'path');
  var knots = [[0.25, 0.55], [0.4, 0.4], [0.55, 0.4], [0.7, 0.55]];
  for (var i = 0; i < knots.length; i++) {
    await clickMap(page, knots[i][0], knots[i][1]);
  }
  await finishCurve(page);
  await page.keyboard.type('MOUNTAIN RANGE');
  await hoverNothing(page); // ends the session without placing another label
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('info');
  });

  expect(await hoverGlyph(page, 0, 0.5)).toBe(0);
  expect(await hoverGlyph(page, 0, 0.9)).toBe(0);
  for (i = 0; i < knots.length; i++) {
    expect(await hoverMap(page, knots[i][0], knots[i][1]),
      'knot ' + i + ' is not a hit target').toBe(-1);
  }
  expect(errors).toEqual([]);
});

test('an anchored label is still hovered by its text and by its anchor', async function({page}) {
  // the knot rule must not reach anchored labels, whose one point is where the
  // user put the label rather than a construction point
  await loadFixture(page, FIXTURE);
  await page.evaluate(function() {
    // label-pos moves the text clear of the anchor, so the two are separate
    // places to point at
    return window.mapshaper.undoTest.runCommand(
      "-add-label coordinates=5,3 text='Reno' label-pos=se no-replace name=labels");
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('info');
  });

  expect(await hoverGlyph(page, 0, 0.5)).toBe(0);
  expect(await hoverAnchor(page, 0)).toBe(0);
});

test('a path label with no text is still reachable by its knots', async function({page}) {
  // it draws nothing to hover, so the knots are the only way in; the label tool
  // cannot leave one behind, but the CLI can
  await loadFixture(page, FIXTURE);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand(
      '-add-label coordinates=2,2,4,4,6,2 no-replace name=labels');
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('info');
  });

  expect(await hoverAnchor(page, 0)).toBe(0);
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
  expect(await getSessionHistory(page)).not.toContain('-style');

  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await writeLabel(page, 'Reno');

  // -add-label writes it, so creating a styled label is still one command
  expect(await getSessionHistory(page)).toContain("font-family='Georgia'");
  var lyr = await getLabelLayer(page);
  expect(lyr.records[0]).toMatchObject({'font-family': 'Georgia', 'font-size': '13'});
  expect(errors).toEqual([]);
});

test('a size can be typed, stepped and nudged from the keyboard', async function({page}) {
  // The size controls were display-only spans with a −/+ pair, so the only
  // route from 12 to 24 was twelve clicks.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var input = page.locator('.text-style-panel .label-size-row .size-field-input');

  await input.fill('24');
  await input.press('Enter');
  expect(await getNewLabelStyle(page)).toMatchObject({'font-size': 24});

  // Enter commits the field and goes no further: the tool's own Enter finishes
  // a curve, and the keyboard belongs to the field while the caret is in it.
  expect(await getLabelLayer(page)).toBeNull();

  await input.press('ArrowUp');
  expect(await getNewLabelStyle(page)).toMatchObject({'font-size': 25});
  await input.press('Shift+ArrowDown');
  expect(await getNewLabelStyle(page)).toMatchObject({'font-size': 15});
  await expect(input).toHaveValue('15');

  await page.locator('.text-style-panel .label-size-row .size-field-down').click();
  expect(await getNewLabelStyle(page)).toMatchObject({'font-size': 14});

  // an unusable value leaves the size alone rather than being stored
  await input.fill('huge');
  await input.press('Enter');
  await expect(input).toHaveValue('14');
  expect(await getNewLabelStyle(page)).toMatchObject({'font-size': 14});
  expect(errors).toEqual([]);
});

test('a field gives the keyboard back when it is finished with', async function({page}) {
  // A control that keeps focus keeps the keyboard, so the next Escape or Enter
  // goes to the field rather than to the map -- and it goes on showing its
  // focus ring over a value that has already been applied, which reads as a
  // value still being edited.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var size = page.locator('.text-style-panel .label-size-row .size-field-input');

  await size.fill('24');
  await size.press('Enter');
  expect(await getFocusedElement(page)).toBe('BODY');
  expect(await getNewLabelStyle(page)).toMatchObject({'font-size': 24});

  // Escape puts back what the field was showing and lets go of it too
  await size.fill('40');
  await size.press('Escape');
  await expect(size).toHaveValue('24');
  expect(await getFocusedElement(page)).toBe('BODY');
  expect(await getNewLabelStyle(page)).toMatchObject({'font-size': 24});

  // a menu hands it back as soon as something is chosen from it
  await page.locator('.text-style-panel select').first().selectOption('Georgia');
  await page.waitForTimeout(150);
  expect(await getFocusedElement(page)).toBe('BODY');

  // and so does a field that commits on Enter through its change handler
  var spacing = page.locator('.text-style-panel .label-measure-input').first();
  await spacing.fill('2');
  await spacing.press('Enter');
  expect(await getFocusedElement(page)).toBe('BODY');
  expect(await getNewLabelStyle(page)).toMatchObject({'letter-spacing': '2'});
  expect(errors).toEqual([]);
});

test('a key typed into a field is the field\'s, not the tool\'s', async function({page}) {
  // Escape disarmed the tool from inside a field, and silently: the tool
  // consumes the key before anything in the panel can see it, so the field
  // showed no sign of having been left.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'path');
  var css = page.locator('.text-style-panel .label-css-row input');

  await css.fill('text-shadow: 1px 1px #eee');
  await css.press('Escape');

  await expect(css).toHaveValue('');
  expect(await getFocusedElement(page)).toBe('BODY');
  expect(await getNewLabelStyle(page)).not.toHaveProperty('css');
  // the curve tool is still armed: the key never reached it
  await expect(page.locator('.floating-toolbar.label-toolbar .floating-toolbar-btn').nth(1))
    .toHaveClass(/selected/);
  expect(errors).toEqual([]);
});

test('the symbol is faded and coloured apart from the text', async function({page}) {
  // A label's opacity is applied to both of the elements its record produces,
  // so the Icon section needs its own opacity or setting the text to 50% would
  // half-fade a symbol the panel showed at 100%.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await writeLabel(page, 'Reno');
  await disarmTool(page);
  await clickLabel(page, 0);

  var panel = page.locator('.text-style-panel');
  await panel.locator('.label-toggle').click();
  await page.waitForTimeout(120);
  await panel.locator('.label-icon-buttons [data-icon="circle"]').click();
  await page.waitForTimeout(120);
  await setFieldValue(panel.locator('.label-text-opacity-row input'), '40%');
  await setFieldValue(panel.locator('.label-icon-color-row .label-color-field input'), '#cc0000');
  await setFieldValue(panel.locator('.label-icon-opacity-row input'), '80%');

  expect((await getLabelLayer(page)).records[0]).toMatchObject({
    icon: 'circle',
    opacity: 0.4,
    'icon-color': '#cc0000',
    'icon-opacity': 0.8
  });

  // full opacity is stored as no opacity at all: the property is what makes a
  // label translucent, and a column of 1s is noise in the user's table
  await setFieldValue(panel.locator('.label-text-opacity-row input'), '100%');
  expect((await getLabelLayer(page)).records[0].opacity).toBeUndefined();
  expect(errors).toEqual([]);
});

test('the switch is what gives a label a symbol and takes it away', async function({page}) {
  // Whether a label has a symbol is one question and which shape it is another,
  // so the first is a switch and the four shapes answer only the second. The
  // shape, size and colour controls are inert until there is a symbol to style:
  // an icon-size or icon-color on a label with no icon draws nothing.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await writeLabel(page, 'Reno');
  await disarmTool(page);
  await clickLabel(page, 0);

  var panel = page.locator('.text-style-panel');
  var toggle = panel.locator('.label-toggle');
  var starBtn = panel.locator('.label-icon-buttons [data-icon="star"]');
  var iconColor = panel.locator('.label-icon-color-row .label-color-field input');

  await toggle.click();
  await page.waitForTimeout(150);
  expect((await getLabelLayer(page)).records[0]).toMatchObject({
    icon: 'circle',
    'icon-size': 5,
    'icon-opacity': 1
  });

  // the shape chosen is the shape the switch brings back, rather than the
  // default quietly replacing it
  await starBtn.click();
  await page.waitForTimeout(150);
  await setFieldValue(iconColor, '#cc0000');
  expect((await getLabelLayer(page)).records[0]).toMatchObject({
    icon: 'star',
    'icon-color': '#cc0000'
  });

  // the switch off takes the symbol off the record rather than leaving an
  // empty name where one was
  await toggle.click();
  await page.waitForTimeout(150);
  expect((await getLabelLayer(page)).records[0].icon).toBeUndefined();

  await toggle.click();
  await page.waitForTimeout(150);
  expect((await getLabelLayer(page)).records[0].icon).toBe('star');
  expect(errors).toEqual([]);
});

test('alignment can be chosen before there is anything to align', async function({page}) {
  // Alignment means how the lines of a label line up with each other, so it
  // was disabled for anything but a label that already had a second line. That
  // is the wrong way round: a style is usually set before the text is typed,
  // and choosing left-aligned and then writing two lines has to work.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var alignBtn = page.locator('.text-style-panel .label-align-buttons [data-align="left"]');

  // nothing on the layer, nothing selected, and the control still answers
  await alignBtn.click();
  await page.waitForTimeout(120);
  expect(await getNewLabelStyle(page)).toMatchObject({'label-align': 'left'});

  await armTool(page, 'anchor');
  await clickMap(page, 0.35, 0.4);
  await page.keyboard.type('North');
  await page.keyboard.press('Shift+Enter');
  await writeLabel(page, 'Dakota');
  await disarmTool(page);
  var created = (await getLabelLayer(page)).records[0];
  expect(created['label-align']).toBe('left');

  // and on a single-line label, where it competes with the position grid over
  // where the text sits, it is still the user's to set
  await armTool(page, 'anchor');
  await clickMap(page, 0.6, 0.65);
  await writeLabel(page, 'Reno');
  await disarmTool(page);
  await clickLabel(page, 1);
  await page.locator('.text-style-panel .label-align-buttons [data-align="right"]').click();
  await page.waitForTimeout(150);

  var records = (await getLabelLayer(page)).records;
  expect(records[1]['label-align']).toBe('right');
  expect(records[0]['label-align']).toBe('left');
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

test('the block stays put in every one of the nine positions', async function({page}) {
  // Six of the nine hold text clear of the anchor with an offset in ems, and
  // an em needs a font size to become a distance. A label usually has none of
  // its own -- it inherits one from its layer -- so those six went uncorrected
  // while n, s and c, whose offset is plain 0, looked fine.
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

  var positions = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];
  for (var i = 0; i < positions.length; i++) {
    var pos = positions[i];
    await setLabelPosition(page, pos);
    await page.locator('.text-style-panel .label-align-buttons [data-align="center"]').click();
    await page.waitForTimeout(200);
    var centered = await getLabelBox(page, 0);
    for (var align of ['left', 'right']) {
      await page.locator('.text-style-panel .label-align-buttons [data-align="' + align + '"]').click();
      await page.waitForTimeout(200);
      var box = await getLabelBox(page, 0);
      expect(Math.abs(box.x - centered.x),
        pos + ' ' + align + ' moved the block').toBeLessThan(1.5);
    }
  }
  expect(errors).toEqual([]);
});

test('an aligned label is re-measured when its text or font changes', async function({page}) {
  // Nothing tells the renderer that a measurement is out of date, because
  // nothing has to: a width is found by a fingerprint of the text and the font
  // it describes, so an edit makes the old one unfindable and the new one is
  // measured on demand. What that buys is this: a label centred on its anchor
  // stays centred on it through a font change and through a text edit, whatever
  // its lines are aligned to.
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
  await page.locator('.text-style-panel .label-align-buttons [data-align="left"]').click();
  await page.waitForTimeout(200);
  var centre = await getLabelCentre(page, 0);
  var width = (await getLabelBox(page, 0)).width;

  // a bigger font is wider text, so a block held by a width measured at 12px
  // would sit visibly off its anchor
  await setFieldValue(page.locator('.text-style-panel .label-size-row input'), '24');
  await page.waitForTimeout(250);
  expect((await getLabelBox(page, 0)).width).toBeGreaterThan(width * 1.5);
  expect(Math.abs(await getLabelCentre(page, 0) - centre)).toBeLessThan(1.5);

  // and typing into it is the other way a measurement goes out of date: one
  // click selects, a second reaches into the text
  await clickLabel(page, 0);
  await clickLabel(page, 0);
  await page.keyboard.press('End');
  await page.keyboard.type(' Northerly');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  var rec = (await getLabelLayer(page)).records[0];
  expect(rec['label-text']).toMatch(/Northerly/);
  expect(Math.abs(await getLabelCentre(page, 0) - centre)).toBeLessThan(1.5);
  expect(errors).toEqual([]);
});

test('a path label too long for its path is marked as overflowing', async function({page}) {
  // The fit check is the other reader of a text measurement, and until the GUI
  // had a measure function it could only answer 'unmeasured': a label the
  // editor should have flagged, and export should have dropped, went through
  // both untouched. One measurement switches both on.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);

  await armTool(page, 'path');
  await clickMap(page, 0.3, 0.5);
  await clickMap(page, 0.36, 0.5);
  await finishCurve(page);
  await writeLabel(page, 'A NAME FAR TOO LONG FOR THIS LITTLE CURVE');
  await page.waitForTimeout(200);
  // drawn, because a label nobody can see is a label nobody can fix, and
  // marked, because it will not survive export
  expect(await getLabelClass(page, 0)).toMatch(/label-overflow/);

  // and a curve with room for its text is not marked
  await armTool(page, 'path');
  await clickMap(page, 0.15, 0.8);
  await clickMap(page, 0.75, 0.8);
  await finishCurve(page);
  await writeLabel(page, 'ROOM');
  await page.waitForTimeout(200);
  expect(await getLabelClass(page, 1)).not.toMatch(/label-overflow/);
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

test('the tool reaches for its preferred font before the browser default', async function({page}) {
  // NYTFranklin where the machine has it, and whatever sans-serif resolves to
  // where it does not. The font a label is made in is a tool default like its
  // position, so it can be a preference; the font an existing label is *named*
  // as cannot, because it has to be the one the label is drawn in.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var fonts = await page.locator('.text-style-panel select').first()
    .locator('option').allTextContents();
  test.skip(fonts.indexOf('NYTFranklin') == -1, 'NYTFranklin is not installed here');

  expect(await getDefaultFont(page)).toBe('NYTFranklin');
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await writeLabel(page, 'Reno');
  expect((await getLabelLayer(page)).records[0]['font-family']).toBe('NYTFranklin');

  // a label that arrived with no font is drawn in the browser's default, not
  // in the tool's preference, so that is what the panel says it is in
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand(
      '-add-label coordinates=2,3 text=Vegas target=labels');
  });
  await disarmTool(page);
  await page.waitForTimeout(200);
  await clickLabel(page, 1);
  expect(await page.locator('.text-style-panel select').first().inputValue())
    .not.toBe('NYTFranklin');
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

test('the style menu offers the faces of the chosen font, and nothing else', async function({page}) {
  // "Default style" was an entry of its own, which named a face the user could
  // not see and mapshaper could not measure. Regular is that face, it is one of
  // the font's own, and it is in the list under its own name.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var panel = page.locator('.text-style-panel');
  var styleSelect = panel.locator('.label-font-style-row select');

  await panel.locator('select').first().selectOption('Georgia');
  await page.waitForTimeout(100);

  var options = await styleSelect.locator('option').allTextContents();
  expect(options).not.toContain('Default style');
  expect(options).toContain('Regular');
  expect(await styleSelect.isDisabled()).toBe(false);
  // a font is always set in something, and it is Regular unless it is not
  expect(await styleSelect.inputValue()).toBe('normal|400');
  expect(errors).toEqual([]);
});

test('a selection in two fonts has no face to show', async function({page}) {
  // A face belongs to a font, so a selection that does not agree on a font
  // has nothing to list: the faces of one of them would be a menu that lies
  // about the other.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand(
      '-add-label coordinates=2,3 text=A no-replace name=labels ' +
      '-add-label coordinates=4,3 text=B target=labels ' +
      "-style font-family='Georgia' ids=0 target=labels");
  });
  await disarmTool(page);
  await page.waitForTimeout(200);

  await clickLabel(page, 0);
  var styleSelect = page.locator('.text-style-panel .label-font-style-row select');
  expect(await styleSelect.isDisabled()).toBe(false);

  await page.keyboard.down('Shift');
  await clickLabel(page, 1);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(150);

  expect(await styleSelect.locator('option').count()).toBe(0);
  expect(await styleSelect.isDisabled()).toBe(true);
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

test('shift-click adds a label to the selection, and takes it back out', async function({page}) {
  // Styling acts on any number of labels, so selecting has to be additive --
  // and a shift-click must never reach into text, or it would open a session on
  // the label it was removing.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.3, 0.35);
  await page.keyboard.type('A');
  await clickMap(page, 0.15, 0.85);
  await clickMap(page, 0.55, 0.6);
  await page.keyboard.type('B');
  await clickMap(page, 0.2, 0.85);
  await disarmTool(page);
  await page.waitForTimeout(150);

  await clickLabel(page, 0);
  expect(await getSelectionCueCount(page)).toBe(1);

  await page.keyboard.down('Shift');
  await clickLabel(page, 1);
  expect(await getSelectionCueCount(page)).toBe(2);

  await clickLabel(page, 1); // still held: takes it back out
  await page.keyboard.up('Shift');
  expect(await getSelectionCueCount(page)).toBe(1);
  expect(await getCaretCount(page)).toBe(0);

  // a plain click on one of several narrows the selection to it
  await page.keyboard.down('Shift');
  await clickLabel(page, 1);
  await page.keyboard.up('Shift');
  expect(await getSelectionCueCount(page)).toBe(2);
  await clickLabel(page, 1);
  expect(await getSelectionCueCount(page)).toBe(1);
  expect(await getCaretCount(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('escape gives up the selection before the armed tool', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.3, 0.35);
  await page.keyboard.type('A');
  await clickMap(page, 0.15, 0.85);
  await disarmTool(page);
  await clickLabel(page, 0);
  expect(await getSelectionCueCount(page)).toBe(1);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  expect(await getSelectionCueCount(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('the curve being drawn is shown as a guide with a handle on each knot', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'path');

  // the guide is drawn to canvas, so assert on the overlay layers the map built
  await clickMap(page, 0.3, 0.4);
  expect(await getGuides(page)).toEqual([
    // one knot has a handle but no line to draw yet
    {name: 'label-path-knots', geometryType: 'point', shapeCount: 1}
  ]);

  // the free end of the curve follows the pointer, so a single knot and the
  // pointer are already a line -- and the pointer gets no handle, because it
  // is not a knot until it is clicked
  await hoverMap(page, 0.45, 0.3);
  expect(await getGuides(page)).toEqual([
    {name: 'label-path-guide', geometryType: 'polyline', shapeCount: 1},
    {name: 'label-path-knots', geometryType: 'point', shapeCount: 1}
  ]);

  await clickMap(page, 0.45, 0.3);
  await clickMap(page, 0.6, 0.4);
  expect(await getGuides(page)).toEqual([
    {name: 'label-path-guide', geometryType: 'polyline', shapeCount: 1},
    {name: 'label-path-knots', geometryType: 'point', shapeCount: 3}
  ]);

  // the guide belongs to the tool, not to the map: finishing the curve leaves
  // nothing selected, so nothing is drawn
  await finishCurve(page);
  expect(await getGuides(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('double-clicking a knot that is already there does nothing', async function({page}) {
  // There are no corners to toggle -- a label path is a smooth curve through
  // its knots. The gesture still has to leave the curve alone: the double-click
  // arrives as two clicks first, and those must not drop a knot on top of the
  // one under the pointer, which drew a stray branch back to it.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'path');

  await clickMap(page, 0.3, 0.4);
  await clickMap(page, 0.45, 0.3);
  await clickMap(page, 0.6, 0.4);
  var before = await getGuideCoords(page);

  await dblclickMap(page, 0.45, 0.3);
  expect(await getGuideCoords(page)).toEqual(before);
  // and the curve is still open, so it can be finished in the usual way
  expect(await getGuides(page)).toEqual([
    {name: 'label-path-guide', geometryType: 'polyline', shapeCount: 1},
    {name: 'label-path-knots', geometryType: 'point', shapeCount: 3}
  ]);

  await finishCurve(page);
  await writeLabel(page, 'Sierra');
  var lyr = await getLabelLayer(page);
  expect(lyr.pointCounts).toEqual([3]);
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

test('the guide survives a zoom, because its knots are in map coordinates', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'path');

  await clickMap(page, 0.3, 0.4);
  await clickMap(page, 0.45, 0.3);
  await clickMap(page, 0.6, 0.4);
  var before = await getGuideCoords(page);
  expect(before.length).toBe(3);

  await page.evaluate(function() {
    window.mapshaper.undoTest.zoomByPct(2);
  });
  await page.waitForTimeout(150);

  // in pixel coordinates the knots would now be somewhere else entirely
  expect(await getGuideCoords(page)).toEqual(before);
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
    expect(await getSessionHistory(page)).toMatch(/-style dx=/);
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

test('the drag mode is the tool\'s and not the label\'s', async function({page}) {
  // Nothing in the record says which segment is lit: a label with a position
  // can be dragged or not, and one that has been dragged stays dragged when
  // the toggle goes back to Fixed. A per-label flag would be a column in the
  // user's table that nothing else reads.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);

  await clickMap(page, 0.4, 0.45);
  await writeLabel(page, 'Reno');
  await disarmTool(page);
  await clickLabel(page, 0);
  await setDragMode(page, 'draggable');
  await dragBy(page, await getGlyphPoint(page, 0, 0.5), 50, 30);
  var offset = (await getLabelLayer(page)).records[0];
  expect(offset.dx).toBeGreaterThan(0);

  // back to Fixed: the label keeps the offset it was dragged to, and the drag
  // moves the label again
  await setDragMode(page, 'fixed');
  var anchor = (await getLabelLayer(page)).shapes[0];
  await dragBy(page, await getGlyphPoint(page, 0, 0.5), -40, 0);
  var lyr = await getLabelLayer(page);
  expect(lyr.shapes[0]).not.toEqual(anchor);
  expect(lyr.records[0].dx).toBe(offset.dx);
  expect(lyr.records[0].dy).toBe(offset.dy);

  // and nothing about the mode is written to the layer or to a new label
  expect(lyr.fields).not.toContain('label-position-mode');
  expect(await getNewLabelStyle(page)).not.toHaveProperty('label-position-mode');
  expect(errors).toEqual([]);
});

test('a symbol at the anchor is what moves a label out from under it',
  async function({page}) {
    // The nine positions place text around something, and there is no answer
    // to "north-east of what?" on a label that draws nothing at its anchor, so
    // the grid offers only the centre until there is a symbol.
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);

    await clickMap(page, 0.4, 0.45);
    await writeLabel(page, 'Reno');
    await disarmTool(page);
    await clickLabel(page, 0);

    // the centre still answers: text over its own symbol is a real thing to
    // ask for, and it is where the label already is
    await setLabelPosition(page, 'c');
    expect((await getLabelLayer(page)).records[0]['label-pos']).toBe('c');

    // a symbol answers the question, and the label moves out from under it
    await turnIconOn(page);
    expect((await getLabelLayer(page)).records[0]['label-pos']).toBe('ne');

    // the icon and the position move together, in one command and so in one
    // undo step
    expect(await getSessionHistory(page)).toMatch(/-style icon=.*label-pos='ne'/);
    await page.evaluate(function() { window.mapshaper.undoTest.undo(); });
    await page.waitForTimeout(200);
    var rec = (await getLabelLayer(page)).records[0];
    expect(rec.icon).toBeFalsy();
    expect(rec['label-pos']).toBe('c');
    expect(errors).toEqual([]);
  });

test('switching the symbol off takes the placement with it', async function({page}) {
  // The grid locks back to the centre with nothing at the anchor, so the
  // position and the offsets go with the symbol. That makes the switch
  // destructive; being one undoable command is what makes it acceptable.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);

  await clickMap(page, 0.4, 0.45);
  await writeLabel(page, 'Reno');
  await disarmTool(page);
  await clickLabel(page, 0);
  await turnIconOn(page);
  await setLabelPosition(page, 'se');
  expect((await getLabelLayer(page)).records[0]['label-pos']).toBe('se');

  await page.locator('.text-style-panel .label-toggle').click();
  await page.waitForTimeout(250);
  var rec = (await getLabelLayer(page)).records[0];
  expect(rec.icon).toBeFalsy();
  expect(rec['label-pos']).toBe('c');

  await page.evaluate(function() { window.mapshaper.undoTest.undo(); });
  await page.waitForTimeout(200);
  expect((await getLabelLayer(page)).records[0]['label-pos']).toBe('se');
  expect(errors).toEqual([]);
});

test('a dragged label is tethered to its anchor while it moves',
  async function({page}) {
    // The offset is what is being edited, and on a label that draws nothing at
    // its anchor the ring and the line to it are the only things that say what
    // the text hangs off.
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);

    await clickMap(page, 0.4, 0.45);
    await writeLabel(page, 'Reno');
    await disarmTool(page);
    await clickLabel(page, 0);
    // centred, so the box holds the anchor and a ring inside it would say
    // nothing the box does not
    expect(await page.locator('.label-cue-anchor').count()).toBe(0);
    await setDragMode(page, 'draggable');

    var p = await getGlyphPoint(page, 0, 0.5);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(80);
    await page.mouse.down();
    await page.mouse.move(p.x + 70, p.y - 50, {steps: 8});
    await page.waitForTimeout(100);
    expect(await page.locator('.label-cue-tether').count()).toBe(1);
    expect(await page.locator('.label-cue-anchor').count()).toBe(1);
    await page.mouse.up();
    await page.waitForTimeout(250);

    // the line goes when the drag does; the ring stays, because the anchor is
    // now outside the box and nothing else marks it
    expect(await page.locator('.label-cue-tether').count()).toBe(0);
    expect(await page.locator('.label-cue-anchor').count()).toBe(1);
    expect(errors).toEqual([]);
  });

test('a drag on a label that is not selected pans the map', async function({page}) {
  // Only a selected label is held; anywhere else a drag over a label has to
  // stay available for panning, in either mode.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);

  await clickMap(page, 0.4, 0.45);
  await writeLabel(page, 'Reno');
  await disarmTool(page);
  await clickLabel(page, 0);
  await setDragMode(page, 'draggable');
  await page.keyboard.press('Escape'); // gives up the selection
  await page.waitForTimeout(120);
  await hoverNothing(page);
  var before = (await getLabelLayer(page)).shapes[0];
  var view = await getViewBounds(page);

  await dragBy(page, await getGlyphPoint(page, 0, 0.5), 70, 0);

  var lyr = await getLabelLayer(page);
  expect(lyr.records[0].dx).toBeUndefined();
  expect(lyr.shapes[0]).toEqual(before);
  expect(await getViewBounds(page)).not.toEqual(view);
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

test('a drag on a path label that is not selected pans the map',
  async function({page}) {
    // Only a selected label is held; anywhere else a drag over a label has to
    // stay available for panning.
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await drawPathLabel(page, [[0.15, 0.6], [0.45, 0.55], [0.75, 0.6]], 'SIERRA');
    await disarmTool(page);
    await hoverNothing(page);
    var before = (await getLabelLayer(page)).shapes[0];
    var view = await getViewBounds(page);

    await dragBy(page, await getGlyphPoint(page, 0, 0.5), 70, 0);

    expect((await getLabelLayer(page)).records[0]['label-start-offset'])
      .toBeUndefined();
    expect((await getLabelLayer(page)).shapes[0]).toEqual(before);
    expect(await getViewBounds(page)).not.toEqual(view);
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
  await page.evaluate(function() {
    window.mapshaper.undoTest.clearUndoHistory();
    window.mapshaper.undoTest.setInteractionMode('label');
  });
  await page.locator('.floating-toolbar.label-toolbar').waitFor();
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

// The class attribute of a label's <text>, which is where the renderer records
// what it thinks of the label -- overflowing its path, for one.
async function getLabelClass(page, id) {
  return page.evaluate(function(args) {
    var symbol = document.querySelector(
      '.mapshaper-symbol-layer .mapshaper-svg-symbol[data-id="' + args.id + '"]');
    var node = symbol && (symbol.tagName == 'text' ? symbol : symbol.querySelector('text'));
    return node ? node.getAttribute('class') || '' : null;
  }, {id: id});
}

// The horizontal middle of a label's text, which is where its anchor is for a
// label positioned n, s or c -- and so the thing that must not move when the
// text or the font changes under an alignment.
async function getLabelCentre(page, id) {
  var box = await getLabelBox(page, id);
  return box.x + box.width / 2;
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

// Switches the symbol on, which is also what unlocks the position grid: the
// nine positions place text around something.
async function turnIconOn(page) {
  await page.locator('.text-style-panel .label-toggle').click();
  await page.waitForTimeout(250);
}

async function getCaretCount(page) {
  return page.evaluate(function() {
    return document.querySelectorAll('.label-edit-caret').length;
  });
}

// How many labels are cued as selected for styling.
async function getSelectionCueCount(page) {
  return page.evaluate(function() {
    return document.querySelectorAll(
      '.label-cue-selected').length;
  });
}

// Arms a creation tool, leaving it armed whether or not it already was. The
// tool arms itself on a layer with no labels, so a helper that just clicked the
// button would disarm it there.
async function armTool(page, kind) {
  var i = kind == 'anchor' ? 0 : 1;
  var btn = page.locator('.floating-toolbar.label-toolbar .floating-toolbar-btn').nth(i);
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
  var btns = page.locator('.floating-toolbar.label-toolbar .floating-toolbar-btn');
  for (var i = 0; i < 2; i++) {
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

// Types a value into a panel text field and commits it, which is what a user
// leaving the field does: the panel's fields apply their value on 'change'.
// What has the keyboard: a tag name, or 'BODY' for nothing in particular.
async function getFocusedElement(page) {
  return page.evaluate(function() {
    var el = document.activeElement;
    return el ? el.nodeName : 'none';
  });
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

// The interaction modes the arrow menu offers for the active layer.
async function getModeMenuItems(page) {
  await page.locator('.pointer-btn').hover();
  await page.locator('.nav-sub-menu .nav-menu-item').first().waitFor();
  return page.locator('.nav-sub-menu .nav-menu-item').allInnerTexts();
}

// Opens a layer's own menu from the layer list, the way a user does.
async function openLayerMenu(page, layerName) {
  await page.locator('.layer-control-btn').click();
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

// Hovers a fraction of the way along a label's rendered characters, using the
// engine's own idea of where it put them.
async function hoverGlyph(page, id, frac) {
  var p = await page.evaluate(function(args) {
    var node = document.querySelector(
      '.mapshaper-svg-symbol[data-id="' + args.id + '"]');
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
  return hoverPoint(page, p.x, p.y);
}

// Hovers a label's first point. A symbol's transform is its anchor, so the
// origin of its own coordinate space is that point in screen space.
async function hoverAnchor(page, id) {
  var p = await page.evaluate(function(args) {
    var node = document.querySelector(
      '.mapshaper-svg-symbol[data-id="' + args.id + '"]');
    var pt = node.ownerSVGElement.createSVGPoint();
    pt = pt.matrixTransform(node.getScreenCTM());
    return {x: pt.x, y: pt.y};
  }, {id: id});
  return hoverPoint(page, p.x, p.y);
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

async function getGuides(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getLabelPathGuideInfo();
  });
}

// The knot handle positions, in map coordinates.
async function getGuideCoords(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getLabelPathKnotCoords();
  });
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
