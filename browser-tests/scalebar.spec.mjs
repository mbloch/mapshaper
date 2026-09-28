import { expect, test } from '@playwright/test';
import { openLayersPanel } from './sidebar-helpers.mjs';

var POINT_FIXTURE = 'test/data/geojson/three_points.geojson';

test('the frame menu adds a scale bar that shows in preview', async function({page}) {
  await loadProjectedFrame(page);
  await openLayersPanel(page);
  await openFrameMenu(page);
  await page.locator('.contextmenu-item').filter({hasText: 'add scale bar'}).click();

  await expect(page.locator('.scalebar-properties-popup')).toBeVisible();
  await expect.poll(function() {
    return getScalebarRecord(page);
  }).not.toBeNull();
  await expect(page.locator('.mapshaper-svg-furniture text')).toHaveCount(1);
  // part of the frame, not a layer of its own
  await expect(page.locator('.map-frame-list .layer-item')).toHaveCount(1);
  await expect(page.locator('.map-frame-list .layer-item')).not.toContainText('scale');
  await expect(page.locator('.layer-list .layer-item')).not.toContainText('scalebar');
  expect((await getSessionCommands(page)).pop()).toBe('-scalebar');

  await setPreviewMode(page, false);
  await expect(page.locator('.mapshaper-svg-furniture')).toHaveCount(0);
});

test('scale bar edits are undoable commands', async function({page}) {
  await loadProjectedFrame(page);
  await runCommand(page, '-scalebar "100 km"');
  await openLayersPanel(page);
  await openFrameMenu(page);
  await page.locator('.contextmenu-item').filter({hasText: /^scale bar$/}).click();
  var popup = page.locator('.scalebar-properties-popup');
  await expect(popup).toBeVisible();
  await expect(popup.locator('.scalebar-label-input')).toHaveValue('100 km');

  await popup.locator('.scalebar-position-select').selectOption('bottom-right');
  await expect.poll(async function() {
    return (await getScalebarRecord(page)).position;
  }).toBe('bottom-right');
  expect((await getSessionCommands(page)).pop())
    .toBe("-scalebar '100 km' units=km position=bottom-right");
  // the label survives an edit to another setting
  expect((await getScalebarRecord(page)).label).toBe('100 km');
  await expect(page.locator('.mapshaper-svg-furniture text')).toHaveText('100 km');

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getScalebarRecord(page)).position;
  }).toBeUndefined();

  await page.locator('.scalebar-properties-popup .label-panel-action-btn')
    .filter({hasText: 'Remove scale bar'}).click();
  await expect.poll(function() {
    return getScalebarRecord(page);
  }).toBeNull();
  await expect(page.locator('.mapshaper-svg-furniture')).toHaveCount(0);
});

test('a bare distance uses the units menu', async function({page}) {
  await loadProjectedFrame(page);
  await runCommand(page, '-scalebar');
  var popup = await openScalebarPanel(page);
  await expect(popup.locator('.scalebar-position-select option')).toHaveCount(4);

  await popup.locator('.scalebar-units-select').selectOption('km');
  await popup.locator('.scalebar-label-input').fill('150');
  await popup.locator('.scalebar-label-input').press('Enter');
  await expect(page.locator('.mapshaper-svg-furniture text')).toHaveText('150 KM');
  expect((await getSessionCommands(page)).pop()).toBe("-scalebar '150' units=km");

  // switching units keeps the number
  await runCommand(page, '-scalebar "80 km"');
  popup = await openScalebarPanel(page);
  await expect(popup.locator('.scalebar-units-select')).toHaveValue('km');
  await popup.locator('.scalebar-units-select').selectOption('miles');
  await expect(page.locator('.mapshaper-svg-furniture text')).toHaveText('80 MILES');
});

test('color and font controls show the defaults the scale bar is drawn with', async function({page}) {
  await loadProjectedFrame(page);
  await runCommand(page, '-scalebar');
  var popup = await openScalebarPanel(page);
  await expect(popup.locator('.scalebar-color-cell .label-color-input')).toHaveValue('#000000');
  await expect(popup.locator('.scalebar-color-cell .label-color-chit'))
    .toHaveCSS('background-color', 'rgb(0, 0, 0)');
  var fontSelect = popup.locator('.scalebar-font-select');
  expect(await fontSelect.inputValue()).not.toBe('');
  expect(await fontSelect.locator('optgroup').count()).toBeGreaterThan(0);

  await popup.locator('.scalebar-color-cell .label-color-input').fill('#cc0000');
  await popup.locator('.scalebar-color-cell .label-color-input').press('Enter');
  await expect.poll(async function() {
    return (await getScalebarRecord(page)).color;
  }).toBe('#cc0000');
  await expect(popup.locator('.scalebar-color-cell .label-color-chit'))
    .toHaveCSS('background-color', 'rgb(204, 0, 0)');

  var fontName = await fontSelect.locator('option').nth(1).getAttribute('value');
  await fontSelect.selectOption(fontName);
  await expect.poll(async function() {
    return (await getScalebarRecord(page)).font_family;
  }).toBe(fontName);
  await expect(page.locator('.mapshaper-svg-furniture text'))
    .toHaveAttribute('font-family', fontName);
});

test('the panel leaves the map usable and opens away from the scale bar', async function({page}) {
  await loadProjectedFrame(page);
  await runCommand(page, '-scalebar position=bottom-left');
  var popup = await openScalebarPanel(page);
  var map = await page.locator('.map-layers').boundingBox();
  var box = await popup.boundingBox();
  expect(box.x).toBeGreaterThan(map.x + map.width / 2);

  // the map under the panel's wrapper still gets the pointer
  var bounds = await getViewBounds(page);
  await page.mouse.move(map.x + 100, map.y + map.height - 100);
  await page.mouse.wheel(0, -300);
  await expect.poll(function() { return getViewBounds(page); }).not.toEqual(bounds);
  await expect(popup).toBeVisible();

  await runCommand(page, '-scalebar position=top-right');
  popup = await openScalebarPanel(page);
  box = await popup.boundingBox();
  expect(box.x + box.width).toBeLessThan(map.x + map.width / 2);
});

test('the open panel follows undo and closes when the scale bar goes', async function({page}) {
  await loadProjectedFrame(page);
  await runCommand(page, '-scalebar');
  var popup = await openScalebarPanel(page);
  await popup.locator('.scalebar-position-select').selectOption('bottom-right');
  await expect.poll(async function() {
    return (await getScalebarRecord(page)).position;
  }).toBe('bottom-right');

  await undo(page);
  await expect(popup.locator('.scalebar-position-select')).toHaveValue('top-left');
  await redo(page);
  await expect(popup.locator('.scalebar-position-select')).toHaveValue('bottom-right');

  // undoing the command that added the scale bar
  await undo(page);
  await undo(page);
  await expect.poll(function() { return getScalebarRecord(page); }).toBeNull();
  await expect(popup).toHaveCount(0);
});

test('scale bar edits interleave with point edits in the undo history', async function({page}) {
  await loadProjectedFrame(page);
  await runCommand(page, '-scalebar');
  await openScalebarPanel(page);
  await page.evaluate(function() {
    window.mapshaper.undoTest.selectLayer('three_points');
    window.mapshaper.undoTest.setInteractionMode('edit_points');
  });
  await expect.poll(getMode(page)).toBe('edit_points');
  var popup = page.locator('.scalebar-properties-popup');
  await expect(popup).toBeVisible();

  await addPoint(page, [0, 0]);
  await popup.locator('.scalebar-position-select').selectOption('bottom-right');
  await expect.poll(getPosition(page)).toBe('bottom-right');
  await addPoint(page, [1, 1]);
  // the scale bar command neither ends the edit nor changes its layer
  expect(await getMode(page)()).toBe('edit_points');
  expect(await getPointCount(page)).toBe(5);

  var states = [[4, 'bottom-right'], [4, undefined], [3, undefined]];
  for (var state of states) {
    await undo(page);
    await expect.poll(getEditState(page)).toEqual(state);
  }
  for (state of [[4, undefined], [4, 'bottom-right'], [5, 'bottom-right']]) {
    await redo(page);
    await expect.poll(getEditState(page)).toEqual(state);
  }
  expect(await getMode(page)()).toBe('edit_points');

  // ending the edit folds its point edits into one step, after the scale bar
  // edit, and both still undo and redo
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('off');
  });
  await expect.poll(getMode(page)).toBe('off');
  await expect.poll(async function() {
    return page.evaluate(function() {
      return window.mapshaper.undoTest.getState().undo.canUndo;
    });
  }).toBe(true);
  for (state of [[3, 'bottom-right'], [3, undefined]]) {
    await undo(page);
    await expect.poll(getEditState(page)).toEqual(state);
  }
  for (state of [[3, 'bottom-right'], [5, 'bottom-right']]) {
    await redo(page);
    await expect.poll(getEditState(page)).toEqual(state);
  }
});

test('scale bar edits interleave with frame tool edits in the undo history', async function({page}) {
  await loadProjectedFrame(page);
  await runCommand(page, '-scalebar');
  var popup = await openScalebarPanel(page);
  await page.evaluate(function() {
    window.mapshaper.undoTest.openFrameTool();
  });
  await expect.poll(getMode(page)).toBe('frame');
  await expect(popup).toBeVisible();

  await dragLeftHandle(page, 40);
  await expect.poll(getFrameWidth(page)).toBeGreaterThan(600);
  var width1 = await getFrameWidth(page)();
  await popup.locator('.scalebar-position-select').selectOption('bottom-right');
  await expect.poll(getPosition(page)).toBe('bottom-right');
  await dragLeftHandle(page, 40);
  await expect.poll(getFrameWidth(page)).toBeGreaterThan(width1);
  var width2 = await getFrameWidth(page)();

  var getState = async function() {
    return [await getFrameWidth(page)(), await getPosition(page)()];
  };
  for (var state of [[width1, 'bottom-right'], [width1, undefined], [600, undefined]]) {
    await undo(page);
    await expect.poll(getState).toEqual(state);
  }
  for (state of [[width1, undefined], [width1, 'bottom-right'], [width2, 'bottom-right']]) {
    await redo(page);
    await expect.poll(getState).toEqual(state);
  }
  // the frame tool still edits the frame that undo and redo put back
  await dragLeftHandle(page, 40);
  await expect.poll(getFrameWidth(page)).toBeGreaterThan(width2);
  expect(await getPosition(page)()).toBe('bottom-right');
  await expect(page.locator('.mapshaper-svg-furniture text')).toHaveCount(1);
});

test('deleting the frame deletes its scale bar', async function({page}) {
  await loadProjectedFrame(page);
  await runCommand(page, '-scalebar');
  await openLayersPanel(page);
  await openFrameMenu(page);
  await page.locator('.contextmenu-item').filter({hasText: 'delete frame'}).click();
  await expect.poll(function() {
    return page.evaluate(function() {
      return window.mapshaper.undoTest.getFrameInfo();
    });
  }).toBeNull();
  expect(await getScalebarRecord(page)).toBeNull();
});

test('undoing a frame deletion restores its scale bar', async function({page}) {
  await loadProjectedFrame(page);
  await runCommand(page, '-scalebar "50 km"');
  await openLayersPanel(page);
  await openFrameMenu(page);
  await page.locator('.contextmenu-item').filter({hasText: 'delete frame'}).click();
  await expect.poll(function() {
    return getScalebarRecord(page);
  }).toBeNull();
  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    var rec = await getScalebarRecord(page);
    return rec && rec.label;
  }).toBe('50 km');
  await expect(page.locator('.map-frame-list .layer-item')).toHaveCount(1);
  await expect(page.locator('.layer-list .layer-item')).toHaveCount(1);
});

test('SVG export includes the scale bar but the layer list does not', async function({page}) {
  await loadProjectedFrame(page);
  await runCommand(page, '-scalebar "50 km"');
  await page.locator('.export-btn').click();
  await expect(page.locator('.export-options')).toBeVisible();
  await expect(page.locator('.export-layer-list .layer-item')).toHaveCount(1);
  await expect(page.locator('.export-layer-list')).not.toContainText('scalebar');
  await page.locator('.export-formats input[value="svg"]').check();
  var downloadPromise = page.waitForEvent('download');
  await page.locator('.export-options #export-btn').click();
  var download = await downloadPromise;
  var svg = await readDownload(download);
  expect(svg).toContain('id="scalebar"');
  expect(svg).toContain('50 km');
});

test('an unprojected frame explains why the scale bar is hidden', async function({page}) {
  await loadFixture(page);
  await runCommand(page, '-frame width=600 name=frame');
  await runCommand(page, '-scalebar');
  await openLayersPanel(page);
  await openFrameMenu(page);
  await page.locator('.contextmenu-item').filter({hasText: /^scale bar$/}).click();
  await expect(page.locator('.scalebar-properties-note')).toContainText('unprojected');
  await setPreviewMode(page, true);
  await expect(page.locator('.mapshaper-svg-furniture')).toHaveCount(0);
});

async function loadProjectedFrame(page) {
  await loadFixture(page);
  await runCommand(page, '-proj merc');
  await runCommand(page, '-frame width=600 name=frame');
  await setPreviewMode(page, true);
}

async function loadFixture(page) {
  var url = '/?undo=on&undo-test=on&files=' + encodeURIComponent(POINT_FIXTURE);
  await page.goto(url);
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest;
  });
  await page.waitForFunction(function() {
    return window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
}

async function undo(page) {
  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
}

async function redo(page) {
  await page.evaluate(function() {
    return window.mapshaper.undoTest.redo();
  });
}

function getMode(page) {
  return function() {
    return page.evaluate(function() {
      return window.mapshaper.undoTest.getInteractionMode();
    });
  };
}

function getPosition(page) {
  return async function() {
    var rec = await getScalebarRecord(page);
    return rec ? rec.position : null;
  };
}

function getFrameWidth(page) {
  return async function() {
    return page.evaluate(function() {
      return window.mapshaper.undoTest.getFrameInfo().width;
    });
  };
}

async function getPointCount(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getLayerInfo('three_points').shapeCount;
  });
}

function getEditState(page) {
  return async function() {
    return [await getPointCount(page), await getPosition(page)()];
  };
}

async function addPoint(page, p) {
  await page.evaluate(function(coords) {
    window.mapshaper.undoTest.addPointToActiveLayer(coords);
  }, p);
}

async function getViewBounds(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getViewBounds();
  });
}

async function dragLeftHandle(page, dx) {
  await page.evaluate(function(delta) {
    var handle = document.querySelectorAll('.frame-edit-box .handle')[1];
    var box = handle.getBoundingClientRect();
    var x = box.x + box.width / 2;
    var y = box.y + box.height / 2;
    handle.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true, button: 0, buttons: 1, clientX: x, clientY: y
    }));
    document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true, buttons: 1, clientX: x - delta, clientY: y
    }));
    document.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true, button: 0, clientX: x - delta, clientY: y
    }));
  }, dx);
}

async function openScalebarPanel(page) {
  var popup = page.locator('.scalebar-properties-popup');
  if (await popup.count()) {
    await page.locator('.close2-btn').last().click();
    await expect(popup).toHaveCount(0);
  }
  await openLayersPanel(page);
  await openFrameMenu(page);
  await page.locator('.contextmenu-item').filter({hasText: /^scale bar$/}).click();
  await expect(popup).toBeVisible();
  return popup;
}

async function openFrameMenu(page) {
  await page.locator('.map-frame-list .layer-item').hover();
  await page.locator('.map-frame-list .layer-item .more-btn').click();
}

async function runCommand(page, cmd) {
  await page.evaluate(function(str) {
    return window.mapshaper.undoTest.runCommand(str);
  }, cmd);
}

async function setPreviewMode(page, on) {
  await page.evaluate(function(value) {
    window.mapshaper.undoTest.setPreviewMode(value);
  }, on);
  await expect.poll(function() {
    return page.evaluate(function() {
      return window.mapshaper.undoTest.getPreviewMode();
    });
  }).toBe(on);
}

async function getScalebarRecord(page) {
  return page.evaluate(function() {
    var info = window.mapshaper.undoTest.getLayerInfo('scalebar');
    return info ? info.records[0] : null;
  });
}

async function readDownload(download) {
  var stream = await download.createReadStream();
  var chunks = [];
  for await (var chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

async function getSessionCommands(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory().commands;
  });
}
