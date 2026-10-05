import { expect, test } from '@playwright/test';

// In the inspect and selection modes a label is cued the way the label tool
// cues it -- a light box on hover, a solid one when selected -- rather than
// with the dot an unstyled point gets.

var FIXTURE = 'test/data/geojson/three_points.geojson';

test('inspect mode boxes the hovered label and the pinned one', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await runCommand(page, '-style \'label-text="L"+this.id\'');
  await setMode(page, 'info');

  await hoverLabel(page, 1);
  expect(await getCuedIds(page, 'hovered')).toEqual([1]);
  expect(await getCuedIds(page, 'selected')).toEqual([]);

  await clickLabel(page, 1);
  expect(await getCuedIds(page, 'selected')).toEqual([1]);
  expect(await getCuedIds(page, 'hovered')).toEqual([]);
  // an inspect cue is not an editing one: no handles
  expect(await page.locator('.label-cue-handles, .label-cue-knot').count()).toBe(0);

  // a second click unpins
  await clickLabel(page, 1);
  expect(await getCuedIds(page, 'selected')).toEqual([]);
  expect(errors).toEqual([]);
});

test('selection mode boxes each selected label and the hovered one', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await runCommand(page, '-style \'label-text="L"+this.id\'');
  await setMode(page, 'selection');

  await clickLabel(page, 0);
  await clickLabel(page, 2);
  expect(await getCuedIds(page, 'selected')).toEqual([0, 2]);

  await hoverLabel(page, 1);
  expect(await getCuedIds(page, 'hovered')).toEqual([1]);

  // the cues go when the mode does
  await setMode(page, 'box');
  expect(await page.locator('.label-cue').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('a point layer without labels gets no boxes', async function({page}) {
  var errors = collectPageErrors(page);
  await loadFixture(page, FIXTURE);
  await setMode(page, 'info');
  await page.mouse.move(10, 10);
  await page.waitForTimeout(100);
  expect(await page.locator('.label-cue').count()).toBe(0);
  expect(errors).toEqual([]);
});

async function setMode(page, mode) {
  await page.evaluate(function(m) {
    window.mapshaper.undoTest.setInteractionMode(m);
  }, mode);
  await page.waitForTimeout(150);
}

async function getCuedIds(page, kind) {
  return page.evaluate(function(cls) {
    return Array.prototype.map.call(
      document.querySelectorAll('.label-cue-' + cls),
      function(g) {
        return Number(g.nextSibling.getAttribute('data-id'));
      }).sort(function(a, b) { return a - b; });
  }, kind);
}

async function labelPoint(page, id) {
  return page.evaluate(function(arg) {
    var symbol = document.querySelector(
      '.mapshaper-symbol-layer .mapshaper-svg-symbol[data-id="' + arg + '"]');
    var node = symbol.tagName == 'text' ? symbol : symbol.querySelector('text');
    var r = node.getBoundingClientRect();
    return {x: r.x + r.width / 2, y: r.y + r.height / 2};
  }, id);
}

// The map tests the pointer on a move it has seen arrive, so the pointer
// arrives in two moves.
async function hoverLabel(page, id) {
  var p = await labelPoint(page, id);
  await page.mouse.move(p.x - 8, p.y);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(120);
}

async function clickLabel(page, id) {
  var p = await labelPoint(page, id);
  await page.mouse.move(p.x - 8, p.y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(120);
}

async function runCommand(page, command) {
  await page.evaluate(function(str) {
    return window.mapshaper.undoTest.runCommand(str);
  }, command);
  await page.waitForTimeout(200);
}

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
  await page.evaluate(function() {
    window.mapshaper.undoTest.clearUndoHistory();
  });
}
