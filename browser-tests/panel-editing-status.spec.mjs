import { expect, test } from '@playwright/test';

// What the style panels' "Editing:" line says, and what the label panel's
// controls act on when nothing is selected: every label while no placement
// tool is armed, as in the line and polygon panels, and the next label while
// one is.

var LABEL_FIXTURE = 'test/data/features/snip/ring_and_line.json';
var LINE_FIXTURE = 'test/data/features/divide/ex1_line.json';

test('with no tool armed the label panel styles every label', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, LABEL_FIXTURE, 'label');
  await placeLabel(page, 0.3, 0.5, 'Reno');
  await placeLabel(page, 0.6, 0.4, 'Elko');
  await disarmTool(page);
  await page.keyboard.press('Escape');
  await expect(status(page)).toHaveText('Editing: all');
  // no outlines on the labels, which are not selected
  expect(await page.locator('.label-cue-selected').count()).toBe(0);

  // the controls show the labels' styles, and a change goes to all of them
  await runCommand(page, '-labels font-size=14 ids=0 target=labels');
  await expect(fontSizeInput(page)).toHaveAttribute('placeholder', 'mixed');
  await fontSizeInput(page).fill('18');
  await fontSizeInput(page).press('Enter');
  await expect.poll(function() { return getLabelField(page, 1, 'font-size'); }).toBe('18');
  expect(await getLabelField(page, 0, 'font-size')).toBe('18');
  // one command for the layer, without a list of ids
  expect(await page.evaluate(function() {
    var cmds = window.mapshaper.undoTest.getSessionHistory().commands;
    return cmds[cmds.length - 1];
  })).not.toContain('ids=');

  // arming a tool points the panel at the next label
  await armTool(page, 'anchor');
  await expect(status(page)).toHaveText('Editing: new labels');
  await disarmTool(page);
  await expect(status(page)).toHaveText('Editing: all');

  // Cmd-A is a selection, and shows as one
  await page.keyboard.press('ControlOrMeta+a');
  await expect(status(page)).toHaveText('Editing: 2 selected');
  expect(await page.locator('.label-cue-selected').count()).toBe(2);
  expect(errors).toEqual([]);
});

test('selecting a layer that cannot hold labels closes the label tool', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, LABEL_FIXTURE, 'label');
  // the first label goes into a new layer of its own, which becomes active
  await placeLabel(page, 0.3, 0.5, 'Reno');
  await disarmTool(page);
  await expect(page.locator('.text-style-panel')).toBeVisible();

  await page.locator('.layer-item').filter({hasText: 'ring_and_line'}).first().click();
  await expect(page.locator('.text-style-panel')).toBeHidden();
  await expect(page.locator('.floating-toolbar.label-toolbar')).toBeHidden();
  expect(await page.evaluate(function() {
    return window.mapshaper.undoTest.getState().model.activeLayer;
  })).toBe('ring_and_line');

  // and back on the label layer, the tool is in its menu again
  await page.locator('.layer-item').filter({hasText: 'labels'}).first().click();
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('label');
  });
  await expect(page.locator('.text-style-panel')).toBeVisible();
  expect(errors).toEqual([]);
});

test('an empty label layer with no tool armed has nothing to edit', async function({page}) {
  await page.goto('/?undo=on&undo-test=on');
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest;
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('label');
  });
  await page.locator('.text-style-panel').waitFor({state: 'visible'});
  // a layer with no labels opens with the anchor tool armed
  await expect(status(page)).toHaveText('Editing: new labels');
  await expect(fontSizeInput(page)).toBeEnabled();
  await disarmTool(page);
  await expect(status(page)).toHaveText('Editing: none (empty layer)');
  await expect(fontSizeInput(page)).toBeDisabled();
});

test('the line panel says when its layer is empty', async function({page}) {
  await loadFixture(page, LINE_FIXTURE, 'line_style');
  var panel = page.locator('.layer-style-panel');
  await expect(panel.locator('.label-editing-status')).toHaveText('Editing: all');
  await expect(panel).not.toHaveClass(/no-targets/);
  await runCommand(page, '-filter false');
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('line_style');
  });
  await expect(panel.locator('.label-editing-status')).toHaveText('Editing: none (empty layer)');
  await expect(panel).toHaveClass(/no-targets/);
});

function status(page) {
  return page.locator('.text-style-panel .label-editing-status');
}

function fontSizeInput(page) {
  return page.locator('.text-style-panel .size-field-input').first();
}

async function placeLabel(page, fx, fy, text) {
  await armTool(page, 'anchor');
  await clickMap(page, fx, fy);
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
}

async function runCommand(page, str) {
  await page.evaluate(function(cmd) {
    return window.mapshaper.undoTest.runCommand(cmd);
  }, str);
  await page.waitForTimeout(250);
}

async function getLabelField(page, id, field) {
  return page.evaluate(function(args) {
    var lyr = window.mapshaper.undoTest.getLayerInfo('labels');
    var rec = lyr && lyr.records ? lyr.records[args.id] : null;
    return rec ? rec[args.field] : null;
  }, {id: id, field: field});
}

async function loadFixture(page, fixture, mode) {
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(fixture));
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest &&
      window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
  await page.evaluate(function(mode) {
    window.mapshaper.undoTest.clearUndoHistory();
    window.mapshaper.undoTest.setInteractionMode(mode);
  }, mode);
  if (mode == 'label') {
    await page.locator('.floating-toolbar.label-toolbar').waitFor();
  } else {
    await page.locator('.layer-style-panel').waitFor({state: 'visible'});
  }
}

async function armTool(page, kind) {
  var i = {anchor: 0, block: 1, path: 2}[kind];
  var btn = page.locator('.floating-toolbar.label-toolbar .floating-toolbar-content > .floating-toolbar-btn').nth(i);
  if (!(await btn.evaluate(function(el) { return el.classList.contains('selected'); }))) {
    await btn.click();
    await page.waitForTimeout(60);
  }
}

async function disarmTool(page) {
  var btns = page.locator('.floating-toolbar.label-toolbar .floating-toolbar-content > .floating-toolbar-btn');
  for (var i = 0; i < 3; i++) {
    if (await btns.nth(i).evaluate(function(el) { return el.classList.contains('selected'); })) {
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

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}
