import { expect, test } from '@playwright/test';

// In-place label text editing: creating a label leaves a caret in it, typing
// renders into the real SVG text node, and the session commits as one undo
// step when it ends.
//
// See docs/development/label-tool-design.md.

var FIXTURE = 'test/data/features/snip/ring_and_line.json';

test('clicking the map leaves a caret and a box in a new label', async function({page}) {
  // The label has no text yet, so without the box and the caret there would be
  // nothing on screen at all and no sign the click did anything.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);

  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);

  var editor = await getEditorState(page);
  expect(editor.caretCount).toBe(1);
  expect(editor.boxCount).toBe(1);
  expect(editor.boxHeight).toBeGreaterThan(0);
  expect(editor.focused).toBe(true);
  expect(errors).toEqual([]);
});

test('a new label renders a node even with no text', async function({page}) {
  // renderPoint() returns nothing for a label with no text, so the editor
  // renders a zero-width space to have something to put a caret beside
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);

  var editor = await getEditorState(page);
  expect(editor.textNodeCount).toBe(1);
  expect(editor.rendered).toBe('\u200b');
});

test('typing renders into the label that will be exported', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);

  await page.keyboard.type('Reno');
  await page.waitForTimeout(60);

  var editor = await getEditorState(page);
  expect(editor.rendered).toBe('Reno');
  expect(editor.caretCount).toBe(1);
  // Nothing is saved until the session ends -- and until then the label is not
  // a feature at all, so there is nothing to read the text of.
  expect(await getLabelText(page, 0)).toBeNull();
  expect(errors).toEqual([]);
});

test('the caret moves with the text as it is typed', async function({page}) {
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);

  var atStart = (await getEditorState(page)).caretX;
  await page.keyboard.type('Reno');
  await page.waitForTimeout(60);
  var atEnd = (await getEditorState(page)).caretX;
  expect(atEnd).toBeGreaterThan(atStart);

  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(60);
  var moved = (await getEditorState(page)).caretX;
  expect(moved).toBeLessThan(atEnd);
  expect(moved).toBeGreaterThan(atStart);
});

test('clicking away creates the label in one command', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno');

  // disarm, so the click that ends the session does not place another label
  await disarmTool(page);
  await clickMap(page, 0.8, 0.8);
  await page.waitForTimeout(250);

  expect(await getLabelText(page, 0)).toBe('Reno');
  var history = await getHistory(page);
  // One command carries the geometry and the text together, rather than a
  // creation followed by a text edit -- there is one entry for the label, not
  // one for placing it and another for what was typed into it.
  expect(history.match(/-add-label/g).length).toBe(1);
  expect(history).toContain("text='Reno'");
  expect(history).not.toContain('-style label-text=');
  expect(errors).toEqual([]);
});

test('undo reverses a whole session, not a keystroke', async function({page}) {
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno');
  await disarmTool(page);
  await clickMap(page, 0.8, 0.8);
  await page.waitForTimeout(250);
  expect(await getLabelText(page, 0)).toBe('Reno');

  // The session is one step, and that step is the label's creation: undoing it
  // takes the label away rather than blanking its text.
  await undo(page);
  expect(await getLabelText(page, 0)).toBeNull();
});

test('a label never typed into is never created', async function({page}) {
  // An empty label puts no mark on the map, so one left behind would be
  // invisible and unfindable in the data. Rather than creating it and cleaning
  // it up, the click creates nothing: the feature waits for a glyph.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  // a caret is on screen, but no layer and no feature are behind it
  expect((await getEditorState(page)).caretCount).toBe(1);
  expect(await getLabelLayer(page)).toBeNull();

  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  expect(await getLabelLayer(page)).toBeNull();
  expect((await getEditorState(page)).caretCount).toBe(0);
  // nothing ran, so there is nothing in the history to undo
  expect(await getHistory(page)).not.toContain('-add-label');
  expect(errors).toEqual([]);
});

test('escape finishes a label and leaves it, keeping the text', async function({page}) {
  // Escape means "done with this label", the same as clicking away, rather than
  // discarding what was typed
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  expect(await getLabelText(page, 0)).toBe('Reno');
  expect((await getEditorState(page)).caretCount).toBe(0);
  // the tool is still on, so the next click can place the next label
  expect(await page.locator('.floating-toolbar.label-toolbar').isVisible()).toBe(true);
});

test('clicking away finishes the label without placing another', async function({page}) {
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno');

  await clickMap(page, 0.8, 0.8); // ends the session, and nothing more
  await page.waitForTimeout(250);
  expect((await getEditorState(page)).caretCount).toBe(0);
  expect((await getLabelLayer(page)).records.length).toBe(1);

  // the next click places the next label, which exists once it has been typed
  await clickMap(page, 0.8, 0.8);
  await page.keyboard.type('Elko');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  expect((await getLabelLayer(page)).records.length).toBe(2);
});

test('a label takes two clicks to open for editing', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno');
  await disarmTool(page);
  await clickMap(page, 0.8, 0.8);
  expect((await getEditorState(page)).caretCount).toBe(0);

  // the first click selects the label for styling
  await clickLabel(page, 0);
  expect((await getEditorState(page)).caretCount).toBe(0);
  expect(await getSelectionCueCount(page)).toBe(1);

  // the second reaches into its text, and the styling cue gives way
  await clickLabel(page, 0);
  expect((await getEditorState(page)).caretCount).toBe(1);
  expect(await getSelectionCueCount(page)).toBe(0);

  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await armTool(page, 'anchor');
  await clickMap(page, 0.8, 0.8);
  expect(await getLabelText(page, 0)).toBe('Reno!');
  expect(errors).toEqual([]);
});

test('shift-enter adds a line to an anchored label', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);

  await page.keyboard.type('North');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Dakota');
  await page.waitForTimeout(60);

  var editor = await getEditorState(page);
  expect(editor.tspanCount).toBe(1);
  // the break renders as the zero-width placeholder that opens the second line
  expect(editor.rendered).toBe('North\u200bDakota');

  await disarmTool(page);
  await clickMap(page, 0.8, 0.8);
  // stored with the escape, because a real newline cannot travel through a
  // mapshaper command
  expect(await getLabelText(page, 0)).toBe('North\\nDakota');
  expect(errors).toEqual([]);
});

test('a space appears as soon as it is typed', async function({page}) {
  // SVG's default whitespace handling collapses runs and drops trailing ones,
  // so a typed space laid out no glyph and the caret did not move until a
  // non-space character followed it
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);

  await page.keyboard.type('New');
  await page.waitForTimeout(60);
  var before = await getEditorState(page);

  await page.keyboard.type(' ');
  await page.waitForTimeout(60);
  var after = await getEditorState(page);

  expect(after.xmlSpace).toBe('preserve');
  expect(after.renderedChars).toBe(before.renderedChars + 1);
  expect(after.caretX).toBeGreaterThan(before.caretX);
  expect(errors).toEqual([]);
});

test('a run of spaces is kept, not collapsed to one', async function({page}) {
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);

  await page.keyboard.type('A  B ');
  await page.waitForTimeout(60);

  expect((await getEditorState(page)).renderedChars).toBe(5);
});

test('shift-enter opens a line before anything is typed into it', async function({page}) {
  // an empty <tspan> lays out nothing, so the new line had no position for the
  // caret to move to and breaking the line appeared to do nothing at all
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('North');
  await page.waitForTimeout(60);
  var before = await getEditorState(page);

  await page.keyboard.press('Shift+Enter');
  await page.waitForTimeout(60);
  var after = await getEditorState(page);

  expect(after.tspanCount).toBe(1);
  expect(after.caretY).toBeGreaterThan(before.caretY);
  // the box has to grow too: an empty line adds nothing to the text's bounds,
  // and the box is the only other sign that a line was started
  expect(after.boxHeight).toBeGreaterThan(before.boxHeight);
  expect(errors).toEqual([]);
});

test('the caret reaches the second line of a multi-line label', async function({page}) {
  // a line break has no glyph, so the caret index in the text and the character
  // index in the rendered label diverge from the break onwards
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('North');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Dakota');
  await page.waitForTimeout(60);
  var onLine2 = (await getEditorState(page)).caretY;

  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Home');
  await page.waitForTimeout(60);
  var onLine1 = (await getEditorState(page)).caretY;

  expect(onLine2).toBeGreaterThan(onLine1);
});

test('selecting text draws a band beneath the glyphs', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno');
  expect((await getEditorState(page)).selectionCount).toBe(0);

  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(60);

  var editor = await getEditorState(page);
  expect(editor.selectionCount).toBe(1); // one run on one line, merged
  expect(editor.selectionWidth).toBeGreaterThan(0);
  // the band paints beneath the text and the caret above it
  expect(editor.selectionIsBehindText).toBe(true);
  expect(editor.caretIsInFrontOfText).toBe(true);
  expect(errors).toEqual([]);
});

test('the editor overlay follows the map', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno');
  await page.waitForTimeout(60);

  var before = await getEditorState(page);
  await page.evaluate(function() { window.mapshaper.undoTest.zoomByPct(2); });
  await page.waitForTimeout(200);
  var after = await getEditorState(page);

  // the overlay wears the label's own transform, so the two move together
  expect(after.overlayTransform).toBe(after.symbolTransform);
  expect(after.overlayTransform).not.toBe(before.overlayTransform);
  expect(after.caretCount).toBe(1);
  expect(after.rendered).toBe('Reno');
  expect(errors).toEqual([]);
});

test('a path label is edited along its curve', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'path');
  await clickMap(page, 0.3, 0.45);
  await clickMap(page, 0.45, 0.35);
  await clickMap(page, 0.6, 0.45);
  await page.keyboard.press('Enter'); // finish the curve
  await page.waitForTimeout(150);

  var editor = await getEditorState(page);
  expect(editor.caretCount).toBe(1);
  expect(editor.isPathLabel).toBe(true);

  await page.keyboard.type('Sierra');
  await page.waitForTimeout(60);

  editor = await getEditorState(page);
  expect(editor.rendered).toBe('Sierra');
  // the text is inside the <textPath>, so it is what will be exported
  expect(editor.textPathCount).toBe(1);
  // glyphs on a curve are rotated, which is what the caret has to lean with
  expect(Math.abs(editor.caretAngle)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('enter commits an anchored label instead of adding a line', async function({page}) {
  // Enter finishes a label, and shift-Enter is what breaks a line. Most map
  // labels are one line, and Enter ends entry of a field everywhere else in
  // this app. It used to add a line here while committing a path label, so the
  // key did two different things with nothing on screen to say which.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);

  await page.keyboard.type('Reno');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);

  expect(await getLabelText(page, 0)).toBe('Reno');
  expect((await getEditorState(page)).caretCount).toBe(0);
  expect(errors).toEqual([]);
});

test('enter commits a path label instead of adding a line', async function({page}) {
  // a <tspan> inside a <textPath> advances along the curve rather than
  // stacking below it, so there is no second line to add
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'path');
  await clickMap(page, 0.3, 0.45);
  await clickMap(page, 0.45, 0.35);
  await clickMap(page, 0.6, 0.45);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);

  await page.keyboard.type('Sierra');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);

  expect(await getLabelText(page, 0)).toBe('Sierra');
  expect((await getEditorState(page)).caretCount).toBe(0);
  expect(errors).toEqual([]);
});

test('a committed path label is reopened by clicking its text', async function({page}) {
  // The way back into a finished path label. Until <textPath> was a tag the SVG
  // hit test walked through, the glyphs were not hit targets and the only way in
  // was a click near a knot, which says nothing about where the caret should go.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'path');
  await clickMap(page, 0.25, 0.5);
  await clickMap(page, 0.45, 0.35);
  await clickMap(page, 0.65, 0.5);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await page.keyboard.type('Sierra');
  await page.keyboard.press('Enter'); // commits, on a path label
  await page.waitForTimeout(200);
  expect((await getEditorState(page)).caretCount).toBe(0);
  await disarmTool(page); // so a click is not a new curve

  await clickGlyph(page, 0, 3); // selects it
  expect(await getSelectionCueCount(page)).toBe(1);
  await clickGlyph(page, 0, 3); // opens its text

  expect((await getEditorState(page)).caretCount).toBe(1);
  // the caret went where the click did, not to one end
  await page.keyboard.type('!!');
  await page.waitForTimeout(80);
  expect((await getEditorState(page)).rendered).toBe('Sie!!rra');
  expect(errors).toEqual([]);
});

test('a click near a curved label keeps the session open', async function({page}) {
  // a curved label's bounding box is mostly empty air, so glyph-precise hit
  // testing alone would dismiss the session on a near miss
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'path');
  await clickMap(page, 0.3, 0.45);
  await clickMap(page, 0.45, 0.35);
  await clickMap(page, 0.6, 0.45);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await page.keyboard.type('Sierra');
  await page.waitForTimeout(60);

  var hit = await getEditorState(page);
  expect(hit.hitRegionCount).toBe(1);
  expect(hit.hitBaselineCount).toBe(1);

  // A click just off the glyphs, which the path tool is still armed for: it
  // has to reach the label rather than start a new curve. The tolerance is the
  // thickened baseline, about one em, so the point is taken from the curve
  // itself rather than guessed at in map fractions.
  await clickOffCurve(page, 5);
  var after = await getEditorState(page);
  expect(after.caretCount).toBe(1);
  expect(after.rendered).toBe('Sierra');
  expect(errors).toEqual([]);
});

test('clicking the text moves the caret rather than ending the session', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Mississippi');
  await page.waitForTimeout(60);

  var atEnd = (await getEditorState(page)).caretX;
  // clicking a label reaches it even with a creation tool armed, so that a
  // click never stacks a second label on top of an existing one
  await clickLabelText(page, 0, 0.2);
  var after = await getEditorState(page);

  expect(after.caretCount).toBe(1);
  expect(after.caretX).toBeLessThan(atEnd);
  // the session is still the same one, on a label that is still not a feature
  expect(after.rendered).toBe('Mississippi');
  expect(await getLabelLayer(page)).toBeNull();
  expect(errors).toEqual([]);
});

test('clicking the toolbar ends the session and saves', async function({page}) {
  // the toolbar takes focus, and the editor commits when its textarea loses it
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno');

  await armTool(page, 'path');
  await page.waitForTimeout(200);

  expect(await getLabelText(page, 0)).toBe('Reno');
  expect((await getEditorState(page)).caretCount).toBe(0);
  expect(errors).toEqual([]);
});

test('leaving label mode ends the session and saves', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno');

  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('off');
  });
  await page.waitForTimeout(200);

  expect(await getLabelText(page, 0)).toBe('Reno');
  expect((await getEditorState(page)).caretCount).toBe(0);
  expect(errors).toEqual([]);
});

test('a path label shows its curve ghosted while it is open', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'path');
  await clickMap(page, 0.25, 0.55);
  await clickMap(page, 0.45, 0.35);
  await clickMap(page, 0.7, 0.5);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);

  // the label is empty at this point, so the ghost is the only thing on screen
  expect(await getGhostPathCount(page)).toBe(1);
  // and the caret waits where the first character will land -- the middle of
  // the path, not its start, which is where an unplaced caret falls back to
  var p = await getCaretVsPathMiddle(page);
  expect(Math.abs(p.caretX - p.middleX)).toBeLessThan(2);

  await page.keyboard.type('Sierra');
  expect(await getGhostPathCount(page)).toBe(1);
  // the curve says where the label is; a box around curved text would only
  // enclose empty air
  expect((await getEditorState(page)).boxCount).toBe(0);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  expect(await getGhostPathCount(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('the style panel acts on the label being typed into, and lets typing go on', async function({page}) {
  // placing a label and setting its style before typing a word is ordinary
  // use, so the panel has to reach the empty label and leave the caret in it
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  expect(await getPanelStatus(page)).toBe('Editing: this label');

  await clickPosition(page, 'sw');
  expect((await getEditorState(page)).focused).toBe(true);
  // The label has no feature to style yet, so the panel sets the style the
  // label is drawn with -- and the drawing is the preview: an 'sw' label hangs
  // off the end of its anchor, which is what text-anchor="end" says.
  expect(await getPendingTextAnchor(page)).toBe('end');

  await page.keyboard.type('Reno');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  // committed with the style that was chosen before there was anything to style
  expect(await getLabelText(page, 0)).toBe('Reno');
  expect(await getLabelField(page, 0, 'label-pos')).toBe('sw');
  expect(errors).toEqual([]);
});

test('a label is drawn the same before and after it becomes a feature', async function({page}) {
  // A committed label inherits its font and alignment from the group its layer
  // is drawn in, and carries an attribute only where it differs. A label being
  // typed has no such group, so it has to be given the same defaults -- without
  // them it was drawn left-aligned at the browser's own font size and jumped to
  // centred at 12px the moment it was created.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);

  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno');
  var pending = await getTextStyle(page, '.label-edit-pending text');
  expect(pending['text-anchor']).toBe('middle');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  var committed = await getTextStyle(page, '.mapshaper-svg-symbol');
  expect(pending).toEqual(committed);
  expect(errors).toEqual([]);
});

test('the font menu stays open when clicked mid-session', async function({page}) {
  // The panel returns the caret to the label after a control has taken focus,
  // but a native menu closes the moment its element is blurred -- so doing that
  // on the click that opened the menu made it flash open and shut. Focus
  // staying on the <select> is what "the menu is open" looks like from here:
  // the menu itself is drawn by the OS and is not in the DOM.
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno');

  var menu = page.locator('.text-style-panel select').first();
  var box = await menu.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(250);
  expect(await activeElementName(page)).toBe('SELECT');
  // and the label is still being edited, rather than having been finished by
  // the blur that focusing the menu caused
  expect((await getEditorState(page)).caretCount).toBe(1);

  // choosing a font applies it and hands the caret back, so typing goes on
  await menu.selectOption('Georgia');
  await page.waitForTimeout(250);
  expect(await activeElementName(page)).toBe('TEXTAREA');
  await page.keyboard.type('!');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  expect(await getLabelText(page, 0)).toBe('Reno!');
  expect(await getLabelField(page, 0, 'font-family')).toBe('Georgia');
  expect(errors).toEqual([]);
});

test('leaving an untyped label takes back its styling along with it', async function({page}) {
  // the empty label is undone, and styling it added commands on top of its
  // creation -- undoing one step would take back the styling and keep the label
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await clickPosition(page, 'sw');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect(await getLabelLayer(page)).toBeNull();
  expect(errors).toEqual([]);
});

// --- helpers

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}

async function loadFixture(page, fixture) {
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(fixture));
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

async function clickMap(page, fx, fy) {
  var box = await page.locator('.mshp-main-map').boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(80);
}

// Clicks a label's rendered glyphs, the way a user reaches into one.
async function clickLabel(page, id) {
  await clickLabelText(page, id, 0.5);
}

// Clicks a fraction of the way across a label's rendered text.
async function clickLabelText(page, id, fx) {
  var box = await page.evaluate(function(args) {
    // A label being typed into that has not been created yet has no feature id
    // to find it by, so it is found as the pending one instead.
    var node = document.querySelector('.label-edit-pending text') ||
      document.querySelector(
        '.mapshaper-symbol-layer .mapshaper-svg-symbol[data-id="' + args.id + '"]');
    var r = node.getBoundingClientRect();
    return {x: r.x, y: r.y, width: r.width, height: r.height};
  }, {id: id});
  await page.mouse.click(box.x + box.width * fx, box.y + box.height / 2);
  await page.waitForTimeout(80);
}

// Clicks the middle of one rendered character, using the engine's own idea of
// where it put it. Needed for a curved label, whose bounding box is mostly air.
async function clickGlyph(page, id, charIndex) {
  var p = await page.evaluate(function(args) {
    var node = document.querySelector(
      '.mapshaper-symbol-layer .mapshaper-svg-symbol[data-id="' + args.id + '"]');
    var content = node.querySelector('textPath') || node;
    var box = content.getExtentOfChar(args.charIndex);
    var pt = node.ownerSVGElement.createSVGPoint();
    pt.x = box.x + box.width / 2;
    pt.y = box.y + box.height / 2;
    pt = pt.matrixTransform(node.getScreenCTM());
    return {x: pt.x, y: pt.y};
  }, {id: id, charIndex: charIndex});
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(120);
}

async function undo(page) {
  await page.evaluate(function() { window.mapshaper.undoTest.undo(); });
  await page.waitForTimeout(150);
}

async function getHistory(page) {
  return JSON.stringify(await page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory();
  }));
}

async function getLabelLayer(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getLayerInfo('labels');
  });
}

// How many labels are cued as selected for styling, counting both shapes the
// tool uses: a box around an anchored label and a stroked curve under a path one.
async function getSelectionCueCount(page) {
  return page.evaluate(function() {
    return document.querySelectorAll(
      '.label-cue-selected').length;
  });
}

// Where the caret is, against the midpoint of the curve it sits on. Both are
// in the label's own coordinate space, which is what the caret is drawn in.
async function getCaretVsPathMiddle(page) {
  return page.evaluate(function() {
    var layer = document.querySelector('.label-edit-pending') ||
      document.querySelector('.mapshaper-symbol-layer');
    var caret = layer.querySelector('.label-edit-caret');
    var tp = layer.querySelector('textPath');
    var href = tp && (tp.getAttribute('href') || tp.getAttribute('xlink:href'));
    var path = href && document.getElementById(href.substr(1));
    var mid = path.getPointAtLength(path.getTotalLength() / 2);
    return {caretX: parseFloat(caret.getAttribute('x1')), middleX: mid.x};
  });
}

// Clicks @dy pixels below the middle of the curve a label's text is set along,
// which is a near miss on the glyphs rather than a click on the map.
async function clickOffCurve(page, dy) {
  var p = await page.evaluate(function() {
    var use = document.querySelector('.label-edit-hit-baseline');
    var href = use.getAttribute('href') || use.getAttribute('xlink:href');
    var path = document.getElementById(href.substr(1));
    var m = use.getScreenCTM();
    var pt = path.getPointAtLength(path.getTotalLength() / 2);
    return {x: pt.x * m.a + pt.y * m.c + m.e, y: pt.x * m.b + pt.y * m.d + m.f};
  });
  await page.mouse.click(p.x, p.y + dy);
  await page.waitForTimeout(120);
}

// The ghosted copy of the curve a label's text is set along.
async function getGhostPathCount(page) {
  return page.evaluate(function() {
    return document.querySelectorAll('.label-edit-path').length;
  });
}

// How a label's text is actually drawn, whatever it inherits it from. Read as
// computed style rather than attributes, since the defaults a committed label
// is drawn with are on the group above it and not on the text itself.
async function getTextStyle(page, selector) {
  return page.evaluate(function(sel) {
    var node = document.querySelector(sel);
    if (!node) return null;
    if (node.tagName.toLowerCase() != 'text') node = node.querySelector('text') || node;
    var style = getComputedStyle(node);
    return {
      'text-anchor': style.textAnchor,
      'font-size': style.fontSize,
      'font-family': style.fontFamily
    };
  }, selector);
}

// The text-anchor the label being typed into is drawn with, which is how a
// label position chosen before the label exists shows up.
async function getPendingTextAnchor(page) {
  return page.evaluate(function() {
    var text = document.querySelector('.label-edit-pending text');
    return text ? text.getAttribute('text-anchor') : null;
  });
}

async function clickPosition(page, pos) {
  await page.locator('.text-style-panel [data-position="' + pos + '"]').click();
  await page.waitForTimeout(250);
}

// What the panel says it is about to act on.
async function getPanelStatus(page) {
  return page.locator('.text-style-panel .label-editing-status').textContent();
}

async function getLabelField(page, id, field) {
  return page.evaluate(function(args) {
    var lyr = window.mapshaper.undoTest.getLayerInfo('labels');
    var rec = lyr && lyr.records ? lyr.records[args.id] : null;
    return rec ? rec[args.field] : null;
  }, {id: id, field: field});
}

// The stored label text of a feature, which is what would be exported.
async function getLabelText(page, id) {
  return page.evaluate(function(args) {
    var lyr = window.mapshaper.undoTest.getLayerInfo('labels');
    var rec = lyr && lyr.records ? lyr.records[args.id] : null;
    return rec ? rec['label-text'] : null;
  }, {id: id});
}

// Everything the editor puts in the DOM, read back in one round trip.
async function activeElementName(page) {
  return page.evaluate(function() {
    return document.activeElement && document.activeElement.nodeName;
  });
}

async function getEditorState(page) {
  return page.evaluate(function() {
    // A label that has not been created yet is drawn in a group of its own
    // rather than in a layer, since it belongs to no layer. Everything the
    // editor draws is inside whichever of the two hosts the session is using.
    var layer = document.querySelector('.label-edit-pending') ||
      document.querySelector('.mapshaper-symbol-layer');
    var input = document.querySelector('.label-edit-input');
    var caret = layer && layer.querySelector('.label-edit-caret');
    var box = layer && layer.querySelector('.label-edit-box');
    var bands = layer ? layer.querySelectorAll('.label-edit-selection') : [];
    var back = layer && layer.querySelector('.label-edit-back');
    var front = layer && layer.querySelector('.label-edit-front');
    var symbol = layer && layer.querySelector(
      '.mapshaper-svg-symbol, .mapshaper-pending-symbol');
    var texts = layer ? layer.querySelectorAll('text') : [];
    var content = symbol && (symbol.querySelector('textPath') ||
      (symbol.tagName == 'text' ? symbol : symbol.querySelector('text')));
    function order(el) {
      return el && el.parentNode ?
        Array.prototype.indexOf.call(el.parentNode.childNodes, el) : -1;
    }
    return {
      focused: !!input && document.activeElement === input,
      caretCount: layer ? layer.querySelectorAll('.label-edit-caret').length : 0,
      boxCount: layer ? layer.querySelectorAll('.label-edit-box').length : 0,
      boxHeight: box ? parseFloat(box.getAttribute('height')) : 0,
      caretX: caret ? parseFloat(caret.getAttribute('x1')) : null,
      caretY: caret ? parseFloat(caret.getAttribute('y1')) : null,
      caretAngle: caret && caret.getAttribute('transform') ?
        parseFloat(caret.getAttribute('transform').replace(/[^-\d.]+/, '')) : 0,
      selectionCount: bands.length,
      selectionWidth: bands.length ?
        parseFloat(bands[0].getAttribute('width')) : 0,
      selectionIsBehindText: order(back) < order(symbol),
      caretIsInFrontOfText: order(front) > order(symbol),
      hitRegionCount: layer ? layer.querySelectorAll('.label-edit-hit').length : 0,
      hitBaselineCount: layer ?
        layer.querySelectorAll('.label-edit-hit-baseline').length : 0,
      textNodeCount: texts.length,
      textPathCount: layer ? layer.querySelectorAll('textPath').length : 0,
      tspanCount: layer ? layer.querySelectorAll('tspan').length : 0,
      isPathLabel: !!(symbol && symbol.querySelector('textPath')),
      rendered: content ? content.textContent : null,
      // characters the text engine laid out, which is not the string's length
      // when whitespace has been collapsed away
      renderedChars: content ? content.getNumberOfChars() : 0,
      xmlSpace: content ? content.closest('text')
        .getAttributeNS('http://www.w3.org/XML/1998/namespace', 'space') : null,
      symbolTransform: symbol ? symbol.getAttribute('transform') : null,
      overlayTransform: front ? front.getAttribute('transform') : null
    };
  });
}
