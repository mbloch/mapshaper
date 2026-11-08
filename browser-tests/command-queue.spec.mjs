import { expect, test } from '@playwright/test';

// A 2-megapixel NAIP image and 3DEP elevation of Sedona, AZ: -deshadow takes
// a second or two in a worker, while the GUI keeps taking input
var FIXTURES = 'test/data/geotiff/sedona-naip.tif,test/data/geotiff/sedona-elev.tif';
var DESHADOW = '-deshadow dem=sedona-elev target=sedona-naip date=2021-10-14';

test.setTimeout(60000);

test('a command submitted while another runs waits for it', async function({page}) {
  await loadFixtures(page);
  await page.evaluate(function(cmd) {
    var t = window.mapshaper.undoTest;
    return Promise.all([t.runCommand(cmd), t.runCommand('-drop target=sedona-elev')]);
  }, DESHADOW);
  expect((await getSessionCommands(page)).slice(-2)).toEqual([DESHADOW, '-drop target=sedona-elev']);
  expect(await getLayerNames(page)).toEqual(['sedona-naip']);

  // each command has its own undo state
  await undo(page);
  expect(await getLayerNames(page)).toEqual(['sedona-naip', 'sedona-elev']);
  expect((await getSessionCommands(page)).slice(-1)).toEqual([DESHADOW]);
  await undo(page);
  expect(await getSessionCommands(page)).not.toContain(DESHADOW);
  expect((await getUndoState(page)).canUndo).toBe(false);
});

test('Undo waits for a running command, then takes it back', async function({page}) {
  await loadFixtures(page);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand('-rename-layers dem target=sedona-elev');
  });
  await page.evaluate(function(cmd) {
    var t = window.mapshaper.undoTest;
    return Promise.all([t.runCommand(cmd), t.undo()]);
  }, DESHADOW.replace('dem=sedona-elev', 'dem=dem'));
  // the rename that -deshadow depends on is still in effect
  expect(await getLayerNames(page)).toEqual(['sedona-naip', 'dem']);
  expect((await getSessionCommands(page)).slice(-1)).toEqual(['-rename-layers dem target=sedona-elev']);
  expect(await getUndoState(page)).toEqual({canUndo: true, canRedo: true});
});

async function loadFixtures(page) {
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(FIXTURES));
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest &&
      window.mapshaper.undoTest.getState().model.layerCount == 2;
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.clearUndoHistory();
  });
}

async function undo(page) {
  await page.evaluate(function() { return window.mapshaper.undoTest.undo(); });
}

async function getUndoState(page) {
  return page.evaluate(function() { return window.mapshaper.undoTest.getState().undo; });
}

async function getSessionCommands(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory().commands;
  });
}

async function getLayerNames(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getState().model.datasets.reduce(function(memo, d) {
      return memo.concat(d.layers.map(function(lyr) { return lyr.name; }));
    }, []);
  });
}
