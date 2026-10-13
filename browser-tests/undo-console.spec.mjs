import { expect, test } from '@playwright/test';
import { openLayersPanel } from './sidebar-helpers.mjs';

var POINT_FIXTURE = 'test/data/geojson/three_points.geojson';
var LINE_FIXTURE = 'test/data/features/clean/ex20_ogc_line.json';
var POLYGON_FIXTURE = 'test/data/features/dissolve2/ex3_two_polygons.json';
var MULTIPOLYGON_FIXTURE = 'test/data/features/clean/ex11_ogc.geojson';
// feature 1 is an open line, which SNIP_CUT divides at its second vertex
var SNIP_FIXTURE = 'test/data/features/snip/ring_and_line.json';
var SNIP_CUT = {seq: 0, offset: 1, point: null, displayPoint: null, t: 0};
var CLIP_FIXTURES = 'test/data/features/clip/ex1_outer.json,test/data/features/clip/ex1_inner3.json';
var KEY_JOIN_FIXTURES = 'test/data/features/join/key_target.csv,test/data/features/join/key_source.csv';
var DATA_FILL_FIXTURE = 'test/data/features/data-fill/simple.geojson';
var POLYGONS_FIXTURE = 'test/data/features/polygons/ia_county_lines.json';
var GAP_PARTITION_FIXTURE = 'test/data/features/clean/ex24_three_state_internal_gap.json';

var COMMAND_CASES = [{
  name: 'record expression edit',
  command: 'each \'foo = "bar"\''
}, {
  name: 'polygon data fill',
  command: 'data-fill field=state',
  fixture: DATA_FILL_FIXTURE,
  noPayloadTypes: ['table']
}, {
  name: 'attribute join',
  command: 'join key_source target=key_target keys=id,id',
  fixture: KEY_JOIN_FIXTURES,
  payloadTypes: ['table-schema', 'table-fields'],
  noPayloadTypes: ['table']
}, {
  name: 'svg point symbols',
  command: 'symbols type=circle radius=5 fill=red',
  payloadTypes: ['table-schema', 'table-fields'],
  noPayloadTypes: ['table']
}, {
  name: 'polygon reprojection',
  command: 'proj webmercator',
  fixture: POLYGON_FIXTURE,
  payloadTypes: ['arcs'],
  noPayloadTypes: ['layer']
}, {
  name: 'layer splitting',
  command: 'split region'
}, {
  name: 'polyline simplification',
  command: 'simplify 50% planar no-repair',
  fixture: LINE_FIXTURE,
  payloadTypes: ['arcs-simplification'],
  noPayloadTypes: ['arcs']
}, {
  name: 'geometry cleaning',
  command: 'clean',
  fixture: LINE_FIXTURE
}, {
  name: 'map frame creation',
  command: 'frame width=800px'
}, {
  name: 'scale bar creation',
  command: 'frame width=800px -scalebar 100km'
}, {
  name: 'polygon dissolving',
  command: 'dissolve no-repair',
  fixture: POLYGON_FIXTURE
}, {
  name: 'polygon clipping',
  command: 'clip ex1_inner3 target=ex1_outer',
  fixture: CLIP_FIXTURES,
  maxUndoPayloadCounts: {arcs: 1}
}, {
  name: 'layer merging',
  command: 'split region -merge-layers target=* force'
}];

COMMAND_CASES.forEach(function(item) {
  test('console undo/redo restores model checksum after ' + item.name, async function({page}) {
    await loadFixture(page, item.fixture);

    var before = await getUndoState(page);

    await runConsoleCommand(page, item.command);

    var changed = await getUndoState(page);
    expect(changed.model.checksum).not.toBe(before.model.checksum);
    expect(changed.undo.canUndo).toBe(true);
    if (item.payloadTypes) {
      item.payloadTypes.forEach(function(type) {
        expect(changed.payloadStore.ownPayloads.some(function(payload) {
          return payload.unitType == type;
        })).toBe(true);
      });
    }
    if (item.noPayloadTypes) {
      item.noPayloadTypes.forEach(function(type) {
        expect(changed.payloadStore.ownPayloads.some(function(payload) {
          return payload.unitType == type;
        })).toBe(false);
      });
    }
    assertMaxUndoPayloadCounts(changed, Object.assign({arcs: 1}, item.maxUndoPayloadCounts || {}));

    await page.evaluate(function() {
      return window.mapshaper.undoTest.undo();
    });
    await expect.poll(async function() {
      return (await getUndoState(page)).model.checksum;
    }).toBe(before.model.checksum);

    var undone = await getUndoState(page);
    expect(undone.undo.canRedo).toBe(true);

    await page.evaluate(function() {
      return window.mapshaper.undoTest.redo();
    });
    await expect.poll(async function() {
      return (await getUndoState(page)).model.checksum;
    }).toBe(changed.model.checksum);
  });
});

test('console undo/redo treats a submitted command sequence as one change', async function({page}) {
  await loadFixture(page);

  var before = await getUndoState(page);

  await runConsoleCommand(page, '-each \'foo = "bar"\' -each \'bar = "baz"\'');

  var changed = await getUndoState(page);
  expect(changed.model.checksum).not.toBe(before.model.checksum);
  expect(changed.undo.canUndo).toBe(true);
  expect(changed.undo.canRedo).toBe(false);

  var commandPayloads = changed.payloadStore.ownPayloads.filter(function(item) {
    return item.entryId == 'command-1';
  });
  expect(commandPayloads.filter(isUndoTablePayload)).toHaveLength(1);
  expect(commandPayloads.filter(isRedoTablePayload)).toHaveLength(0);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(before.model.checksum);

  var undone = await getUndoState(page);
  expect(undone.undo.canUndo).toBe(false);
  expect(undone.undo.canRedo).toBe(true);
  commandPayloads = undone.payloadStore.ownPayloads.filter(function(item) {
    return item.entryId == 'command-1';
  });
  expect(commandPayloads.filter(isUndoTablePayload)).toHaveLength(1);
  expect(commandPayloads.filter(isRedoTablePayload)).toHaveLength(1);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.redo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(changed.model.checksum);
});

test('new undo states evict older payloads when session storage is full', async function({page}) {
  await loadFixture(page);

  await runConsoleCommand(page, '-each \'foo = "bar"\'');
  var firstBytes = (await getUndoState(page)).payloadStore.ownBytes;
  expect(firstBytes).toBeGreaterThan(0);

  await loadFixture(page, POINT_FIXTURE, {undoStorageMaxBytes: firstBytes * 2 - 1});
  await runConsoleCommand(page, '-each \'foo = "bar"\'');
  var firstState = await getUndoState(page);

  await runConsoleCommand(page, '-each \'foo = "baz"\'');
  var secondState = await getUndoState(page);
  expect(secondState.undo.canUndo).toBe(true);
  expect(secondState.payloadStore.ownBytes).toBeLessThanOrEqual(firstBytes * 2 - 1);
  expect(secondState.payloadStore.ownPayloads.some(function(payload) {
    return payload.entryId == 'command-1';
  })).toBe(false);
  expect(secondState.payloadStore.ownPayloads.some(function(payload) {
    return payload.entryId == 'command-2';
  })).toBe(true);
  expect(await getUndoMessages(page)).toEqual(expect.arrayContaining([
    expect.objectContaining({
      severity: 'warn',
      title: 'Older undo history was discarded'
    })
  ]));

  expect(secondState.model.checksum).not.toBe(firstState.model.checksum);
});

// Undo history is bounded by the size of the stored restore data, not by a
// number of entries, so a long run of small commands stays undoable.
test('undo history is not capped by a number of states', async function({page}) {
  var count = 25;
  var i;
  await loadFixture(page);

  var before = await getUndoState(page);
  for (i = 0; i < count; i++) {
    await runConsoleCommand(page, '-each \'foo = ' + i + '\'');
  }
  expect((await getUndoState(page)).payloadStore.ownPayloads.some(function(payload) {
    return payload.entryId == 'command-1';
  })).toBe(true);

  for (i = 0; i < count; i++) {
    await page.evaluate(function() {
      return window.mapshaper.undoTest.undo();
    });
  }
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(before.model.checksum);
  expect((await getUndoState(page)).undo.canUndo).toBe(false);
});

test('polygon reprojection stores one arcs payload and no layer payload', async function({page}) {
  await loadFixture(page, POLYGON_FIXTURE);

  await runConsoleCommand(page, 'proj webmercator');

  var state = await getUndoState(page);
  var commandPayloads = state.payloadStore.ownPayloads.filter(function(item) {
    return item.entryId == 'command-1';
  });
  expect(commandPayloads.filter(function(item) {
    return item.role == 'undo' && item.unitType == 'arcs';
  })).toHaveLength(1);
  expect(commandPayloads.filter(function(item) {
    return item.role == 'undo' && item.unitType == 'layer';
  })).toHaveLength(0);
  expect(commandPayloads.filter(function(item) {
    return item.role == 'redo';
  })).toHaveLength(0);
});

// Undo has to put back the arc collection itself, not just its coordinates.
// Restoring coordinates into a collection the dataset no longer refers to left
// the layer's shapes pointing at arc ids from a collection that had been merged
// and dissolved, and cleaning again dropped most of the features as empty.
test('cleaning again after an undo repeats the same result', async function({page}) {
  await loadFixture(page, GAP_PARTITION_FIXTURE);

  var before = await getUndoState(page);
  var featureCount = before.model.datasets[0].layers[0].shapeCount;

  await runConsoleCommand(page, 'clean gap-width=250m');
  var cleaned = await getUndoState(page);
  expect(cleaned.model.checksum).not.toBe(before.model.checksum);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(before.model.checksum);

  await runConsoleCommand(page, 'clean gap-width=250m');
  var recleaned = await getUndoState(page);
  expect(recleaned.model.datasets[0].layers[0].shapeCount).toBe(featureCount);
  expect(recleaned.model.checksum).toBe(cleaned.model.checksum);
});

test('repeated clean does not store unchanged arcs payloads', async function({page}) {
  await loadFixture(page, MULTIPOLYGON_FIXTURE);

  await runConsoleCommand(page, 'clean');
  await runConsoleCommand(page, 'clean');

  var state = await getUndoState(page);
  var secondCleanPayloads = state.payloadStore.ownPayloads.filter(function(item) {
    return item.entryId == 'command-2';
  });
  expect(secondCleanPayloads.filter(function(item) {
    return item.role == 'undo' && item.unitType == 'arcs';
  })).toHaveLength(0);
});

test('interaction mode changes preserve command undo history', async function({page}) {
  await loadFixture(page, POLYGON_FIXTURE);

  var polygonState = await getUndoState(page);

  await runConsoleCommand(page, 'lines');
  var lineState = await getUndoState(page);
  expect(lineState.model.datasets[0].layers[0].geometry_type).toBe('polyline');

  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('info');
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).undo.canUndo;
  }).toBe(true);

  await runConsoleCommand(page, 'points vertices');
  var pointState = await getUndoState(page);
  expect(pointState.model.datasets[0].layers[0].geometry_type).toBe('point');

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(lineState.model.checksum);
  expect((await getUndoState(page)).undo.canUndo).toBe(true);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(polygonState.model.checksum);
});

test('completed snip edit session becomes one preserved app undo state', async function({page}) {
  await loadFixture(page, SNIP_FIXTURE);

  var initialState = await getUndoState(page);

  await runConsoleCommand(page, '-each \'foo = "bar"\'');
  var commandState = await getUndoState(page);
  expect(commandState.model.checksum).not.toBe(initialState.model.checksum);

  await page.evaluate(function(cut) {
    window.mapshaper.undoTest.setInteractionMode('snip_lines');
    window.mapshaper.undoTest.snipActiveLayerPath(1, 0, [cut]);
    window.mapshaper.undoTest.setInteractionMode('off');
  }, SNIP_CUT);
  await expect.poll(async function() {
    return (await getUndoState(page)).payloadStore.ownPayloads.some(function(payload) {
      return /^edit-session-/.test(payload.entryId || '');
    });
  }).toBe(true);

  var editState = await getUndoState(page);
  expect(editState.model.datasets[0].layers[0].shapeCount).toBe(commandState.model.datasets[0].layers[0].shapeCount + 1);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(commandState.model.checksum);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(initialState.model.checksum);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.redo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(commandState.model.checksum);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.redo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(editState.model.checksum);
});

test('empty layer creation is undoable before the points added to it', async function({page}) {
  await loadFixture(page, POINT_FIXTURE);

  var initialState = await getUndoState(page);

  await addEmptyPointLayer(page);
  await expect.poll(async function() {
    return (await getUndoState(page)).model.layerCount;
  }).toBe(initialState.model.layerCount + 1);

  var emptyLayerState = await getUndoState(page);
  expect(emptyLayerState.undo.canUndo).toBe(true);
  expect(getLayerSummary(emptyLayerState.model, 'points').shapeCount).toBe(0);

  await page.evaluate(async function() {
    window.mapshaper.undoTest.setInteractionMode('edit_points');
    await window.mapshaper.undoTest.addPointToActiveLayer([10, 20]);
    window.mapshaper.undoTest.setInteractionMode('off');
  });

  var editedLayerState = await getUndoState(page);
  expect(getLayerSummary(editedLayerState.model, 'points').shapeCount).toBe(1);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(emptyLayerState.model.checksum);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(initialState.model.checksum);
});

test('layer menu delete is undoable', async function({page}) {
  await loadFixture(page, POINT_FIXTURE + ',' + POLYGON_FIXTURE);

  var initialState = await getUndoState(page);
  expect(initialState.model.layerCount).toBe(2);

  await deleteFirstLayerFromLayerMenu(page);
  await expect.poll(async function() {
    return (await getUndoState(page)).model.layerCount;
  }).toBe(1);

  var deletedState = await getUndoState(page);
  expect(deletedState.model.checksum).not.toBe(initialState.model.checksum);
  expect(deletedState.undo.canUndo).toBe(true);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(initialState.model.checksum);
});

test('layer menu rename is undoable', async function({page}) {
  await loadFixture(page, POINT_FIXTURE);

  var initialState = await getUndoState(page);
  var originalName = initialState.model.datasets[0].layers[0].name;

  await renameFirstLayerFromLayerMenu(page, 'renamed_from_menu');
  await expect.poll(async function() {
    return (await getUndoState(page)).model.datasets[0].layers[0].name;
  }).toBe('renamed_from_menu');

  var renamedState = await getUndoState(page);
  expect(renamedState.model.checksum).not.toBe(initialState.model.checksum);
  await expect.poll(async function() {
    return (await getUndoState(page)).undo.canUndo;
  }).toBe(true);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.datasets[0].layers[0].name;
  }).toBe(originalName);
  expect((await getUndoState(page)).model.checksum).toBe(initialState.model.checksum);
});

test('simplify tool creates one undo state when closed', async function({page}) {
  await loadFixture(page, LINE_FIXTURE);

  var initialState = await getUndoState(page);

  await page.evaluate(function() {
    window.mapshaper.undoTest.setPanelMode('simplify');
  });
  await page.locator('.simplify-options .submit-btn').click();
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).not.toBe(initialState.model.checksum);
  expect((await getUndoState(page)).undo.canUndo).toBe(false);

  var simplifiedState = await getUndoState(page);
  await page.evaluate(function() {
    window.mapshaper.undoTest.setPanelMode(null);
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).undo.canUndo;
  }).toBe(true);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(initialState.model.checksum);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.redo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(simplifiedState.model.checksum);
});

test('simplify tool does not create undo state when unchanged', async function({page}) {
  await loadFixture(page, LINE_FIXTURE);

  var initialState = await getUndoState(page);

  await page.evaluate(function() {
    window.mapshaper.undoTest.setPanelMode('simplify');
    window.mapshaper.undoTest.setPanelMode(null);
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(initialState.model.checksum);
  expect((await getUndoState(page)).undo.canUndo).toBe(false);
});

test('snapshot restore clears app undo history', async function({page}) {
  await loadFixture(page, POINT_FIXTURE);

  var snapshotState = await getUndoState(page);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.saveSnapshot();
  });

  await runConsoleCommand(page, '-each \'foo = "bar"\'');
  expect((await getUndoState(page)).undo.canUndo).toBe(true);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.restoreLatestSnapshot();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(snapshotState.model.checksum);
  expect((await getUndoState(page)).undo.canUndo).toBe(false);
  expect((await getUndoState(page)).undo.canRedo).toBe(false);
});

test('subsequent GUI file import is undoable', async function({page}) {
  await loadFixture(page, POINT_FIXTURE);

  var initialState = await getUndoState(page);
  await importAdditionalFile(page, POLYGON_FIXTURE, {submit: true});
  await expect.poll(async function() {
    return (await getUndoState(page)).model.layerCount;
  }).toBe(initialState.model.layerCount + 1);
  await expect.poll(async function() {
    return (await getUndoState(page)).undo.canUndo;
  }).toBe(true);

  var importedState = await getUndoState(page);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(initialState.model.checksum);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.redo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(importedState.model.checksum);
});

test('initial GUI file import is not undoable', async function({page}) {
  await loadBlankSession(page);

  await importAdditionalFile(page, POINT_FIXTURE, {submit: false});
  await expect.poll(async function() {
    return (await getUndoState(page)).model.layerCount;
  }).toBe(1);
  expect((await getUndoState(page)).undo.canUndo).toBe(false);
});

test('undoing initial rectangle creation clears the map display', async function({page}) {
  await assertInitialRectangleUndoClearsDisplay(page, "-rectangle + bbox='-80,30,-70,40'");
});

test('undoing initial frame creation clears preview without disabling frame creation', async function({page}) {
  await loadBlankSession(page);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand(
      "-rectangle + name=frame bbox='-80,30,-70,40' width='600px'"
    );
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.layerCount;
  }).toBe(1);
  await expect(page.locator('.preview-toggle')).not.toHaveClass(/disabled/);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.layerCount;
  }).toBe(0);
  await expect(page.locator('.preview-toggle')).not.toHaveClass(/disabled/);
  await expect(page.locator('.preview-readout')).toBeHidden();
});

async function assertInitialRectangleUndoClearsDisplay(page, command) {
  await loadBlankSession(page);

  await page.evaluate(function(str) {
    return window.mapshaper.undoTest.runCommand(str);
  }, command);
  await expect.poll(async function() {
    return (await getUndoState(page)).model.layerCount;
  }).toBe(1);
  await expect.poll(async function() {
    return await getMainCanvasPixelCount(page);
  }).toBeGreaterThan(0);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.layerCount;
  }).toBe(0);
  await expect.poll(async function() {
    return await getMainCanvasPixelCount(page);
  }).toBe(0);
}

test('command history follows undo redo and branching', async function({page}) {
  await loadFixture(page, POLYGON_FIXTURE);

  await runConsoleCommand(page, 'lines');
  await runConsoleCommand(page, 'points vertices');

  await expect.poll(async function() {
    return await getSessionCommands(page);
  }).toEqual(expect.arrayContaining(['-lines', '-points vertices']));

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return await getSessionCommands(page);
  }).toEqual(expect.not.arrayContaining(['-points vertices']));
  expect(await getSessionCommands(page)).toEqual(expect.arrayContaining(['-lines']));

  await page.evaluate(function() {
    return window.mapshaper.undoTest.redo();
  });
  await expect.poll(async function() {
    return await getSessionCommands(page);
  }).toEqual(expect.arrayContaining(['-lines', '-points vertices']));

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await runConsoleCommand(page, 'rename-layers branch');
  var commands = await getSessionCommands(page);
  expect(commands).toEqual(expect.arrayContaining(['-lines', '-rename-layers branch']));
  expect(commands).toEqual(expect.not.arrayContaining(['-points vertices']));
  expect((await getUndoState(page)).undo.canRedo).toBe(false);
});

test('undo restores path layers after merging multiple datasets', async function({page}) {
  await loadFixture(page, LINE_FIXTURE + ',' + POLYGONS_FIXTURE);

  var before = await getUndoState(page);

  await runConsoleCommand(page, '-merge-layers target=* force');

  var merged = await getUndoState(page);
  expect(merged.model.layerCount).toBe(1);
  expect(merged.model.checksum).not.toBe(before.model.checksum);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(before.model.checksum);

  var restored = await getUndoState(page);
  restored.model.datasets.forEach(function(dataset) {
    expect(dataset.arcCount).toBeGreaterThan(0);
    dataset.layers.forEach(function(layer) {
      expect(layer.geometry_type).toBe('polyline');
      expect(layer.shapeCount).toBeGreaterThan(0);
    });
  });
});

test('keyboard shortcuts undo and redo console command history', async function({page}) {
  await loadFixture(page);

  var before = await getUndoState(page);

  await runConsoleCommand(page, '-each \'foo = "bar"\'');

  var changed = await getUndoState(page);
  expect(changed.model.checksum).not.toBe(before.model.checksum);

  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(before.model.checksum);

  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(changed.model.checksum);
});

test('history menu toggles persisted app undo and reports restore data', async function({page}) {
  await loadFixture(page, POINT_FIXTURE, {undo: null});

  await page.evaluate(function() {
    window.localStorage.removeItem('mapshaper.undo');
  });

  // With nothing stored, undo is on: commands are undoable and the box is ticked.
  await page.locator('.history-btn').click();
  await expect(page.locator('.history-toggle-btn')).toContainText('enable undo');
  await expect(page.locator('.history-undo-checkbox')).toBeChecked();

  // Unticking is persisted as an explicit opt-out and stops undo capture.
  await page.locator('.history-toggle-btn').click();
  expect(await page.evaluate(function() {
    return window.localStorage.getItem('mapshaper.undo');
  })).toBe('off');
  await expect(page.locator('.history-undo-checkbox')).not.toBeChecked();
  await page.keyboard.press('Escape');

  await runConsoleCommand(page, '-each \'foo = "bar"\'', {waitForUndo: false});
  expect((await getUndoState(page)).undo.canUndo).toBe(false);

  await loadFixture(page, POINT_FIXTURE, {undo: null});
  var before = await getUndoState(page);

  await page.locator('.history-btn').click();
  // the opt-out survived the reload
  await expect(page.locator('.history-undo-checkbox')).not.toBeChecked();
  await page.locator('.history-toggle-btn').click();
  expect(await page.evaluate(function() {
    return window.localStorage.getItem('mapshaper.undo');
  })).toBe('on');
  await expect(page.locator('.history-undo-checkbox')).toBeChecked();
  await page.keyboard.press('Escape');

  await runConsoleCommand(page, '-each \'foo = "bar"\'');

  var changed = await getUndoState(page);
  expect(changed.model.checksum).not.toBe(before.model.checksum);

  await page.locator('.history-btn').click();
  await expect(page.locator('.history-menu-note')).toContainText(/restore data stored on-disk: [0-9]/);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(before.model.checksum);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.redo();
  });
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(changed.model.checksum);

  await loadFixture(page, POINT_FIXTURE, {undo: null});
  await runConsoleCommand(page, '-each \'bar = "baz"\'');
  expect((await getUndoState(page)).undo.canUndo).toBe(true);
});

test('turning undo off mid-session throws away what was recorded', async function({page}) {
  // Whatever is in the history was captured while edits were being recorded.
  // From the moment the setting goes off they are not, so undoing one of those
  // states would restore the data as it stood before the untracked edits and
  // take them back without saying so.
  // the setting has to come from the menu, not the URL, which pins the toggle
  await loadFixture(page, POINT_FIXTURE, {undo: null});
  await page.evaluate(function() {
    window.localStorage.removeItem('mapshaper.undo');
  });
  await runConsoleCommand(page, '-each \'foo = "bar"\'');
  expect((await getUndoState(page)).undo.canUndo).toBe(true);

  await page.locator('.history-btn').click();
  await expect(page.locator('.history-undo-checkbox')).toBeChecked();
  await page.locator('.history-toggle-btn').click();

  expect((await getUndoState(page)).undo.canUndo).toBe(false);
  await expect(page.locator('.history-menu-note')).toContainText('Turn on undo before');
  await expect.poll(async function() {
    return (await getUndoState(page)).payloadStore.ownBytes;
  }).toBe(0);
  await page.keyboard.press('Escape');

  // and the toolbar goes with it: it shows itself for any history it can see,
  // whether or not the setting is on
  await expect(page.locator('.floating-toolbar.edit-toolbar')).toBeHidden();
});

test('a command that is not recorded clears interaction undo history', async function({page}) {
  // Interaction undo records itself whether or not the setting is on, so with
  // undo off a drag, a command and another drag would leave a history that
  // quietly spans the command -- and undoing back across it would revert the
  // command's edits too.
  await loadFixture(page, SNIP_FIXTURE, {undo: 'off'});
  expect(await page.evaluate(function() {
    return window.mapshaper.undoTest.appUndoIsEnabled();
  })).toBe(false);

  await page.evaluate(function(cut) {
    window.mapshaper.undoTest.setInteractionMode('snip_lines');
    window.mapshaper.undoTest.snipActiveLayerPath(1, 0, [cut]);
  }, SNIP_CUT);
  await expect.poll(async function() {
    return (await getUndoState(page)).undo.canUndo;
  }).toBe(true);

  await runConsoleCommand(page, '-each \'foo = "bar"\'', {waitForUndo: false});

  expect((await getUndoState(page)).undo.canUndo).toBe(false);
});

test('console undo disables history cleanly when payload exceeds storage limit', async function({page}) {
  await loadFixture(page, POINT_FIXTURE, {undoPayloadMaxBytes: 1});

  var before = await getUndoState(page);

  await runConsoleCommand(page, '-each \'foo = "bar"\'', {waitForUndo: false});

  var changed = await getUndoState(page);
  expect(changed.model.checksum).not.toBe(before.model.checksum);
  expect(changed.undo.canUndo).toBe(false);
  expect(changed.undo.canRedo).toBe(false);
  expect(changed.payloadStore.ownPayloadCount).toBe(0);
  expect(changed.payloadStore.ownBytes).toBe(0);
  await expect(page.locator('.console-warn')).toContainText('Undo state was not saved');
  expect(await getUndoMessages(page)).toEqual(expect.arrayContaining([
    expect.objectContaining({
      severity: 'warn',
      title: 'Undo state was not saved'
    })
  ]));
});

async function loadFixture(page, fixture, queryOpts) {
  var params = Object.assign({
    undo: 'on',
    'undo-test': 'on',
    files: fixture || POINT_FIXTURE
  }, queryOpts || {});
  var url = '/?' + Object.keys(params).map(function(key) {
    if (params[key] === null || params[key] === undefined) return null;
    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
  }).filter(Boolean).join('&');
  await page.goto(url);
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

async function loadBlankSession(page) {
  await page.goto('/?undo=on&undo-test=on');
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest;
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.clearUndoHistory();
  });
}

async function getUndoState(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getState();
  });
}

async function getSessionCommands(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory().commands;
  });
}

async function getUndoMessages(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getMessages();
  });
}

async function runConsoleCommand(page, command, opts) {
  await page.evaluate(function(str) {
    return window.mapshaper.undoTest.runCommand(str);
  }, command);
  if (opts && opts.waitForUndo === false) return;
  await expect.poll(async function() {
    return (await getUndoState(page)).undo.canUndo;
  }).toBe(true);
}

async function getMainCanvasPixelCount(page) {
  return page.evaluate(function() {
    var canvas = document.querySelector('.map-layers canvas');
    var ctx, data, count = 0;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return 0;
    ctx = canvas.getContext('2d', {willReadFrequently: true});
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (var i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) count++;
    }
    return count;
  });
}

// Makes an empty point layer the way the layer panel does, with the "Draw:
// points" link. The layer is named for the link that made it.
async function addEmptyPointLayer(page) {
  await openLayersPanel(page);
  await page.locator('.new-layer-links .layer-menu-link[data-kind="points"]')
    .click();
  await page.waitForTimeout(250);
}

async function deleteFirstLayerFromLayerMenu(page) {
  var layerItem;
  await openLayersPanel(page);
  layerItem = page.locator('.layer-list .layer-item').first();
  await layerItem.hover();
  await layerItem.locator('.more-btn').click();
  await page.locator('.contextmenu-item').filter({hasText: 'delete layer'}).click();
}

async function renameFirstLayerFromLayerMenu(page, name) {
  var nameItem;
  await openLayersPanel(page);
  nameItem = page.locator('.layer-list .layer-item .layer-name').first();
  await nameItem.click();
  await nameItem.fill(name);
  await nameItem.press('Enter');
}

async function importAdditionalFile(page, fixture, opts) {
  var submitBtn = page.locator('#import-options .submit-btn');
  opts = opts || {};
  await page.locator('input[type="file"]').last().setInputFiles(fixture);
  if (opts.submit !== false) {
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();
  }
}

function isUndoTablePayload(item) {
  return item.role == 'undo' && item.unitType == 'table';
}

function isRedoTablePayload(item) {
  return item.role == 'redo' && item.unitType == 'table';
}

function countPayloads(state, filter) {
  return state.payloadStore.ownPayloads.filter(function(item) {
    if (filter.role && item.role != filter.role) return false;
    if (filter.unitType && item.unitType != filter.unitType) return false;
    return true;
  }).length;
}

function assertMaxUndoPayloadCounts(state, counts) {
  Object.keys(counts).forEach(function(type) {
    var count = countPayloads(state, {role: 'undo', unitType: type});
    if (count > counts[type]) {
      throw new Error('Expected at most ' + counts[type] + ' undo ' + type +
        ' payload(s), got ' + count + ': ' + JSON.stringify(summarizePayloads(state)));
    }
  });
}

function summarizePayloads(state) {
  return state.payloadStore.ownPayloads.map(function(item) {
    return {
      entryId: item.entryId,
      role: item.role,
      unitType: item.unitType,
      size: item.size
    };
  });
}

function getLayerSummary(model, name) {
  var layer;
  model.datasets.some(function(dataset) {
    layer = dataset.layers.find(function(item) {
      return item.name == name;
    });
    return !!layer;
  });
  return layer;
}
