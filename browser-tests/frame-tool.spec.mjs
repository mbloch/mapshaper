import { expect, test } from '@playwright/test';
import { openLayersPanel } from './sidebar-helpers.mjs';

var POINT_FIXTURE = 'test/data/geojson/three_points.geojson';

test('layer panel creates a frame from the visible layers', async function({page}) {
  await loadFixture(page);

  await openLayersPanel(page);
  await page.locator('.map-frame-empty').click();
  await expect(page.locator('.frame-create-popup')).toBeVisible();
  await page.locator('.frame-create-popup .dialog-btn')
    .filter({hasText: 'Fit visible layers'}).click();

  await expect.poll(function() {
    return getFrameInfo(page);
  }).not.toBeNull();
  var frame = await getFrameInfo(page);
  expect(frame.width).toBeGreaterThan(0);
  expect(frame.height).toBeGreaterThan(0);
  expect(frame.bbox[2]).toBeGreaterThan(frame.bbox[0]);
  expect(frame.bbox[3]).toBeGreaterThan(frame.bbox[1]);
  expect(await page.evaluate(function() {
    return window.mapshaper.undoTest.getPreviewMode();
  })).toBe(true);
  await expect(page.locator('.map-frame-list .layer-item')).toContainText(
    /\d+ × \d+ px/
  );
});

test('fitting visible layers includes a raster layer', async function({page}) {
  await loadFixture(page, 'test/data/geotiff/wgs84-geographic-epsg4326.tif');
  await openLayersPanel(page);
  await page.locator('.map-frame-empty').click();
  await expect(page.locator('.frame-create-popup')).toBeVisible();
  await page.locator('.frame-create-popup .dialog-btn')
    .filter({hasText: 'Fit visible layers'}).click();

  await expect.poll(function() {
    return getFrameInfo(page);
  }).not.toBeNull();
  var frame = await getFrameInfo(page);
  expect(frame.bbox[0]).toBeLessThanOrEqual(-180);
  expect(frame.bbox[1]).toBeLessThanOrEqual(-90);
  expect(frame.bbox[2]).toBeGreaterThanOrEqual(180);
  expect(frame.bbox[3]).toBeGreaterThanOrEqual(90);
});

test('a data-only layer gets a clear message instead of a frame', async function({page}) {
  await loadFixture(page, 'test/data/text/states.csv');
  await openLayersPanel(page);
  await page.locator('.map-frame-empty').click();
  await expect(page.locator('.alert-box')).toContainText('only attribute data');
  await expect(page.locator('.frame-create-popup')).toHaveCount(0);
  expect(await getFrameInfo(page)).toBeNull();
});

test('fitting visible layers applies the aspect ratio and margin', async function({page}) {
  await loadFixture(page);
  await openLayersPanel(page);
  await page.locator('.map-frame-empty').click();
  await setInput(page, '.frame-create-aspect-input', '5:4');
  await setInput(page, '.frame-create-margin input', '10%');
  await page.locator('.frame-create-popup .dialog-btn')
    .filter({hasText: 'Fit visible layers'}).click();

  await expect.poll(function() {
    return getFrameInfo(page);
  }).not.toBeNull();
  var frame = await getFrameInfo(page);
  expect(frame.width / frame.height).toBeCloseTo(1.25, 6);
  expect((await getSessionCommands(page)).pop())
    .toContain("aspect-ratio=1.25 margin='10%'");
});

// A drawn box is already the extent the user meant, so the margin is not
// offered for it and must not leak into the command.
test('a drawn frame takes the aspect ratio but no margin', async function({page}) {
  await loadFixture(page);
  await openLayersPanel(page);
  await page.locator('.map-frame-empty').click();
  await setInput(page, '.frame-create-aspect-input', '1');
  await page.locator('.frame-create-popup .dialog-btn')
    .filter({hasText: 'Draw on the map'}).click();

  // The instructions appear when drawing mode is live; clicking the map before
  // then loses the first corner.
  await expect(page.locator('.alert-wrapper.non-blocking')).toBeVisible();
  var mapBox = await page.locator('.map-layers').boundingBox();
  await page.mouse.click(mapBox.x + 120, mapBox.y + 100);
  await page.mouse.move(mapBox.x + 480, mapBox.y + 260);
  await page.mouse.click(mapBox.x + 480, mapBox.y + 260);
  await page.locator('.frame-draw-toolbar .text-btn')
    .filter({hasText: 'Done'}).click();

  await expect.poll(function() {
    return getFrameInfo(page);
  }).not.toBeNull();
  var frame = await getFrameInfo(page);
  expect(frame.width / frame.height).toBeCloseTo(1, 6);
  var command = (await getSessionCommands(page)).pop();
  expect(command).toContain('aspect-ratio=1');
  expect(command).not.toContain('margin');
});

// The ratio has to shape the box as it is dragged. Without this the user draws
// one rectangle and -frame pads it out to a larger one on Done.
test('a set aspect ratio constrains the box being drawn', async function({page}) {
  await loadFixture(page);
  await openLayersPanel(page);
  await page.locator('.map-frame-empty').click();
  await setInput(page, '.frame-create-aspect-input', '2:1');
  await page.locator('.frame-create-popup .dialog-btn')
    .filter({hasText: 'Draw on the map'}).click();

  await expect(page.locator('.alert-wrapper.non-blocking')).toBeVisible();
  var mapBox = await page.locator('.map-layers').boundingBox();
  await page.mouse.click(mapBox.x + 120, mapBox.y + 100);
  // A pointer square to the first corner; the box must still come out 2:1,
  // and wide enough to reach the pointer rather than trimmed down to it.
  await page.mouse.move(mapBox.x + 320, mapBox.y + 300);
  await expect.poll(async function() {
    var box = await page.locator('.frame-draw-box').boundingBox();
    return box ? box.width / box.height : null;
  }).toBeCloseTo(2, 1);
  var drawn = await page.locator('.frame-draw-box').boundingBox();
  expect(drawn.height).toBeGreaterThan(190);

  await page.mouse.click(mapBox.x + 320, mapBox.y + 300);
  await page.locator('.frame-draw-toolbar .text-btn')
    .filter({hasText: 'Done'}).click();
  await expect.poll(function() {
    return getFrameInfo(page);
  }).not.toBeNull();
  var frame = await getFrameInfo(page);
  expect(frame.width / frame.height).toBeCloseTo(2, 6);
});

// Blank is the default and means "take the shape of the frame area", so it
// must not reach the command as an aspect-ratio option.
test('a blank aspect ratio sends no aspect-ratio option', async function({page}) {
  await loadFixture(page);
  await openLayersPanel(page);
  await page.locator('.map-frame-empty').click();
  await expect(page.locator('.frame-create-aspect-input')).toHaveValue('');
  await page.locator('.frame-create-popup .dialog-btn')
    .filter({hasText: 'Fit visible layers'}).click();

  await expect.poll(function() {
    return getFrameInfo(page);
  }).not.toBeNull();
  expect((await getSessionCommands(page)).pop()).not.toContain('aspect-ratio');
});

test('frame creation preserves the active content and console target', async function({page}) {
  await loadFixture(page);
  var activeName = await page.evaluate(function() {
    return window.mapshaper.undoTest.getState().model.activeLayer;
  });
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand(
      '-frame bbox=-80,30,-70,40 width=600 name=frame'
    );
  });

  expect(await page.evaluate(function() {
    return window.mapshaper.undoTest.getState().model.activeLayer;
  })).toBe(activeName);
  await openLayersPanel(page);
  await expect(page.locator('.layer-list .layer-item')).toHaveClass(/active/);
  await expect(page.locator('.layer-list .layer-item')).not.toHaveClass(/invisible/);
  await expect(page.locator('.map-frame-list .layer-item')).not.toHaveClass(/active/);

  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand('-each gui_target_test=1');
  });
  var targetFields = await page.evaluate(function(name) {
    return window.mapshaper.undoTest.getLayerInfo(name).fields;
  }, activeName);
  var frameFields = await page.evaluate(function() {
    return window.mapshaper.undoTest.getLayerInfo('frame').fields;
  });
  expect(targetFields).toContain('gui_target_test');
  expect(frameFields).not.toContain('gui_target_test');
});

test('frame properties edits output size through an undoable command', async function({page}) {
  await loadFixture(page);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand(
      '-frame bbox=-80,30,-70,40 width=600 name=frame'
    );
  });
  await openLayersPanel(page);
  await page.locator('.map-frame-list .layer-item').click();
  await expect(page.locator('.frame-properties-popup')).toBeVisible();
  await expect(page.locator('.frame-properties-popup')).toContainText('Background');
  await expect(page.locator('.frame-properties-popup')).toContainText('Neatline');

  await setInput(page, '.frame-width-input', '720');
  await expect.poll(async function() {
    return (await getFrameInfo(page)).width;
  }).toBe(720);
  await expect.poll(async function() {
    return (await getSessionCommands(page)).join('\n');
  }).toContain('-update-frame width=');

  var history = await page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory();
  });
  expect(history.commands.join('\n')).toContain('-update-frame width=');

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getFrameInfo(page)).width;
  }).toBe(600);
});

// Either dimension rescales the frame and the other follows; neither reshapes
// the extent, which is the resize tool's job.
test('frame properties rescales the frame without moving its extent',
  async function({page}) {
    await loadFixture(page);
    await page.evaluate(function() {
      return window.mapshaper.undoTest.runCommand(
        '-frame bbox=-80,30,-70,40 width=600 name=frame'
      );
    });
    await openLayersPanel(page);
    await page.locator('.map-frame-list .layer-item').click();
    await expect(page.locator('.frame-properties-popup')).toBeVisible();

    await setInput(page, '.frame-width-input', '300');
    await expect.poll(async function() {
      return (await getFrameInfo(page)).height;
    }).toBe(300);
    await expect(page.locator('.frame-height-input')).toHaveValue('300');

    await setInput(page, '.frame-height-input', '150');
    await expect.poll(async function() {
      return (await getFrameInfo(page)).width;
    }).toBe(150);
    await expect(page.locator('.frame-width-input')).toHaveValue('150');

    expect((await getFrameInfo(page)).bbox).toEqual([-80, 30, -70, 40]);
  });

test('frame handles crop by default and preserve width when locked', async function({page}) {
  await loadFixture(page);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand(
      '-frame bbox=-80,30,-70,40 width=600 name=frame'
    );
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.openFrameTool();
  });

  var initialScale = await page.evaluate(function() {
    return window.mapshaper.undoTest.getSymbolScale();
  });
  await dragLeftHandle(page, 40);
  await expect.poll(async function() {
    return (await getFrameInfo(page)).width;
  }).toBeGreaterThan(600);
  var cropped = await getFrameInfo(page);
  expect(cropped.bbox[0]).toBeLessThan(-80);
  await expect.poll(async function() {
    var cropScale = await page.evaluate(function() {
      return window.mapshaper.undoTest.getSymbolScale();
    });
    return Math.abs(cropScale - initialScale);
  }).toBeLessThan(0.02);
  await expect.poll(async function() {
    return (await getSessionCommands(page)).join('\n');
  }).toContain('-update-frame bbox=');

  await page.evaluate(function() {
    return window.mapshaper.undoTest.undo();
  });
  await expect.poll(async function() {
    return (await getFrameInfo(page)).width;
  }).toBe(600);

  await page.evaluate(function() {
    window.mapshaper.undoTest.setFrameLockSize(true);
  });
  await dragLeftHandle(page, 40);
  await expect.poll(async function() {
    return (await getFrameInfo(page)).bbox[0];
  }).toBeLessThan(-80);
  expect((await getFrameInfo(page)).width).toBe(600);
});

// The mode is about what stays put when the extent changes, so it has to reach
// Fit as well as the handles.
test('the mode applies to fitting, and Margin pads the fit', async function({page}) {
  await loadFixture(page);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand(
      '-frame bbox=-80,30,-70,40 width=600 name=frame'
    );
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.openFrameTool();
  });

  var segments = page.locator('.frame-size-mode .floating-toolbar-btn');
  var fit = page.locator('.frame-toolbar .text-btn').filter({hasText: 'Fit'});

  // Fix scale: the output grows or shrinks so the scale is unchanged.
  var before = await getFrameInfo(page);
  await fit.click();
  await expect.poll(async function() {
    return (await getFrameInfo(page)).bbox.join(',');
  }).not.toBe(before.bbox.join(','));
  var fitted = await getFrameInfo(page);
  var scaleBefore = before.width / (before.bbox[2] - before.bbox[0]);
  expect(fitted.width / (fitted.bbox[2] - fitted.bbox[0]))
    .toBeCloseTo(scaleBefore, 6);
  expect(await getSessionCommands(page).then(function(list) {
    return list.pop();
  })).toContain('fix-scale');

  // Fix output: the width is held and the scale absorbs the change instead.
  await segments.filter({hasText: 'Fix output'}).click();
  await setInput(page, '.frame-toolbar-margin-input', '10%');
  await fit.click();
  await expect.poll(async function() {
    return (await getSessionCommands(page)).pop();
  }).toContain("margin='10%'");
  var padded = await getFrameInfo(page);
  expect(padded.width).toBe(fitted.width);
  // The margin widened the extent beyond the unpadded fit.
  expect(padded.bbox[2] - padded.bbox[0])
    .toBeGreaterThan(fitted.bbox[2] - fitted.bbox[0]);

  // A margin of several values is kept even when its first value is zero.
  await setInput(page, '.frame-toolbar-margin-input', '0 10%');
  await fit.click();
  await expect.poll(async function() {
    return (await getSessionCommands(page)).pop();
  }).toContain("margin='0 10%'");
  var sidesOnly = await getFrameInfo(page);
  expect(sidesOnly.bbox[2] - sidesOnly.bbox[0])
    .toBeCloseTo(padded.bbox[2] - padded.bbox[0], 6);
  expect(sidesOnly.bbox[3] - sidesOnly.bbox[1])
    .toBeLessThan(padded.bbox[3] - padded.bbox[1]);
});

// Symbols are sized in output pixels, so a frame fitted to the points alone
// cuts the ones at its edges in half.
test('Fit makes room for symbols at the edges of the layers', async function({page}) {
  await loadFixture(page);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand(
      '-style r=20 target=three_points ' +
      '-frame bbox=-80,30,-70,40 width=600 name=frame'
    );
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.openFrameTool();
  });
  await page.locator('.frame-toolbar .text-btn').filter({hasText: 'Fit'}).click();
  await expect.poll(async function() {
    return (await getSessionCommands(page)).pop();
  }).toContain('-update-frame fit=');

  var frame = await getFrameInfo(page);
  var pxPerUnit = frame.width / (frame.bbox[2] - frame.bbox[0]);
  // the fixture's westernmost, easternmost and northernmost points
  expect((-79.04411780507252 - frame.bbox[0]) * pxPerUnit).toBeCloseTo(20, 3);
  expect((frame.bbox[2] - -54.58299719960377) * pxPerUnit).toBeCloseTo(20, 3);
  expect((frame.bbox[3] - 43.08771393436908) * pxPerUnit).toBeCloseTo(20, 3);
});

test('the resize toolbar sets and clears a fixed ratio', async function({page}) {
  await loadFixture(page);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand(
      '-frame bbox=-80,30,-70,40 width=600 name=frame'
    );
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.openFrameTool();
  });

  var ratio = page.locator('.frame-toolbar-aspect-input');
  await expect(ratio).toHaveValue('');
  await setInput(page, '.frame-toolbar-aspect-input', '3:2');
  await expect.poll(async function() {
    var frame = await getFrameInfo(page);
    return frame.width / frame.height;
  }).toBeCloseTo(1.5, 6);
  // The field reads back the ratio the frame actually has. A ratio with a name
  // keeps its w:h form; one without is shown as a number.
  await expect(ratio).toHaveValue('3:2');

  // Junk is refused and the field snaps back to the frame's real ratio.
  await setInput(page, '.frame-toolbar-aspect-input', 'wide');
  await expect(ratio).toHaveValue('3:2');
  expect((await getFrameInfo(page)).width / (await getFrameInfo(page)).height)
    .toBeCloseTo(1.5, 6);

  await setInput(page, '.frame-toolbar-aspect-input', '2:1');
  await expect(ratio).toHaveValue('2');

  // Blank returns the frame to the shape of its extent.
  await setInput(page, '.frame-toolbar-aspect-input', '');
  await expect.poll(async function() {
    return (await getSessionCommands(page)).join('\n');
  }).toContain('auto-aspect');
  await expect(ratio).toHaveValue('');
});

test('the resize tool closes when the frame is deleted', async function({page}) {
  await loadFixture(page);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand(
      '-frame bbox=-80,30,-70,40 width=600 name=frame'
    );
  });
  await openLayersPanel(page);
  await page.evaluate(function() {
    window.mapshaper.undoTest.openFrameTool();
  });
  await expect(page.locator('.frame-toolbar')).toBeVisible();

  await page.locator('.map-frame-list .more-btn').click();
  await page.locator('.contextmenu-item').filter({hasText: 'delete frame'}).click();
  await expect.poll(function() {
    return getFrameInfo(page);
  }).toBeNull();
  await expect(page.locator('.frame-toolbar')).not.toBeVisible();
  await expect(page.locator('.frame-edit-box')).not.toBeVisible();
  expect(await page.evaluate(function() {
    return window.mapshaper.undoTest.getInteractionMode();
  })).toBe('off');
});

// -proj rewrites the frame through the same sweep that projects the data, so
// the frame's display copy has to be thrown away with everything else. Keeping
// it left the map drawing a pre-projection rectangle.
test('projecting a layer redraws the frame it carries', async function({page}) {
  await loadFixture(page);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand(
      '-rectangle bbox=-170,-50,170,70 name=world ' +
      '-frame bbox=-170,-50,170,70 width=800 name=frame target=world'
    );
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.setPreviewMode(true);
  });
  var before = await getFrameInfo(page);
  expect(await page.evaluate(function() {
    return window.mapshaper.undoTest.getPreviewReadout();
  })).toContain(String(Math.round(before.height)));

  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand('-proj robin target=world');
  });
  var after = await getFrameInfo(page);
  // Robinson is not as tall as plate carree here, so the page shape changed.
  expect(Math.round(after.height)).not.toBe(Math.round(before.height));
  // What the map shows has to agree with what the frame now is.
  await expect.poll(async function() {
    return page.evaluate(function() {
      return window.mapshaper.undoTest.getPreviewReadout();
    });
  }).toContain(String(Math.round(after.height)));
});

test('export treats the frame as output settings, not a selectable layer', async function({page}) {
  await loadFixture(page);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand(
      '-frame bbox=-80,30,-70,40 width=600 name=frame'
    );
  });
  await page.locator('.export-btn').click();
  await expect(page.locator('.export-options')).toBeVisible();
  await expect(page.locator('.export-layer-list .layer-item')).toHaveCount(1);
  await expect(page.locator('.export-layer-list')).not.toContainText('frame');
});

// A frame fitted to bare points has to grow when the points get symbols and
// Fit is clicked again.
test('Fit re-fits the frame after the points are styled', async function({page}) {
  await loadFixture(page);
  await openLayersPanel(page);
  await page.locator('.map-frame-empty').click();
  await page.locator('.frame-create-popup .dialog-btn')
    .filter({hasText: 'Fit visible layers'}).click();
  await expect.poll(function() {
    return getFrameInfo(page);
  }).not.toBeNull();
  var before = await getFrameInfo(page);
  await page.evaluate(function() {
    window.mapshaper.undoTest.openFrameTool();
  });
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand('-style r=10 target=three_points');
  });
  await page.waitForTimeout(200);
  await page.locator('.frame-toolbar .text-btn').filter({hasText: 'Fit'}).click();
  await expect.poll(async function() {
    return (await getSessionCommands(page)).pop();
  }).toContain('-update-frame fit=');
  var after = await getFrameInfo(page);
  expect(after.bbox[0]).toBeLessThan(before.bbox[0]);
  expect(after.bbox[2]).toBeGreaterThan(before.bbox[2]);
});

test('layers can still be reordered by dragging', async function({page}) {
  await loadFixture(page);
  await openLayersPanel(page);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand('-filter true + name=copy');
  });
  var names = page.locator('.layer-list .layer-name');
  await expect(names).toHaveText(['copy', 'three_points']);
  var rows = page.locator('.layer-list .layer-item');
  var from = await rows.nth(0).boundingBox();
  var to = await rows.nth(1).boundingBox();
  await rows.nth(0).hover();
  await rows.nth(1).hover();
  await page.mouse.move(from.x + 5, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 5, to.y + to.height - 3, {steps: 5});
  await page.mouse.up();
  await expect(names).toHaveText(['three_points', 'copy']);
});

async function loadFixture(page, file) {
  var url = '/?undo=on&undo-test=on&files=' + encodeURIComponent(file || POINT_FIXTURE);
  await page.goto(url);
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest;
  });
  await page.waitForFunction(function() {
    return window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
}

async function getFrameInfo(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getFrameInfo();
  });
}

async function setInput(page, selector, value) {
  var input = page.locator(selector);
  await input.evaluate(function(el, nextValue) {
    el.value = nextValue;
    el.dispatchEvent(new Event('change', {bubbles: true}));
  }, value);
}

async function getSessionCommands(page) {
  return page.evaluate(function() {
    return window.mapshaper.undoTest.getSessionHistory().commands;
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
