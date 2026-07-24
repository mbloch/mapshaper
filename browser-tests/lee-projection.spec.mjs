import fs from 'fs';
import { expect, test } from '@playwright/test';
import api from '../mapshaper.js';

var FIXTURE = 'test/data/features/proj/a_antarctica.json';

test('GUI and CLI both split Markley frame chords', async function({page}) {
  var input = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  var cliOutput = await api.applyCommands(
    '-i in.json -proj markley -o out.json',
    {'in.json': input}
  );
  var cliGeometry = JSON.parse(cliOutput['out.json']).features[0].geometry;

  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(FIXTURE));
  await page.waitForFunction(function() {
    return window.mapshaper &&
      window.mapshaper.undoTest &&
      window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand('-proj markley');
  });

  var downloadPromise = page.waitForEvent('download');
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand('-o gui.json');
  });
  var download = await downloadPromise;
  var guiOutput = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  var guiGeometry = guiOutput.features[0].geometry;
  var cliSummary = summarizeGeometry(cliGeometry);
  var guiSummary = summarizeGeometry(guiGeometry);

  expect(guiGeometry.type).toBe(cliGeometry.type);
  expect(guiSummary.remoteChordCount).toBe(0);
  expect(cliSummary.remoteChordCount).toBe(0);
  expect(guiSummary.maxPathSpan).toBeLessThan(6378137 * 2);
  expect(cliSummary.maxPathSpan).toBeLessThan(6378137 * 2);
  guiSummary.bounds.forEach(function(value, i) {
    expect(Math.abs(value - cliSummary.bounds[i])).toBeLessThan(1);
  });
});

test('GUI CALM uses the published pole arrangement', async function({page}) {
  await page.goto('/?undo-test=on');
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.internal;
  });
  var poles = await page.evaluate(function() {
    var internal = window.mapshaper.internal;
    var project = internal.getProjTransform2(
      internal.parseCrsString('wgs84'),
      internal.parseCrsString('+proj=calm +R=1')
    );
    return {
      north: project(0, 90),
      south: project(0, -90)
    };
  });

  expect(poles.north[0]).toBeLessThan(-3.4);
  expect(poles.north[1]).toBeGreaterThan(1.5);
  expect(poles.south[0]).toBeGreaterThan(-1);
  expect(poles.south[0]).toBeLessThan(0);
  expect(poles.south[1]).toBeLessThan(-0.7);
});

function summarizeGeometry(geometry) {
  var summary = {
    bounds: [Infinity, Infinity, -Infinity, -Infinity],
    maxPathSpan: 0,
    remoteChordCount: 0
  };
  visit(geometry.coordinates);
  return summary;

  function visit(arr) {
    if (arr.length > 0 && typeof arr[0][0] == 'number') {
      summarizePath(arr);
    } else {
      arr.forEach(visit);
    }
  }

  function summarizePath(path) {
    var xmin = Infinity;
    var xmax = -Infinity;
    path.forEach(function(point, i) {
      xmin = Math.min(xmin, point[0]);
      xmax = Math.max(xmax, point[0]);
      summary.bounds[0] = Math.min(summary.bounds[0], point[0]);
      summary.bounds[1] = Math.min(summary.bounds[1], point[1]);
      summary.bounds[2] = Math.max(summary.bounds[2], point[0]);
      summary.bounds[3] = Math.max(summary.bounds[3], point[1]);
      if (i === 0) return;
      var dx = point[0] - path[i - 1][0];
      var dy = point[1] - path[i - 1][1];
      var len = Math.hypot(dx, dy);
      if (len > 6378137 * 0.2 && Math.abs(dy) < len * 0.005) {
        summary.remoteChordCount++;
      }
    });
    summary.maxPathSpan = Math.max(summary.maxPathSpan, xmax - xmin);
  }
}
