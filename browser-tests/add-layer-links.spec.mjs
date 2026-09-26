import { expect, test } from '@playwright/test';

// A polygon layer: the target the "Draw" links are most often clicked
// beside, and one that can hold neither a label nor a drawn point.
var FIXTURE = 'test/data/features/snip/ring_and_line.json';

test('the labels link creates a point layer and opens the label tool',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await clickNewLayerLink(page, 'labels');

    var lyr = await getLayerInfo(page, 'labels');
    expect(lyr).not.toBeNull();
    expect(lyr.geometry_type).toBe('point');
    expect(lyr.shapeCount).toBe(0);
    // one click, rather than a layer to find the right tool for afterwards
    expect(await getInteractionMode(page)).toBe('label');
    await expect(page.locator('.floating-toolbar.label-toolbar')).toBeVisible();
    expect(errors).toEqual([]);
  });

test('the polygons link creates a polygon layer and opens the drawing tool',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await clickNewLayerLink(page, 'polygons');

    var lyr = await getLayerInfo(page, 'polygons');
    expect(lyr).not.toBeNull();
    expect(lyr.geometry_type).toBe('polygon');
    expect(await getInteractionMode(page)).toBe('edit_polygons');
    expect(errors).toEqual([]);
  });

test('each link opens the tool that draws the kind of feature it names',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);

    await clickNewLayerLink(page, 'points');
    expect((await getLayerInfo(page, 'points')).geometry_type).toBe('point');
    expect(await getInteractionMode(page)).toBe('edit_points');
    // the tool is open on the new layer, so a click on the map lands in it --
    // an armed tool over a map where clicking does nothing is the failure this
    // whole flow is prone to
    await clickMap(page, 0.5, 0.5);
    expect((await getLayerInfo(page, 'points')).shapeCount).toBe(1);

    await clickNewLayerLink(page, 'lines');
    expect((await getLayerInfo(page, 'lines')).geometry_type).toBe('polyline');
    expect(await getInteractionMode(page)).toBe('edit_lines');
    expect(errors).toEqual([]);
  });

test('clicking a link twice draws in the layer the first click made',
  async function({page}) {
    // otherwise the first layer is left behind, empty, and the tool the second
    // click closed never comes back: setMode() does nothing when the mode has
    // not changed
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);

    await clickNewLayerLink(page, 'labels');
    await clickNewLayerLink(page, 'labels');

    expect(await getLayerInfo(page, 'labels')).not.toBeNull();
    expect(await getLayerInfo(page, 'labels2')).toBeNull();
    expect(await getInteractionMode(page)).toBe('label');
    await expect(page.locator('.floating-toolbar.label-toolbar')).toBeVisible();
    expect(errors).toEqual([]);
  });

test('a second layer of the same kind is named apart from the first',
  async function({page}) {
    // two layers of one name make target= ambiguous, which the commands the
    // tools run treat as an error rather than guessing between them
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);

    await clickNewLayerLink(page, 'points');
    await clickMap(page, 0.5, 0.5); // the layer is no longer one to draw in
    await clickNewLayerLink(page, 'points');

    expect((await getLayerInfo(page, 'points')).shapeCount).toBe(1);
    expect((await getLayerInfo(page, 'points2')).shapeCount).toBe(0);
    expect(errors).toEqual([]);
  });

test('a layer made by a link is undoable and replays from the session history',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    var before = await getState(page);

    await clickNewLayerLink(page, 'lines');
    expect((await getState(page)).model.layerCount).toBe(before.model.layerCount + 1);

    // the command is what created the layer, so the session replays it
    var commands = await page.evaluate(function() {
      return window.mapshaper.undoTest.getSessionHistory().commands;
    });
    expect(commands.some(function(str) {
      return str.indexOf('-add-layer') === 0 && str.indexOf('geometry-type=polyline') > -1;
    })).toBe(true);

    await page.evaluate(function() {
      window.mapshaper.undoTest.setInteractionMode('off');
      return window.mapshaper.undoTest.undo();
    });
    await expect.poll(async function() {
      return (await getState(page)).model.checksum;
    }).toBe(before.model.checksum);
    expect(errors).toEqual([]);
  });

test('the links work in a session that has imported nothing',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadEmpty(page);
    await clickNewLayerLink(page, 'labels');

    expect((await getLayerInfo(page, 'labels')).geometry_type).toBe('point');
    expect(await getInteractionMode(page)).toBe('label');
    expect(errors).toEqual([]);
  });

test('the arrow menu offers the label tool only on a label layer',
  async function({page}) {
    // The menu holds the tools that suit the active layer. On a polygon layer
    // "add/edit labels" was an entry for editing a layer that did not exist
    // yet; making one is what the layer panel's links are for.
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    expect(await getModeMenuItems(page)).not.toContain('add/edit labels');

    await clickNewLayerLink(page, 'labels');
    // leave the tool, whose panel the arrow button will not open the menu over
    await page.evaluate(function() {
      window.mapshaper.undoTest.setInteractionMode('off');
    });
    await page.waitForTimeout(120);
    expect(await getModeMenuItems(page)).toContain('add/edit labels');
    expect(errors).toEqual([]);
  });

test('a new layer leaves the layer beside it visible, as a guide',
  async function({page}) {
    var errors = collectPageErrors(page);
    await loadFixture(page, FIXTURE);
    await openLayerPanel(page);
    // shown, and on, with only one layer: the next layer will not hide this one
    await expect(page.locator('.layer-control .pin-all .black-eye')).toBeVisible();
    await expect(page.locator('.layer-control .pin-all')).toHaveClass(/pinned/);

    await clickNewLayerLink(page, 'labels');
    var source = page.locator('.layer-list .layer-item', {hasText: 'ring_and_line'});
    await expect(source).not.toHaveClass(/active/);
    await expect(source).toHaveClass(/pinned/);

    // hiding everything but the active layer is still one click
    await page.locator('.layer-control .pin-all .black-eye').click();
    await expect(source).not.toHaveClass(/pinned/);
    expect(errors).toEqual([]);
  });

test('each link says that it creates a layer, which its name does not',
  async function({page}) {
    await loadFixture(page, FIXTURE);
    await openLayerPanel(page);
    var tips = await page.locator('.new-layer-links .layer-menu-link')
      .evaluateAll(function(els) {
        return els.map(function(el) { return el.title; });
      });
    expect(tips.length).toBe(4);
    tips.forEach(function(tip) {
      expect(tip).toContain('new layer');
    });
  });

// Clicks one of the "Draw" links in the layer panel, the way a user does.
async function clickNewLayerLink(page, kind) {
  await openLayerPanel(page);
  await page.locator('.new-layer-links .layer-menu-link[data-kind="' + kind + '"]')
    .click();
  await page.waitForTimeout(250);
}

// The panel stays open after a link is clicked, so a second link is one click.
async function openLayerPanel(page) {
  var links = page.locator('.new-layer-links');
  if (await links.isVisible()) return;
  // the sidebar tab is there whether or not anything has been loaded, unlike
  // the header button, which appears with the first layer
  await page.locator('.layer-tab:visible').click();
  await links.waitFor({state: 'visible'});
}

// Clicks the map at a fraction of its width and height.
async function clickMap(page, fx, fy) {
  var box = await page.locator('.mshp-main-map').boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(120);
}

async function getModeMenuItems(page) {
  await page.locator('.pointer-btn').hover();
  await page.locator('.nav-sub-menu .nav-menu-item').first().waitFor();
  return page.locator('.nav-sub-menu .nav-menu-item').allInnerTexts();
}

async function getInteractionMode(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getInteractionMode();
  });
}

async function getLayerInfo(page, name) {
  return page.evaluate(function(name) {
    return window.mapshaper.undoTest.getLayerInfo(name);
  }, name);
}

async function getState(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getState();
  });
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
  });
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

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}
