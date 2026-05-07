import { expect, test } from '@playwright/test';

var POINT_FIXTURE = 'test/data/three_points.geojson';
var LINE_FIXTURE = 'test/data/features/clean/ex20_ogc_line.json';
var POLYGON_FIXTURE = 'test/data/features/dissolve2/ex3_two_polygons.json';
var PROJECTED_POLYGON_FIXTURE = 'test/data/features/polygon_join/ex1_outer.json';
var MULTIPOLYGON_FIXTURE = 'test/data/features/clean/ex11_ogc.geojson';
var CLIP_FIXTURES = 'test/data/features/clip/ex1_outer.json,test/data/features/clip/ex1_inner3.json';
var KEY_JOIN_FIXTURES = 'test/data/features/join/key_target.csv,test/data/features/join/key_source.csv';
var DATA_FILL_FIXTURE = 'test/data/features/data-fill/simple.geojson';
var FUZZY_JOIN_FIXTURES = 'test/data/features/fuzzy_join/polys.geojson,test/data/features/fuzzy_join/points.geojson';
var FILTER_ISLANDS_FIXTURE = 'test/data/features/filter_islands/two_islands.geojson';
var DIVIDE_FIXTURES = 'test/data/features/divide/ex1_line.json,test/data/features/divide/ex1_polygon.json';
var INLAY_FIXTURES = 'test/data/features/inlay/ex1_outer.json,test/data/features/inlay/ex1_inner.json';
var MOSAIC_FIXTURE = 'test/data/features/mosaic/two_polygons.json';
var POLYGONS_FIXTURE = 'test/data/features/polygons/ia_county_lines.json';
var ALPHA_SHAPES_FIXTURE = 'test/data/features/alpha_shapes/points.geojson';

var COMMAND_CASES = [{
  name: 'record expression edit',
  command: 'each \'foo = "bar"\''
}, {
  name: 'calculated output layer',
  command: 'calc \'count()\' to-layer'
}, {
  name: 'field classification',
  command: 'classify scalerank save-as=rank_class values=low,high'
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
  name: 'polygon clustering',
  command: 'cluster id-field=cluster_id',
  fixture: POLYGON_FIXTURE,
  payloadTypes: ['table-schema', 'table-fields'],
  noPayloadTypes: ['table']
}, {
  name: 'fuzzy point-to-polygon join',
  command: 'fuzzy-join points target=polys field=d no-dropouts',
  fixture: FUZZY_JOIN_FIXTURES
}, {
  name: 'svg style fields',
  command: 'style fill=red stroke=blue',
  fixture: POLYGON_FIXTURE,
  payloadTypes: ['table-schema', 'table-fields'],
  noPayloadTypes: ['table']
}, {
  name: 'svg point symbols',
  command: 'symbols type=circle radius=5 fill=red',
  payloadTypes: ['table-schema', 'table-fields'],
  noPayloadTypes: ['table']
}, {
  name: 'field filtering',
  command: 'filter-fields name',
  payloadTypes: ['table-schema', 'table-fields'],
  noPayloadTypes: ['table']
}, {
  name: 'point reprojection',
  command: 'proj webmercator'
}, {
  name: 'polygon reprojection',
  command: 'proj webmercator',
  fixture: POLYGON_FIXTURE,
  payloadTypes: ['arcs'],
  noPayloadTypes: ['layer']
}, {
  name: 'point buffering',
  command: 'buffer 1km'
}, {
  name: 'point affine transform',
  command: 'affine shift=1,1'
}, {
  name: 'polygon affine transform',
  command: 'affine shift=1,1',
  fixture: POLYGON_FIXTURE,
  payloadTypes: ['arcs']
}, {
  name: 'spherical rotation',
  command: 'rotate 10,0',
  fixture: POLYGON_FIXTURE
}, {
  name: 'feature filtering',
  command: 'filter \'name != "Niagara Falls"\''
}, {
  name: 'filtered copy',
  command: 'filter + \'name != "Niagara Falls"\''
}, {
  name: 'point cluster filtering',
  command: 'filter-points group-interval=3000000'
}, {
  name: 'geometry bbox filtering',
  command: 'filter-geom bbox=-80,40,-78,44'
}, {
  name: 'layer splitting',
  command: 'split region'
}, {
  name: 'grid cell id assignment',
  command: 'split-on-grid 2,2 id-field=cell_id',
  payloadTypes: ['table-schema', 'table-fields'],
  noPayloadTypes: ['table']
}, {
  name: 'grid-based layer splitting',
  command: 'split-on-grid 2,2'
}, {
  name: 'field renaming',
  command: 'rename-fields label=name',
  payloadTypes: ['table-schema', 'table-fields'],
  noPayloadTypes: ['table']
}, {
  name: 'layer renaming',
  command: 'rename-layers renamed',
  noPayloadTypes: ['layer']
}, {
  name: 'feature sorting',
  command: 'sort name descending',
  noPayloadTypes: ['table', 'layer']
}, {
  name: 'duplicate removal',
  command: 'uniq region'
}, {
  name: 'field dropping',
  command: 'drop fields=comment'
}, {
  name: 'geometry dropping',
  command: 'drop geometry'
}, {
  name: 'island filtering',
  command: 'filter-islands min-area=1',
  fixture: FILTER_ISLANDS_FIXTURE
}, {
  name: 'island filtering v2',
  command: 'filter-islands2 min-area=1',
  fixture: FILTER_ISLANDS_FIXTURE
}, {
  name: 'sliver filtering',
  command: 'filter-slivers min-area=1',
  fixture: FILTER_ISLANDS_FIXTURE
}, {
  name: 'line dashing',
  command: 'dashlines dash-length=20 planar',
  fixture: LINE_FIXTURE
}, {
  name: 'polyline simplification',
  command: 'simplify 50% planar no-repair',
  fixture: LINE_FIXTURE,
  payloadTypes: ['arcs-simplification'],
  noPayloadTypes: ['arcs']
}, {
  name: 'variable polyline simplification',
  command: 'simplify variable percentage=\'"50%"\' planar',
  fixture: LINE_FIXTURE,
  payloadTypes: ['arcs']
}, {
  name: 'arc snapping by precision',
  command: 'snap precision=1',
  fixture: CLIP_FIXTURES
}, {
  name: 'geometry cleaning',
  command: 'clean',
  fixture: LINE_FIXTURE
}, {
  name: 'point layer copy from vertices',
  command: 'points + vertices',
  fixture: LINE_FIXTURE
}, {
  name: 'polygon replacement with points',
  command: 'points',
  fixture: POLYGON_FIXTURE,
  payloadTypes: ['layer']
}, {
  name: 'add shape to point layer',
  command: 'add-shape coordinates=-60,0'
}, {
  name: 'standalone shape creation',
  command: 'shape rectangle bbox=-80,-30,-50,45'
}, {
  name: 'polygon to line conversion',
  command: 'lines',
  fixture: POLYGON_FIXTURE
}, {
  name: 'path segment extraction',
  command: 'lines segments',
  fixture: POLYGON_FIXTURE
}, {
  name: 'polygon innerline extraction',
  command: 'innerlines +',
  fixture: POLYGON_FIXTURE
}, {
  name: 'rectangle copy from layer bounds',
  command: 'rectangle +',
  fixture: POLYGON_FIXTURE
}, {
  name: 'rectangles from features',
  command: 'rectangles'
}, {
  name: 'point grid copy',
  command: 'point-grid + 2,2',
  fixture: POLYGON_FIXTURE
}, {
  name: 'polygon grid copy',
  command: 'grid + interval=500',
  fixture: PROJECTED_POLYGON_FIXTURE
}, {
  name: 'test grid creation',
  command: 'grid2 interval=500',
  fixture: PROJECTED_POLYGON_FIXTURE
}, {
  name: 'point density grid',
  command: 'proj webmercator -point-to-grid interval=10000'
}, {
  name: 'graticule creation',
  command: 'graticule interval=30'
}, {
  name: 'dot density points',
  command: 'dots count',
  fixture: POLYGON_FIXTURE
}, {
  name: 'polyline polygonization',
  command: 'filter + \'TYPE == "outer"\' name=outline -polygons',
  fixture: POLYGONS_FIXTURE
}, {
  name: 'polyline ring polygonization',
  command: 'polygons from-rings',
  fixture: POLYGONS_FIXTURE,
  payloadTypes: ['layer']
}, {
  name: 'alpha shape generation',
  command: 'alpha-shapes interval=200000',
  fixture: ALPHA_SHAPES_FIXTURE
}, {
  name: 'polygon mosaic',
  command: 'mosaic',
  fixture: MOSAIC_FIXTURE
}, {
  name: 'line division by polygon',
  command: 'divide ex1_polygon target=ex1_line',
  fixture: DIVIDE_FIXTURES,
  maxUndoPayloadCounts: {arcs: 1}
}, {
  name: 'polygon inlay',
  command: 'inlay ex1_inner target=ex1_outer',
  fixture: INLAY_FIXTURES,
  maxUndoPayloadCounts: {arcs: 1}
}, {
  name: 'polygon union',
  command: 'split name -union target=* name=merged',
  fixture: POLYGON_FIXTURE
}, {
  name: 'layer subdivision',
  command: 'subdivide \'sum(count) > 4\'',
  fixture: POLYGON_FIXTURE
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
  name: 'polygon dissolving deprecated alias',
  command: 'dissolve2',
  fixture: POLYGON_FIXTURE
}, {
  name: 'multipart exploding',
  command: 'explode',
  fixture: MULTIPOLYGON_FIXTURE
}, {
  name: 'polygon clipping',
  command: 'clip ex1_inner3 target=ex1_outer',
  fixture: CLIP_FIXTURES,
  maxUndoPayloadCounts: {arcs: 1}
}, {
  name: 'polygon erasing',
  command: 'erase ex1_inner3 target=ex1_outer',
  fixture: CLIP_FIXTURES,
  maxUndoPayloadCounts: {arcs: 1}
}, {
  name: 'polygon slicing',
  command: 'slice ex1_inner3 target=ex1_outer',
  fixture: CLIP_FIXTURES,
  maxUndoPayloadCounts: {arcs: 1}
}, {
  name: 'layer dropping',
  command: 'drop target=ex1_inner3',
  fixture: CLIP_FIXTURES
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

test('completed point edit session becomes one preserved app undo state', async function({page}) {
  await loadFixture(page, POINT_FIXTURE);

  var initialState = await getUndoState(page);

  await runConsoleCommand(page, '-each \'foo = "bar"\'');
  var commandState = await getUndoState(page);
  expect(commandState.model.checksum).not.toBe(initialState.model.checksum);

  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('edit_points');
    window.mapshaper.undoTest.addPointToActiveLayer([10, 20]);
    window.mapshaper.undoTest.setInteractionMode('off');
  });
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

test('empty layer creation is undoable before edit-session content', async function({page}) {
  await loadFixture(page, POINT_FIXTURE);

  var initialState = await getUndoState(page);

  await addEmptyPointLayer(page, 'empty');
  await expect.poll(async function() {
    return (await getUndoState(page)).model.layerCount;
  }).toBe(initialState.model.layerCount + 1);

  var emptyLayerState = await getUndoState(page);
  expect(emptyLayerState.undo.canUndo).toBe(true);
  expect(getLayerSummary(emptyLayerState.model, 'empty').shapeCount).toBe(0);

  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('edit_points');
    window.mapshaper.undoTest.addPointToActiveLayer([10, 20]);
    window.mapshaper.undoTest.setInteractionMode('off');
  });

  var editedLayerState = await getUndoState(page);
  expect(getLayerSummary(editedLayerState.model, 'empty').shapeCount).toBe(1);

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

test('undoing initial frame creation clears the map display', async function({page}) {
  await assertInitialRectangleUndoClearsDisplay(page, "-rectangle + name=frame bbox='-80,30,-70,40' width='600px'");
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

test('keyboard undo is ignored while editing layer menu names', async function({page}) {
  await loadFixture(page);

  var before = await getUndoState(page);
  await runConsoleCommand(page, '-each \'foo = "bar"\'');
  var changed = await getUndoState(page);
  expect(changed.model.checksum).not.toBe(before.model.checksum);

  await focusFirstLayerNameEditor(page, 'typing_layer_name');
  await page.keyboard.press('ControlOrMeta+Z');
  expect((await getUndoState(page)).model.checksum).toBe(changed.model.checksum);
  expect((await getUndoState(page)).undo.canUndo).toBe(true);
});

test('keyboard undo is ignored while editing export layer names', async function({page}) {
  await loadFixture(page);

  var before = await getUndoState(page);
  await runConsoleCommand(page, '-each \'foo = "bar"\'');
  var changed = await getUndoState(page);
  expect(changed.model.checksum).not.toBe(before.model.checksum);

  await focusFirstExportLayerNameEditor(page, 'typing_export_name');
  await page.keyboard.press('ControlOrMeta+Z');
  expect((await getUndoState(page)).model.checksum).toBe(changed.model.checksum);
  expect((await getUndoState(page)).undo.canUndo).toBe(true);
});

test('floating undo toolbar buttons undo and redo console command history', async function({page}) {
  await loadFixture(page);

  var before = await getUndoState(page);

  await runConsoleCommand(page, '-each \'foo = "bar"\'');

  var changed = await getUndoState(page);
  expect(changed.model.checksum).not.toBe(before.model.checksum);

  await page.locator('.edit-toolbar .floating-toolbar-btn').nth(0).click();
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(before.model.checksum);

  await page.locator('.edit-toolbar .floating-toolbar-btn').nth(1).click();
  await expect.poll(async function() {
    return (await getUndoState(page)).model.checksum;
  }).toBe(changed.model.checksum);
});

test('history menu toggles persisted app undo and reports restore data', async function({page}) {
  await loadFixture(page, POINT_FIXTURE, {undo: null});

  await page.evaluate(function() {
    window.localStorage.removeItem('mapshaper.undo');
  });

  var before = await getUndoState(page);

  await runConsoleCommand(page, '-each \'foo = "bar"\'', {waitForUndo: false});
  expect((await getUndoState(page)).undo.canUndo).toBe(false);

  await loadFixture(page, POINT_FIXTURE, {undo: null});
  before = await getUndoState(page);

  await page.locator('.history-btn').click();
  await expect(page.locator('.history-toggle-btn')).toContainText('enable undo');
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
  await expect(page.locator('.history-menu-note')).toContainText(/estimated on-disk restore data: [0-9]/);
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

test('history menu stays open and updates restore data after clearing undo history', async function({page}) {
  await loadFixture(page);

  await runConsoleCommand(page, '-each \'foo = "bar"\'');

  await page.locator('.history-btn').click();
  await expect(page.locator('.history-menu-note')).toContainText(/estimated on-disk restore data: [0-9]/);
  await page.locator('.history-clear-btn').click();
  await expect(page.locator('.history-menu-dropdown')).toBeVisible();
  await expect(page.locator('.history-menu-note')).toContainText('estimated on-disk restore data: 0 KB');
  expect((await getUndoState(page)).undo.canUndo).toBe(false);
  expect((await getUndoState(page)).payloadStore.ownBytes).toBe(0);
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

async function addEmptyPointLayer(page, name) {
  await page.locator('.layer-control-btn').click();
  await page.locator('#add-empty-btn').click();
  await page.locator('.layer-name.text-input').fill(name);
  await page.locator('.radio[value="point"]').check();
  await page.locator('.dialog-btn').filter({hasText: 'Create'}).click();
}

async function deleteFirstLayerFromLayerMenu(page) {
  var layerItem;
  await page.locator('.layer-control-btn').click();
  layerItem = page.locator('.layer-list .layer-item').first();
  await layerItem.hover();
  await layerItem.click({button: 'right'});
  await page.locator('.contextmenu-item').filter({hasText: 'delete layer'}).click();
}

async function renameFirstLayerFromLayerMenu(page, name) {
  var nameItem;
  await page.locator('.layer-control-btn').click();
  nameItem = page.locator('.layer-list .layer-item .layer-name').first();
  await nameItem.click();
  await nameItem.fill(name);
  await nameItem.press('Enter');
}

async function focusFirstLayerNameEditor(page, name) {
  var nameItem;
  await page.locator('.layer-control-btn').click();
  nameItem = page.locator('.layer-list .layer-item .layer-name').first();
  await nameItem.click();
  await nameItem.fill(name);
}

async function focusFirstExportLayerNameEditor(page, name) {
  var nameItem;
  await page.locator('.export-btn').click();
  nameItem = page.locator('.export-options .layer-item .layer-name').first();
  await nameItem.click();
  await nameItem.fill(name);
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
