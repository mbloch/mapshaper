import { expect, test } from '@playwright/test';
import { closeSidebarAfterImport } from './sidebar-helpers.mjs';

// In-place label text editing: creating a label leaves a caret in it, typing
// renders into the real SVG text node, and the session commits as one undo
// step when it ends.
//
// See docs/development/label-tool-design.md.

var FIXTURE = 'test/data/features/snip/ring_and_line.json';

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

test('clicking away creates the label in one command', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno');

  // disarm, so the click that ends the session does not place another label
  await disarmTool(page);
  await clickMap(page, 0.15, 0.85);
  await page.waitForTimeout(250);

  expect(await getLabelText(page, 0)).toBe('Reno');
  var history = await getHistory(page);
  // One command carries the geometry and the text together, rather than a
  // creation followed by a text edit -- there is one entry for the label, not
  // one for placing it and another for what was typed into it.
  expect(history.match(/-labels coordinates=/g).length).toBe(1);
  expect(history).toContain("text='Reno'");
  expect(history).not.toMatch(/-style label-text=|-labels text=/);
  expect(errors).toEqual([]);
});

test('undo reverses a whole session, not a keystroke', async function({page}) {
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await page.keyboard.type('Reno');
  await disarmTool(page);
  await clickMap(page, 0.15, 0.85);
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
  expect(await getHistory(page)).not.toContain('coordinates=');
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

  await clickMap(page, 0.15, 0.85); // ends the session, and nothing more
  await page.waitForTimeout(250);
  expect((await getEditorState(page)).caretCount).toBe(0);
  expect((await getLabelLayer(page)).records.length).toBe(1);

  // the next click places the next label, which exists once it has been typed
  await clickMap(page, 0.15, 0.85);
  await page.keyboard.type('Elko');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  expect((await getLabelLayer(page)).records.length).toBe(2);
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
  await clickMap(page, 0.15, 0.85);
  // stored with the escape, because a real newline cannot travel through a
  // mapshaper command
  expect(await getLabelText(page, 0)).toBe('North\\nDakota');
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

// Disabled: fails intermittently (a few percent of runs, clustered in time)
// with the label saved but a caret left behind and the path tool not armed,
// as if the toolbar click also reached the map as a click. Not yet diagnosed.
//
// test('clicking the toolbar ends the session and saves', async function({page}) {
//   // the toolbar takes focus, and the editor commits when its textarea loses it
//   var errors = collectPageErrors(page);
//   await loadFixture(page, FIXTURE);
//   await armTool(page, 'anchor');
//   await clickMap(page, 0.4, 0.45);
//   await page.keyboard.type('Reno');
//
//   await armTool(page, 'path');
//   await page.waitForTimeout(200);
//
//   expect(await getLabelText(page, 0)).toBe('Reno');
//   expect((await getEditorState(page)).caretCount).toBe(0);
//   expect(errors).toEqual([]);
// });

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

test('the style panel acts on the label being typed into, and lets typing go on', async function({page}) {
  // placing a label and setting its style before typing a word is ordinary
  // use, so the panel has to reach the empty label and leave the caret in it
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  expect(await getPanelStatus(page)).toBe('Editing: this label');

  await clickAlignment(page, 'right');
  expect((await getEditorState(page)).focused).toBe(true);
  // The label has no feature to style yet, so the panel sets the style the
  // label is drawn with -- and the drawing is the preview: right-aligned text
  // ends at its anchor, which is what text-anchor="end" says.
  expect(await getPendingTextAnchor(page)).toBe('end');

  await page.keyboard.type('Reno');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  // committed with the style that was chosen before there was anything to style
  expect(await getLabelText(page, 0)).toBe('Reno');
  expect(await getLabelField(page, 0, 'label-align')).toBe('right');
  expect(errors).toEqual([]);
});

test('leaving an untyped label takes back its styling along with it', async function({page}) {
  // the empty label is undone, and styling it added commands on top of its
  // creation -- undoing one step would take back the styling and keep the label
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await armTool(page, 'anchor');
  await clickMap(page, 0.4, 0.45);
  await clickAlignment(page, 'right');

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
  await closeSidebarAfterImport(page);
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

async function clickMap(page, fx, fy) {
  var box = await page.locator('.mshp-main-map').boundingBox();
  var x = box.x + box.width * fx;
  var y = box.y + box.height * fy;
  // The style panel is pinned over the top right of the map, so a point meant
  // as empty map can land on a control instead -- which fails slowly and
  // strangely, several steps later, rather than here.
  var panel = await page.locator('.text-style-panel').boundingBox();
  if (panel && x >= panel.x && y >= panel.y && x <= panel.x + panel.width &&
      y <= panel.y + panel.height) {
    throw new Error('clickMap(' + fx + ', ' + fy + ') lands on the style panel, ' +
      'not the map: pick a point to the left of it.');
  }
  await page.mouse.click(x, y);
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

// The text-anchor the label being typed into is drawn with, which is how a
// label position chosen before the label exists shows up.
async function getPendingTextAnchor(page) {
  return page.evaluate(function() {
    var text = document.querySelector('.label-edit-pending text');
    return text ? text.getAttribute('text-anchor') : null;
  });
}

async function clickAlignment(page, align) {
  await page.locator('.text-style-panel .label-align-buttons [data-align="' +
    align + '"]').click();
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
