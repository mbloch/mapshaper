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
  expect(lyr.records).toEqual([{'label-text': 'Reno', 'label-pos': 'c'}]);
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
    // 'style labels' and 'add/drag points' both did less than the label tool
    // beside them in the menu, which styles labels and creates, moves and
    // retypes them as well.
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
    // positioning a label against its anchor is still the old mode's job
    expect(modes).toContain('position labels');
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
    await expect(page.locator('.floating-toolbar.label-toolbar')).toBeHidden();

    await openLayerMenu(page, 'labels');
    var item = page.locator('.contextmenu-item').filter({hasText: 'edit labels'});
    await expect(item).toBeVisible();
    await expect(page.locator('.contextmenu-item')
      .filter({hasText: 'style layer'})).toHaveCount(0);
    await item.click();
    await page.waitForTimeout(150);

    // the label tool, acting on that layer
    await expect(page.locator('.floating-toolbar.label-toolbar')).toBeVisible();
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
  expect((await getLabelLayer(page)).records)
    .toEqual([{'label-text': 'Reno', 'label-pos': 'c'}]);

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
  await clickMap(page, 0.8, 0.8); // finishes label A
  await clickMap(page, 0.55, 0.6);
  await page.keyboard.type('B');
  await clickMap(page, 0.85, 0.85); // finishes label B
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
  expect(lyr.records).toEqual([{'label-text': 'B', 'label-pos': 'c'}]);
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
  await clickMap(page, 0.85, 0.85); // finishes the label

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

test('the label toolbar is only present while the label mode is on', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var toolbar = page.locator('.floating-toolbar.label-toolbar');

  await expect(toolbar).toHaveClass(/visible/);
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('info');
  });
  await expect(toolbar).not.toHaveClass(/visible/);
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

test('the style panel is open in label mode, before there is a label', async function({page}) {
  // The panel is worth having up before there is anything to point it at: pick
  // a font, then place labels in it. Its own close button is hidden, because
  // closing it would leave the tool half on.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var panel = page.locator('.text-style-panel');

  await expect(panel).toBeVisible();
  expect(await getLabelLayer(page)).toBeNull();
  await expect(panel.locator('.label-style-close')).toBeHidden();
  await expect(panel.locator('select').first()).toBeEnabled();

  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('info');
  });
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});

test('a style set with nothing selected is given to the next label', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  var panel = page.locator('.text-style-panel');

  // the panel opens showing the tool's default position, so that what it says
  // the next label will get is what the next label gets
  await expect(panel.locator('.label-position-grid [data-position="c"]'))
    .toHaveClass(/selected/);

  await panel.locator('select').first().selectOption('Georgia');
  await panel.locator('.label-size-row .label-panel-btn').nth(1).click();
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

test('styling a selected label restyles it rather than the whole layer', async function({page}) {
  // Selecting is what points the panel at one label. With nothing selected it
  // holds a default for the next label instead of restyling every label on the
  // layer, which is not what a click on a font control means while labels are
  // being placed.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.35, 0.4);
  await page.keyboard.type('A');
  await clickMap(page, 0.6, 0.7); // finishes label A, and nothing more
  await clickMap(page, 0.65, 0.6); // places label B
  await page.keyboard.type('B');
  await clickMap(page, 0.85, 0.85); // finishes label B
  await disarmTool(page); // so a click makes nothing
  await page.waitForTimeout(200);

  await clickLabel(page, 0); // selects label A, and only A
  var panel = page.locator('.text-style-panel');
  await panel.locator('select').first().selectOption('Georgia');
  await page.waitForTimeout(200);

  var records = (await getLabelLayer(page)).records;
  expect(records.length).toBe(2);
  expect(records[0]['font-family']).toBe('Georgia');
  expect(records[1]['font-family']).toBeUndefined();
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
  await clickMap(page, 0.8, 0.8);
  await clickMap(page, 0.55, 0.6);
  await page.keyboard.type('B');
  await clickMap(page, 0.8, 0.85);
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
  await clickMap(page, 0.8, 0.8);
  await disarmTool(page);
  await clickLabel(page, 0);
  expect(await getSelectionCueCount(page)).toBe(1);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  expect(await getSelectionCueCount(page)).toBe(0);
  expect(await getEditingStatus(page)).toContain('new labels');
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

// The anchor is one knot rather than several, so it runs through the same
// machinery; it is here because the grab is measured from the pointer's hover
// position, and getting that from the dragstart position instead left the
// anchor unreachable.
test('an anchored label is moved by dragging its anchor marker',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);

    // the anchor tool is armed on entry to a layer with no labels
    await clickMap(page, 0.4, 0.45);
    await page.keyboard.type('Reno');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    await disarmTool(page);
    await clickLabel(page, 0);

    var marker = await page.evaluate(function() {
      var node = document.querySelector('.label-cue-selected .label-cue-anchor');
      var r = node.getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2};
    });
    var before = (await getLabelLayer(page)).shapes[0];
    await dragBy(page, marker, 70, 45);
    var after = (await getLabelLayer(page)).shapes[0];

    expect(after).not.toEqual(before);
    expect(after.length).toBe(1);
    expect(JSON.stringify(await getSessionHistory(page))).toContain('-update-label');
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

// What the style panel says its controls will act on.
async function getEditingStatus(page) {
  return page.locator('.text-style-panel .label-editing-status').textContent();
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
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(60); // let the click be processed and drawn
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

// Summary of the layer the tool created, or null if it did not create one.
async function getLabelLayer(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getLayerInfo('labels');
  });
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
    var content = node.querySelector('textPath') || node;
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

async function dragBy(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // several steps, so the drag registers as a drag rather than a click
  await page.mouse.move(from.x + dx, from.y + dy, {steps: 8});
  await page.mouse.up();
  await page.waitForTimeout(150);
}
