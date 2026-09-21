import { expect, test } from '@playwright/test';

var POINT_FIXTURE = 'test/data/geojson/three_points.geojson';

test('layer panel creates a frame from the visible layers', async function({page}) {
  await loadFixture(page);

  await page.locator('.sidebar-tab.layer-tab').click();
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
    /size\d+ × \d+ px/
  );
});

test('fitting visible layers applies the aspect ratio and margin', async function({page}) {
  await loadFixture(page);
  await page.locator('.sidebar-tab.layer-tab').click();
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
    .toContain("aspect-ratio=1.25 offset='10%'");
});

// A drawn box is already the extent the user meant, so the margin is not
// offered for it and must not leak into the command.
test('a drawn frame takes the aspect ratio but no margin', async function({page}) {
  await loadFixture(page);
  await page.locator('.sidebar-tab.layer-tab').click();
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
  expect(command).not.toContain('offset');
});

test('an unusable aspect ratio keeps the dialog open', async function({page}) {
  await loadFixture(page);
  await page.locator('.sidebar-tab.layer-tab').click();
  await page.locator('.map-frame-empty').click();
  await setInput(page, '.frame-create-aspect-input', '0:3');
  await page.locator('.frame-create-popup .dialog-btn')
    .filter({hasText: 'Fit visible layers'}).click();

  await expect(page.locator('.frame-create-popup')).toBeVisible();
  expect(await getFrameInfo(page)).toBeNull();
});

// Blank is the default and means "take the shape of the frame area", so it
// must not reach the command as an aspect-ratio option.
test('a blank aspect ratio sends no aspect-ratio option', async function({page}) {
  await loadFixture(page);
  await page.locator('.sidebar-tab.layer-tab').click();
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
  await page.locator('.sidebar-tab.layer-tab').click();
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

test('draw frame uses a dedicated Done and Cancel interface', async function({page}) {
  await loadFixture(page);
  await page.locator('.sidebar-tab.layer-tab').click();
  await page.locator('.map-frame-empty').click();
  await page.locator('.frame-create-popup .dialog-btn')
    .filter({hasText: 'Draw on the map'}).click();

  await expect(page.locator('.frame-draw-toolbar')).toBeVisible();
  await expect(page.locator('.frame-draw-toolbar')).toContainText('DoneCancel');
  await expect(page.locator('.box-tool-options')).toBeHidden();
  await expect(page.locator('.pointer-btn')).not.toHaveClass(/selected/);
  await expect(page.locator('.alert-wrapper.non-blocking')).toContainText(
    'Click to place the first corner'
  );
  await expect(page.locator('.frame-draw-toolbar .text-btn')
    .filter({hasText: 'Done'})).toHaveClass(/disabled/);
  await page.locator('.frame-draw-toolbar .text-btn')
    .filter({hasText: 'Cancel'}).click();
  await expect(page.locator('.frame-draw-toolbar')).toBeHidden();
  expect(await getFrameInfo(page)).toBeNull();

  await page.locator('.map-frame-empty').click();
  await page.locator('.frame-create-popup .dialog-btn')
    .filter({hasText: 'Draw on the map'}).click();

  await expect(page.locator('.alert-wrapper.non-blocking')).toBeVisible();
  var mapBox = await page.locator('.map-layers').boundingBox();
  await page.mouse.click(mapBox.x + 120, mapBox.y + 100);
  await page.mouse.move(mapBox.x + 480, mapBox.y + 380);
  await page.mouse.click(mapBox.x + 480, mapBox.y + 380);
  await expect(page.locator('.frame-draw-box')).toBeVisible();
  await expect(page.locator('.alert-wrapper.non-blocking')).toBeHidden();
  await expect(page.locator('.frame-draw-toolbar .text-btn')
    .filter({hasText: 'Done'})).not.toHaveClass(/disabled/);

  await page.locator('.frame-draw-toolbar .text-btn')
    .filter({hasText: 'Done'}).click();
  await expect.poll(function() {
    return getFrameInfo(page);
  }).not.toBeNull();
});

test('frame properties edits output size through an undoable command', async function({page}) {
  await loadFixture(page);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand(
      '-frame bbox=-80,30,-70,40 width=600 name=frame'
    );
  });
  await page.locator('.sidebar-tab.layer-tab').click();
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
    await page.locator('.sidebar-tab.layer-tab').click();
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

test('frame properties shows aspect ratio without offering to set it',
  async function({page}) {
    await loadFixture(page);
    await page.evaluate(function() {
      return window.mapshaper.undoTest.runCommand(
        '-frame bbox=-80,30,-70,40 width=600 name=frame'
      );
    });
    await page.locator('.sidebar-tab.layer-tab').click();
    await page.locator('.map-frame-list .layer-item').click();

    var panel = page.locator('.frame-properties-popup');
    await expect(panel).toContainText('1:1 (from extent)');
    // The name is edited in the layer list, and the ratio through the resize
    // tool, so neither has a control here.
    await expect(panel).not.toContainText('Name');
    await expect(panel).not.toContainText('Ground resolution');
    await expect(panel.locator('select')).toHaveCount(1); // units only
  });

test('clicking the map frame row opens frame properties', async function({page}) {
  await loadFixture(page);
  await page.evaluate(function() {
    return window.mapshaper.undoTest.runCommand(
      '-frame bbox=-80,30,-70,40 width=600 name=frame'
    );
  });
  await page.locator('.sidebar-tab.layer-tab').click();
  await page.locator('.map-frame-list .layer-item').click();

  await expect(page.locator('.frame-properties-popup')).toBeVisible();
  expect(await page.evaluate(function() {
    return window.mapshaper.undoTest.getInteractionMode();
  })).toBe('off');
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

test('frame appearance renders as a background and top neatline', async function({page}) {
  await loadFixture(page);
  await page.evaluate(async function() {
    await window.mapshaper.undoTest.runCommand(
      '-frame bbox=-80,30,-70,40 width=600 name=frame'
    );
    await window.mapshaper.undoTest.runCommand(
      "-style fill='#f2e3c6' fill-opacity=0.75 stroke='#234567' " +
      'stroke-width=3 target=frame'
    );
    window.mapshaper.undoTest.setPreviewMode(true);
  });
  await expect(page.locator('.preview-page-background')).toHaveAttribute('fill', '#f2e3c6');
  await expect(page.locator('.preview-page-background')).toHaveAttribute('fill-opacity', '0.75');
  await expect(page.locator('.preview-page-neatline')).toHaveAttribute('stroke', '#234567');
  await expect(page.locator('.preview-page-neatline')).toHaveAttribute('stroke-width', '3');

  var order = await page.evaluate(function() {
    var layers = document.querySelector('.map-layers');
    var children = Array.from(layers.children);
    return {
      background: children.indexOf(document.querySelector('.preview-background-overlay')),
      firstCanvas: children.findIndex(function(el) { return el.tagName == 'CANVAS'; }),
      neatlineOverlay: children.indexOf(document.querySelector('.preview-overlay'))
    };
  });
  expect(order.background).toBeLessThan(order.firstCanvas);
  expect(order.neatlineOverlay).toBeGreaterThan(order.firstCanvas);
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

  await page.locator('.export-formats input[value="svg"]').check();
  await expect(page.locator('.export-frame-info')).toContainText(
    'Map frame: 600 × 600 px'
  );
});

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
