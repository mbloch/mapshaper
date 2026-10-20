import { expect, test } from '@playwright/test';
import AdmZip from 'adm-zip';
import { openLayersPanel } from './sidebar-helpers.mjs';

var SETUP = '-rectangle bbox=0,0,1,1 name=r1 -rectangle bbox=0,0,2,2 name=r2 ' +
  '-rectangle bbox=0,0,3,3 name=r3 -frame target=r1,r3 width=400 name=f1';

// Each change to a frame's members is one undo state that restores the
// membership (dataset.info.frame), splits and stacking flags it changed.
[
  '-frame target=f1 add-layers=r2',
  '-frame target=f1 order-layers=r3,r1',
  '-frame target=f1 remove-layers=r1',
  '-frame target=f1 hide-layers=r1',
  '-frame target=f1 + name=f2',
  '-frame target=f1 name=main',
  '-frame target=f1 remove',
  '-merge-layers target=r1,r2 force'
].forEach(function(command) {
  test('undo restores the session after: ' + command, async function({page}) {
    await page.goto('/?undo=on&undo-test=on');
    await page.waitForFunction(function() {
      return window.mapshaper && window.mapshaper.undoTest;
    });
    await runCommand(page, SETUP, null);
    var before = await getSignature(page);
    await runCommand(page, command, before);
    await page.evaluate(function() {
      return window.mapshaper.undoTest.undo();
    });
    await expect.poll(function() {
      return getSignature(page);
    }).toBe(before);
  });
});

var TWO_FRAMES = '-rectangle bbox=0,0,1,1 name=r1 -rectangle bbox=0,0,2,2 name=r2 ' +
  '-rectangle bbox=0,0,3,3 name=r3 -rectangle bbox=0,0,4,4 name=r4 ' +
  '-frame target=r1,r3 width=400 name=f1 -frame target=r4 width=400 name=f2';

test.describe('frame view and unframed view', function() {
  test.beforeEach(async function({page}) {
    await page.goto('/?undo=on&undo-test=on');
    await page.waitForFunction(function() {
      return window.mapshaper && window.mapshaper.undoTest;
    });
  });

  test('the selected layer\'s frame is shown, with all its layers', async function({page}) {
    await runCommand(page, TWO_FRAMES, null);
    await selectLayer(page, 'r1');
    expect(await getView(page)).toEqual({frame: 'f1', layers: ['r1', 'r3']});
    await selectLayer(page, 'r4');
    expect(await getView(page)).toEqual({frame: 'f2', layers: ['r4']});
  });

  test('an unframed layer is shown without framed layers', async function({page}) {
    await runCommand(page, TWO_FRAMES, null);
    await selectLayer(page, 'r2');
    expect(await getView(page)).toEqual({frame: null, layers: ['r2']});
  });

  test('a layer hidden in its frame is not shown', async function({page}) {
    await runCommand(page, TWO_FRAMES + ' -frame target=f1 hide-layers=r3', null);
    await selectLayer(page, 'r1');
    expect(await getView(page)).toEqual({frame: 'f1', layers: ['r1']});
  });

  test('a frame without members shows the unframed layers', async function({page}) {
    await runCommand(page, '-rectangle bbox=0,0,1,1 name=r1 ' +
      '-frame bbox=0,0,1,1 width=400 name=f1', null);
    expect(await getView(page)).toEqual({frame: 'f1', layers: ['r1']});
  });

  test('a selected layer that moves into a frame stays selected, and undo moves it back',
      async function({page}) {
    // r2b shares r2's dataset, so moving it into the frame splits the dataset
    await runCommand(page, TWO_FRAMES + ' -dissolve target=r2 + name=r2b', null);
    await selectLayer(page, 'r2b');
    var before = await getSignature(page);
    await runCommand(page, '-frame target=f1 add-layers=r2b', before);
    expect(await getView(page)).toEqual({frame: 'f1', layers: ['r1', 'r2b', 'r3']});
    await page.evaluate(function() { return window.mapshaper.undoTest.undo(); });
    await expect.poll(function() { return getView(page); })
      .toEqual({frame: null, layers: ['r2', 'r2b']});
  });
});

test.describe('layers menu with frames', function() {
  test.beforeEach(async function({page}) {
    await page.goto('/?undo=on&undo-test=on');
    await page.waitForFunction(function() {
      return window.mapshaper && window.mapshaper.undoTest;
    });
    await runCommand(page, TWO_FRAMES, null);
    await openLayersPanel(page);
  });

  test('unframed layers come first, then each frame with its layers', async function({page}) {
    await expect(page.locator('.layer-list .layer-name')).toHaveText(['r2']);
    var groups = page.locator('.map-frame-list .frame-section');
    await expect(groups).toHaveCount(2);
    await expect(groups.nth(0).locator('.frame-item .frame-name')).toHaveText('f1');
    await expect(groups.nth(0).locator('.frame-members .layer-name')).toHaveText(['r3', 'r1']);
    await expect(groups.nth(1).locator('.frame-members .layer-name')).toHaveText(['r4']);
  });

  test('the eye icon of a frame\'s layer hides it with an undoable command', async function({page}) {
    var row = memberRow(page, 'r3');
    await selectLayer(page, 'r1');
    await expect(row).toHaveClass(/pinned/);
    await row.hover();
    await row.locator('img.black-eye').click();
    await expect.poll(async function() {
      return (await getSessionCommands(page)).pop();
    }).toBe('-frame target=f1 hide-layers=r3');
    await expect(memberRow(page, 'r3')).toHaveClass(/invisible/);
    await page.evaluate(function() { return window.mapshaper.undoTest.undo(); });
    await expect(memberRow(page, 'r3')).toHaveClass(/pinned/);
  });

  test('the eye icon of a frame hides its layers, except the selected one', async function({page}) {
    var heading = page.locator('.frame-item').filter({hasText: 'f1'});
    await selectLayer(page, 'r1');
    await expect(heading).toHaveClass(/pinned/);
    await heading.hover();
    await heading.locator('img.black-eye').click();
    await expect.poll(async function() {
      return (await getSessionCommands(page)).pop();
    }).toBe('-frame target=f1 hide-layers=*');
    await expect(memberRow(page, 'r1')).not.toHaveClass(/invisible/);
    await expect(memberRow(page, 'r3')).toHaveClass(/invisible/);
    expect(await getView(page)).toEqual({frame: 'f1', layers: ['r1']});
    // the selected layer is shown; the one selected before is hidden again
    await selectLayer(page, 'r3');
    expect(await getView(page)).toEqual({frame: 'f1', layers: ['r3']});
    await expect(heading).not.toHaveClass(/pinned/);
    await heading.hover();
    await heading.locator('img.black-eye').click();
    await expect.poll(async function() {
      return (await getSessionCommands(page)).pop();
    }).toBe('-frame target=f1 show-layers=*');
    await expect(memberRow(page, 'r3')).toHaveClass(/pinned/);
  });

  test('the selected layer\'s eye hides it from the map without changing the frame', async function({page}) {
    var row = memberRow(page, 'r1');
    var count;
    await selectLayer(page, 'r1');
    count = (await getSessionCommands(page)).length;
    await row.hover();
    await row.locator('img.black-eye').click();
    await expect(row).toHaveClass(/invisible/);
    await expect(row).toHaveClass(/pinned/); // still shown in the frame
    expect((await getSessionCommands(page)).length).toBe(count);
    await row.locator('img.black-eye').click();
    await expect(row).not.toHaveClass(/invisible/);
  });

  test('clicking a frame\'s heading selects its top layer', async function({page}) {
    await page.locator('.frame-item').filter({hasText: 'f1'}).click();
    expect(await getView(page)).toEqual({frame: 'f1', layers: ['r1', 'r3']});
    expect(await page.evaluate(function() {
      return window.mapshaper.undoTest.getState().model.activeLayer;
    })).toBe('r3');
    await expect(page.locator('.frame-properties-popup')).toHaveCount(0);
  });

  test('clicking the Layers heading switches to the unframed view', async function({page}) {
    await selectLayer(page, 'r1');
    await page.locator('.unframed-section .section-title').click();
    expect(await getView(page)).toEqual({frame: null, layers: ['r2']});
  });

  test('a frame\'s section can be closed', async function({page}) {
    var section = page.locator('.map-frame-list .frame-section').nth(0);
    await section.locator('.section-toggle').click();
    await expect(section).toHaveClass(/closed/);
    await expect(memberRow(page, 'r3')).toBeHidden();
  });

  test('the Layers section can be closed', async function({page}) {
    await page.locator('.unframed-section .section-toggle').click();
    await expect(page.locator('.unframed-section')).toHaveClass(/closed/);
    await expect(page.locator('.layer-list .layer-item')).toBeHidden();
  });

  test('only the section on the map has working eye icons', async function({page}) {
    var row = memberRow(page, 'r3');
    await selectLayer(page, 'r2');
    await expect(page.locator('.frame-section.inactive-section')).toHaveCount(2);
    await row.hover();
    await row.locator('img.black-eye').click({force: true});
    await page.waitForTimeout(200);
    expect((await getSessionCommands(page)).pop()).not.toContain('hide-layers');
    await expect(row).toHaveClass(/pinned/);
    await selectLayer(page, 'r1');
    await expect(page.locator('.unframed-section')).toHaveClass(/inactive-section/);
    await expect(page.locator('.frame-section').nth(0)).toHaveClass(/active-section/);
  });

  test('a frame is renamed from its menu', async function({page}) {
    await openRowMenu(page, page.locator('.frame-item').filter({hasText: 'f1'}));
    await page.locator('.contextmenu-item').filter({hasText: 'rename frame'}).click();
    var name = page.locator('.frame-item .frame-name.editing');
    await expect(name).toBeFocused();
    await page.keyboard.type('Main map');
    await page.keyboard.press('Enter');
    await expect.poll(async function() {
      return (await getSessionCommands(page)).pop();
    }).toBe('-frame target=f1 name="Main map"');
    await expect(page.locator('.frame-item .frame-name').nth(0)).toHaveText('Main map');
  });
});

test.describe('frame actions in the layers menu', function() {
  test.beforeEach(async function({page}) {
    await page.goto('/?undo=on&undo-test=on');
    await page.waitForFunction(function() {
      return window.mapshaper && window.mapshaper.undoTest;
    });
  });

  test('an unframed layer can be moved into a frame, and back with undo', async function({page}) {
    await runCommand(page, TWO_FRAMES, null);
    await openLayersPanel(page);
    await openRowMenu(page, page.locator('.layer-list .layer-item').filter({hasText: 'r2'}));
    await page.locator('.contextmenu-item').filter({hasText: 'move into frame: f1'}).click();
    await expect.poll(async function() {
      return (await getSessionCommands(page)).pop();
    }).toBe('-frame target=f1 add-layers=r2');
    await expect(memberRow(page, 'r2')).toHaveCount(1);
    await page.evaluate(function() { return window.mapshaper.undoTest.undo(); });
    await expect(page.locator('.layer-list .layer-name')).toHaveText(['r2']);
  });

  test('a frame\'s layer can be moved out of the frame', async function({page}) {
    await runCommand(page, TWO_FRAMES, null);
    await openLayersPanel(page);
    await openRowMenu(page, memberRow(page, 'r3'));
    await page.locator('.contextmenu-item').filter({hasText: 'move out of frame'}).click();
    await expect.poll(async function() {
      return (await getSessionCommands(page)).pop();
    }).toBe('-frame target=f1 remove-layers=r3');
    await expect(page.locator('.layer-list .layer-name')).toHaveText(['r3', 'r2']);
  });

  test('a layer dragged into a frame goes where it is dropped', async function({page}) {
    await runCommand(page, TWO_FRAMES, null);
    await openLayersPanel(page);
    await dragRow(page, page.locator('.layer-list .layer-item').filter({hasText: 'r2'}),
      memberRow(page, 'r1'), 0.25);
    await expect.poll(async function() {
      return (await getSessionCommands(page)).pop();
    }).toBe('-frame target=f1 add-layers=r2 above=r1');
    await expect(page.locator('.frame-section').nth(0).locator('.frame-members .layer-name'))
      .toHaveText(['r3', 'r2', 'r1']);
  });

  test('a layer dropped on a frame\'s heading goes on top', async function({page}) {
    await runCommand(page, TWO_FRAMES, null);
    await openLayersPanel(page);
    await dragRow(page, page.locator('.layer-list .layer-item').filter({hasText: 'r2'}),
      page.locator('.frame-item').filter({hasText: 'f2'}), 0.5);
    await expect.poll(async function() {
      return (await getSessionCommands(page)).pop();
    }).toBe('-frame target=f2 add-layers=r2 top');
    await expect(page.locator('.frame-section').nth(1).locator('.frame-members .layer-name'))
      .toHaveText(['r2', 'r4']);
  });

  test('a layer dragged out of a frame goes where it is dropped', async function({page}) {
    await runCommand(page, TWO_FRAMES, null);
    await openLayersPanel(page);
    await dragRow(page, memberRow(page, 'r3'),
      page.locator('.layer-list .layer-item').filter({hasText: 'r2'}), 0.75);
    await expect.poll(async function() {
      return (await getSessionCommands(page)).pop();
    }).toBe('-frame target=f1 remove-layers=r3');
    await expect(page.locator('.layer-list .layer-name')).toHaveText(['r2', 'r3']);
  });

  test('dragging within a frame restacks with an undoable command', async function({page}) {
    await runCommand(page, TWO_FRAMES, null);
    await openLayersPanel(page);
    var names = page.locator('.frame-section').nth(0).locator('.frame-members .layer-name');
    await expect(names).toHaveText(['r3', 'r1']);
    await dragRow(page, memberRow(page, 'r1'), memberRow(page, 'r3'), 0.25);
    await expect.poll(async function() {
      return (await getSessionCommands(page)).pop();
    }).toBe('-frame target=f1 order-layers=r1 above=r3');
    await expect(names).toHaveText(['r1', 'r3']);
    await page.evaluate(function() { return window.mapshaper.undoTest.undo(); });
    await expect(names).toHaveText(['r3', 'r1']);
  });

  test('a drop that leaves a frame\'s order as it was runs no command', async function({page}) {
    await runCommand(page, TWO_FRAMES, null);
    await openLayersPanel(page);
    var count = (await getSessionCommands(page)).length;
    await dragRow(page, memberRow(page, 'r3'), memberRow(page, 'r1'), 0.25);
    await page.waitForTimeout(300);
    expect((await getSessionCommands(page)).length).toBe(count);
  });

  test('a frame can be copied', async function({page}) {
    await runCommand(page, TWO_FRAMES, null);
    await openLayersPanel(page);
    await openRowMenu(page, page.locator('.frame-item').filter({hasText: 'f1'}));
    await page.locator('.contextmenu-item').filter({hasText: 'copy frame'}).click();
    await expect.poll(async function() {
      return (await getSessionCommands(page)).pop();
    }).toBe('-frame target=f1 + name="f1 copy"');
    await expect(page.locator('.map-frame-list .frame-section')).toHaveCount(3);
  });

  test('a copy of a numbered frame takes the next number', async function({page}) {
    await runCommand(page, '-rectangle bbox=0,0,1,1 name=r1 -frame target=r1 width=400 name="Frame 1"', null);
    await openLayersPanel(page);
    await openRowMenu(page, page.locator('.frame-item').filter({hasText: 'Frame 1'}));
    await page.locator('.contextmenu-item').filter({hasText: 'copy frame'}).click();
    await expect.poll(async function() {
      return (await getSessionCommands(page)).pop();
    }).toBe('-frame target="Frame 1" + name="Frame 2"');
  });

  test('a new frame is made from the unframed layers, even in frame view', async function({page}) {
    await runCommand(page, TWO_FRAMES, null);
    await selectLayer(page, 'r1');
    await openLayersPanel(page);
    await page.locator('.map-frame-add').click();
    await page.locator('.frame-create-popup .dialog-btn')
      .filter({hasText: 'Fit visible layers'}).click();
    await expect.poll(async function() {
      return (await getSessionCommands(page)).pop();
    }).toBe("-frame width='800px' name=\"Frame 3\" target=r2");
    expect(await getView(page)).toEqual({frame: 'Frame 3', layers: ['r2']});
  });

  test('a new frame is drawn without errors', async function({page}) {
    var errors = [];
    page.on('pageerror', function(e) { errors.push(String(e)); });
    await runCommand(page, '-rectangle bbox=0,0,1,1 name=r1 -filter true + name=r1b', null);
    await selectLayer(page, 'r1b');
    await openLayersPanel(page);
    await page.locator('.map-frame-add').click();
    await page.locator('.frame-create-popup .dialog-btn')
      .filter({hasText: 'Fit visible layers'}).click();
    await expect.poll(function() {
      return getView(page);
    }).toEqual({frame: 'Frame 1', layers: ['r1', 'r1b']});
    await waitForDraw(page);
    expect(errors).toEqual([]);
  });

  test('a layer split off into a new frame stays selected, in the frame', async function({page}) {
    await runCommand(page, '-rectangle bbox=0,0,1,1 name=r1 -filter true + name=r1b', null);
    await selectLayer(page, 'r1b');
    await openLayersPanel(page);
    var r1 = page.locator('.layer-list .layer-item')
      .filter({has: page.locator('.layer-name', {hasText: /^r1$/})});
    await r1.hover();
    await r1.locator('.black-eye').click();
    await expect.poll(function() {
      return getView(page);
    }).toEqual({frame: null, layers: ['r1b']});
    await page.locator('.map-frame-add').click();
    await page.locator('.frame-create-popup .dialog-btn')
      .filter({hasText: 'Fit visible layers'}).click();
    await expect.poll(function() {
      return getView(page);
    }).toEqual({frame: 'Frame 1', layers: ['r1b']});
  });

  test('a frame without members can be given the visible layers', async function({page}) {
    await runCommand(page, '-rectangle bbox=0,0,1,1 name=r1 -rectangle bbox=0,0,2,2 name=r2 ' +
      '-frame bbox=0,0,2,2 width=400 name=f1', null);
    await openLayersPanel(page);
    await openRowMenu(page, page.locator('.frame-item').filter({hasText: 'f1'}));
    await page.locator('.contextmenu-item')
      .filter({hasText: 'move visible layers into frame'}).click();
    await expect.poll(async function() {
      return (await getSessionCommands(page)).pop();
    }).toBe('-frame target=f1 add-layers=r1,r2');
    await expect(page.locator('.frame-members .layer-name')).toHaveText(['r2', 'r1']);
    await expect(page.locator('.layer-list .layer-item')).toHaveCount(0);
  });
});

test.describe('new layers in frame view', function() {
  test.beforeEach(async function({page}) {
    await page.goto('/?undo=on&undo-test=on&files=' +
      encodeURIComponent('test/data/geojson/three_points.geojson'));
    await page.waitForFunction(function() {
      return window.mapshaper && window.mapshaper.undoTest &&
        window.mapshaper.undoTest.getState().model.datasetCount > 0;
    });
    await runCommand(page, '-frame target=three_points width=400 name=f1', null);
  });

  test('a file imported while a frame is shown stays out of the frame', async function({page}) {
    await page.locator('input[type="file"]').last()
      .setInputFiles('test/data/geojson/one_point.geojson');
    await page.locator('#import-options .submit-btn').click();
    await expect.poll(async function() {
      return (await getSessionCommands(page)).pop();
    }).toBe('-i one_point.geojson');
    await expect.poll(function() {
      return getView(page);
    }).toEqual({frame: null, layers: ['one_point']});
  });

  test('an empty Layers section says that all layers are in frames', async function({page}) {
    await openLayersPanel(page);
    await expect(page.locator('.unframed-empty-note')).toBeVisible();
    await page.locator('.unframed-section .section-toggle').click();
    await expect(page.locator('.unframed-empty-note')).toBeHidden();
  });

  test('a layer added with -add-layer goes into the frame', async function({page}) {
    await runCommand(page, '-add-layer geometry-type=point name=pts', null);
    expect(await getView(page)).toEqual({frame: 'f1', layers: ['pts', 'three_points']});
  });
});

test.describe('export dialog with frames', function() {
  test.beforeEach(async function({page}) {
    // the Export button is shown once a file has been imported
    await page.goto('/?undo=on&undo-test=on&files=' +
      encodeURIComponent('test/data/geojson/three_points.geojson'));
    await page.waitForFunction(function() {
      return window.mapshaper && window.mapshaper.undoTest &&
        window.mapshaper.undoTest.getState().model.datasetCount > 0;
    });
    await runCommand(page, TWO_FRAMES + ' -frame target=f1 hide-layers=r3', null);
    await page.locator('.export-btn').click();
    await expect(page.locator('.export-options')).toBeVisible();
  });

  test('map formats export each frame with its visible layers', async function({page}) {
    await expect(page.locator('.export-formats input:checked')).toHaveValue('svg');
    await expect(exportRow(page, 'r2').locator('input')).not.toBeChecked();
    await expect(page.locator('.export-frame-count'))
      .toHaveText(['0 of 2 layers', '1 of 2 layers', '1 of 1 layer']);
    await expect(page.locator('.export-frame-group.closed')).toHaveCount(3);

    var download = await exportDownload(page);
    var zip = new AdmZip(await download.path());
    var names = zip.getEntries().map(function(entry) { return entry.entryName; }).sort();
    expect(names).toEqual(['f1.svg', 'f2.svg']);
    var svg = zip.readAsText('f1.svg');
    expect(svg).toContain('id="r1"');
    expect(svg).not.toContain('id="r3"');
  });

  test('data formats start with the layers on show in the current view', async function({page}) {
    // r4, the last layer created, is selected, so f2 is shown
    await page.locator('.export-formats input[value="geojson"]').check();
    await expect(page.locator('.export-frame-count'))
      .toHaveText(['0 of 2 layers', '0 of 2 layers', '1 of 1 layer']);
    await expect(exportRow(page, 'r2').locator('input')).not.toBeChecked();
  });

  test('a frame\'s checkbox checks all of its layers', async function({page}) {
    var group = page.locator('.export-frame-group').filter({hasText: 'f1'});
    await group.locator('.export-frame-row input').check();
    await expect(group.locator('.export-frame-count')).toHaveText('2 of 2 layers');
  });

  test('a snapshot shows that the whole project is included', async function({page}) {
    var content = page.locator('.export-layers');
    var checkboxes = content.locator('input[type="checkbox"]');
    await expect(exportRow(page, 'r2').locator('input')).not.toBeChecked();
    await page.locator('.export-formats input[value="msx"]').check();
    await expect(content).toBeVisible();
    await expect(content).toHaveClass(/all-content-included/);
    expect(await checkboxes.count()).toBeGreaterThan(0);
    expect(await checkboxes.evaluateAll(function(nodes) {
      return nodes.every(function(node) { return node.checked && node.disabled; });
    })).toBe(true);
    await page.locator('.export-formats input[value="svg"]').check();
    await expect(exportRow(page, 'r2').locator('input')).not.toBeChecked();
    expect(await checkboxes.evaluateAll(function(nodes) {
      return nodes.every(function(node) { return !node.disabled; });
    })).toBe(true);
  });
});

test.describe('snapshot view settings', function() {
  test.beforeEach(async function({page}) {
    await page.goto('/?undo=on&undo-test=on&files=' +
      encodeURIComponent('test/data/geojson/three_points.geojson'));
    await page.waitForFunction(function() {
      return window.mapshaper && window.mapshaper.undoTest &&
        window.mapshaper.undoTest.getState().model.datasetCount > 0;
    });
    await runCommand(page, TWO_FRAMES, null);
    await openLayersPanel(page);
    // f1 in preview, its selected layer's eye off, and f2's section closed
    await selectLayer(page, 'r1');
    await memberRow(page, 'r1').locator('.eye-btn').first().click({force: true});
    await page.locator('.frame-section').filter({hasText: 'f2'}).locator('.section-toggle').click();
    await page.locator('.preview-toggle').click();
  });

  test('a snapshot that starts a session opens with the view it was saved with', async function({page}) {
    var file = await saveSnapshotFile(page, test.info());
    await page.goto('/?undo=on&undo-test=on');
    await page.waitForFunction(function() { return window.mapshaper && window.mapshaper.undoTest; });
    await page.locator('input[type="file"]').last().setInputFiles(file);
    await page.waitForFunction(function() {
      return window.mapshaper.undoTest.getState().model.datasetCount > 0;
    });
    await openLayersPanel(page);
    expect(await getView(page)).toEqual({frame: 'f1', layers: ['r1', 'r3']});
    await expect(page.locator('.preview-toggle')).toHaveClass(/selected/);
    await expect(memberRow(page, 'r1')).toHaveClass(/invisible/);
    await expect(page.locator('.frame-section.closed')).toHaveText(/f2/);
    await expect(page.locator('.frame-section.closed')).toHaveCount(1);
  });

  test('a snapshot opened partway through a session leaves the view alone', async function({page}) {
    var file = await saveSnapshotFile(page, test.info());
    await page.locator('.preview-toggle').click();
    await page.locator('.frame-section.closed .section-toggle').click();
    await page.locator('input[type="file"]').last().setInputFiles(file);
    await expect.poll(function() {
      return page.evaluate(function() {
        return window.mapshaper.undoTest.getState().model.datasetCount;
      });
    }).toBeGreaterThan(5);
    await expect(page.locator('.preview-toggle')).not.toHaveClass(/selected/);
    await expect(page.locator('.frame-section.closed')).toHaveCount(0);
  });
});

async function saveSnapshotFile(page, info) {
  await page.locator('.export-btn').click();
  await page.locator('.export-formats input[value="msx"]').check();
  var download = await exportDownload(page);
  var file = info.outputPath('snapshot.msx');
  await download.saveAs(file);
  return file;
}

function exportRow(page, name) {
  return page.locator('.export-layer-list .layer-item').filter({hasText: name});
}

async function exportDownload(page) {
  var downloadPromise = page.waitForEvent('download');
  await page.locator('.export-options #export-btn').click();
  return downloadPromise;
}

async function openRowMenu(page, row) {
  await row.hover();
  await row.locator('.more-btn').click();
}

function memberRow(page, name) {
  return page.locator('.frame-members .layer-item').filter({hasText: name});
}

// @frac: where on the target row the button is released, from its top
async function dragRow(page, from, to, frac) {
  var a = await from.boundingBox();
  var b = await to.boundingBox();
  await page.mouse.move(a.x + 40, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 40, a.y + a.height / 2 + 5, {steps: 3});
  await page.mouse.move(b.x + 40, b.y + b.height * frac, {steps: 8});
  await page.mouse.up();
}

async function waitForDraw(page) {
  await page.evaluate(function() {
    return new Promise(function(resolve) {
      requestAnimationFrame(function() { requestAnimationFrame(resolve); });
    });
  });
}

async function getSessionCommands(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory().commands;
  });
}

async function selectLayer(page, name) {
  await page.evaluate(function(name) {
    window.mapshaper.undoTest.selectLayer(name);
  }, name);
}

async function getView(page) {
  return page.evaluate(function() {
    var api = window.mapshaper.undoTest;
    var frame = api.getFrameInfo();
    return {frame: frame ? frame.name : null, layers: api.getVisibleLayerNames().sort()};
  });
}

async function runCommand(page, command, signatureBefore) {
  await page.evaluate(function(str) {
    return window.mapshaper.undoTest.runCommand(str);
  }, command);
  await expect.poll(function() {
    return getSignature(page);
  }).not.toBe(signatureBefore);
}

// the model checksum plus the stacking order (which the checksum leaves out)
async function getSignature(page) {
  return page.evaluate(function() {
    var model = window.mapshaper.undoTest.getState().model;
    if (model.datasetCount === 0) return null;
    return model.checksum + ' ' + model.datasets.map(function(d) {
      return d.layers.map(function(lyr) { return lyr.name + ':' + lyr.menu_order; }).join(',');
    }).join('|');
  });
}
