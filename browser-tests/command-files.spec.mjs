import { expect, test } from '@playwright/test';

var POINT_FIXTURE = 'test/data/geojson/three_points.geojson';

test('GUI can load a command file before any data', async function({page}) {
  await page.goto('/?undo=on&undo-test=on');
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest;
  });
  await page.locator('input[type="file"]').last().setInputFiles({
    name: 'create.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('mapshaper\n-rectangle bbox=0,0,1,1')
  });
  await page.waitForFunction(function() {
    return window.mapshaper.undoTest.getMessages().some(function(msg) {
      return msg && msg.title == 'Command file loaded';
    });
  });

  await runCommand(page, '-run create.txt');
  var state = await getState(page);
  expect(state.model.datasetCount).toBe(1);
  expect((await getHistory(page)).commands).toEqual(['-run create.txt']);
});

test('GUI runs an imported command file as one history and undo entry', async function({page}) {
  await loadFixture(page);
  await importTextFile(page, 'commands.txt', [
    'mapshaper',
    '-i ' + POINT_FIXTURE,
    '-rename-layers imported_copy',
    '-each \'from_command = true\''
  ].join('\n'));

  var before = await getState(page);
  var historyBefore = await getHistory(page);
  await runCommand(page, '-run commands.txt');

  var changed = await getState(page);
  var historyAfter = await getHistory(page);
  expect(changed.model.datasetCount).toBe(2);
  expect(changed.model.activeLayer).toBe('imported_copy');
  expect(changed.model.datasets[0].layers[0].fields).not.toContain('from_command');
  expect(changed.model.datasets[1].layers[0].fields).toContain('from_command');
  expect(historyAfter.commands.slice(historyBefore.commands.length)).toEqual([
    '-run commands.txt'
  ]);
  expect(changed.undo.canUndo).toBe(true);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getState(page)).model.checksum;
  }).toBe(before.model.checksum);
  expect((await getHistory(page)).commands).toEqual(historyBefore.commands);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.redo();
  });
  await expect.poll(async function() {
    return (await getState(page)).model.checksum;
  }).toBe(changed.model.checksum);
  expect((await getHistory(page)).commands.slice(historyBefore.commands.length)).toEqual([
    '-run commands.txt'
  ]);
});

test('GUI command files reject browser-incompatible nested commands', async function({page}) {
  await loadFixture(page);
  await importTextFile(page, 'blocked.txt', [
    'mapshaper',
    '-include helpers.js'
  ].join('\n'));

  var historyBefore = await getHistory(page);
  var message = await runCommandForError(page, '-run blocked.txt');
  expect(message).toContain(
    'The include command cannot be run from a command file in the web console.'
  );
  expect((await getHistory(page)).commands).toEqual(historyBefore.commands);
});

test('GUI command files require imported data sources', async function({page}) {
  await loadFixture(page);
  await importTextFile(page, 'missing-source.txt', [
    'mapshaper',
    '-i missing.geojson'
  ].join('\n'));

  var historyBefore = await getHistory(page);
  var message = await runCommandForError(page, '-run missing-source.txt');
  expect(message).toContain('Missing data layer [missing.geojson]');
  expect((await getHistory(page)).commands).toEqual(historyBefore.commands);
});

test('GUI continues importing ordinary txt files as data', async function({page}) {
  await page.goto('/?undo=on&undo-test=on');
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest;
  });
  await page.locator('input[type="file"]').last().setInputFiles({
    name: 'table.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('name,value\nalpha,1\nbeta,2')
  });
  await expect.poll(async function() {
    return (await getState(page)).model.datasetCount;
  }).toBe(1);
  expect((await getHistory(page)).commands).toContain('-i table.txt');
});

async function loadFixture(page) {
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(POINT_FIXTURE));
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest &&
      window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.clearUndoHistory();
  });
}

async function importTextFile(page, name, content) {
  await page.locator('input[type="file"]').last().setInputFiles({
    name: name,
    mimeType: 'text/plain',
    buffer: Buffer.from(content)
  });
  var submit = page.locator('#import-options .submit-btn');
  await expect(submit).toBeVisible();
  await submit.click();
  await expect(submit).not.toBeVisible();
}

async function runCommand(page, command) {
  await page.evaluate(function(str) {
    return window.mapshaper.undoTest.runCommand(str);
  }, command);
}

async function runCommandForError(page, command) {
  return page.evaluate(async function(str) {
    try {
      await window.mapshaper.undoTest.runCommand(str);
      return '';
    } catch (e) {
      return e && e.message || String(e);
    }
  }, command);
}

async function getState(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getState();
  });
}

async function getHistory(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory();
  });
}
