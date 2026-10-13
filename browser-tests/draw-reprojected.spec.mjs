import { expect, test } from '@playwright/test';

// Drawing on a layer that is reprojected for display, as it is with a basemap
// on. Each added line replaces the layer, and the undo history keeps the layer
// it replaced, which must not keep that layer's reprojected display copy of
// the arcs.

var FIXTURE = 'test/data/features/snip/ring_and_line.json';

test('undo and redo of lines drawn on a reprojected layer', async function({page}) {
  var errors = collectPageErrors(page);
  var states = [];
  await loadGraticule(page);
  states.push(await getState(page));
  for (var i = 0; i < 3; i++) {
    await addLine(page, i);
    states.push(await getState(page));
  }
  expect(states[3].shapeCount).toBe(states[0].shapeCount + 3);
  for (i = 2; i >= 0; i--) {
    await page.evaluate(() => window.mapshaper.undoTest.undo());
    await page.waitForTimeout(100);
    expect(await getState(page)).toEqual(states[i]);
  }
  for (i = 1; i <= 3; i++) {
    await page.evaluate(() => window.mapshaper.undoTest.redo());
    await page.waitForTimeout(100);
    expect(await getState(page)).toEqual(states[i]);
  }
  expect(errors).toEqual([]);
});

test('drawing on a reprojected layer does not accumulate memory', async function({page}) {
  test.setTimeout(60 * 1000);
  var before, after;
  await loadGraticule(page);
  before = await getArrayBufferBytes(page);
  for (var i = 0; i < 10; i++) {
    await addLine(page, i);
  }
  after = await getArrayBufferBytes(page);
  // each reprojected copy of the ~260k-vertex layer is over 4 MB
  expect(after - before).toBeLessThan(4e6);
});

async function loadGraticule(page) {
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(FIXTURE));
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest &&
      window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
  await page.evaluate(async function() {
    var api = window.mapshaper.undoTest;
    await api.runCommand('-graticule interval=1');
    api.setDisplayCRS('webmercator');
    api.clearUndoHistory();
  });
  await page.waitForTimeout(250);
}

async function addLine(page, i) {
  await page.evaluate(function(i) {
    return window.mapshaper.undoTest.addLineToActiveLayer(
      [[-90 + i, 40], [-90 + i, 45], [-85 + i, 45]]);
  }, i);
  await page.waitForTimeout(100);
}

async function getState(page) {
  return page.evaluate(function() {
    var api = window.mapshaper.undoTest;
    return {
      shapeCount: api.getLayerInfo('graticule').shapeCount,
      paths: api.getLayerPathPixels('graticule')
    };
  });
}

// bytes held in ArrayBuffers, after garbage collection
async function getArrayBufferBytes(page) {
  var client = await page.context().newCDPSession(page);
  var chunks = [];
  var snapshot, fields, nameField, sizeField, total = 0;
  client.on('HeapProfiler.addHeapSnapshotChunk', function(e) {
    chunks.push(e.chunk);
  });
  await client.send('HeapProfiler.enable');
  await client.send('HeapProfiler.collectGarbage');
  await client.send('HeapProfiler.takeHeapSnapshot', {reportProgress: false});
  await client.detach();
  snapshot = JSON.parse(chunks.join(''));
  fields = snapshot.snapshot.meta.node_fields;
  nameField = fields.indexOf('name');
  sizeField = fields.indexOf('self_size');
  for (var i = 0; i < snapshot.nodes.length; i += fields.length) {
    if (/ArrayBufferData/.test(snapshot.strings[snapshot.nodes[i + nameField]])) {
      total += snapshot.nodes[i + sizeField];
    }
  }
  return total;
}

function collectPageErrors(page) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(String(err.message || err));
  });
  return errors;
}
