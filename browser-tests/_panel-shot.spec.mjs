import { test } from '@playwright/test';

var FIXTURE = 'test/data/features/snip/ring_and_line.json';

test.use({deviceScaleFactor: 3});

test('alignment shots', async function({page}) {
  await page.goto('/?undo=on&undo-test=on&files=' + encodeURIComponent(FIXTURE));
  await page.waitForFunction(function() {
    return window.mapshaper && window.mapshaper.undoTest;
  });
  await page.waitForFunction(function() {
    return window.mapshaper.undoTest.getState().model.datasetCount > 0;
  });
  await page.evaluate(function() {
    window.mapshaper.undoTest.setInteractionMode('label');
  });
  await page.locator('.floating-toolbar.label-toolbar').waitFor();

  var box = await page.locator('.mshp-main-map').boundingBox();
  var btn = page.locator('.floating-toolbar.label-toolbar .floating-toolbar-btn').nth(0);
  if (!(await btn.evaluate(function(el) { return el.classList.contains('selected'); }))) {
    await btn.click();
    await page.waitForTimeout(60);
  }
  console.log('armed: ' + await btn.evaluate(function(el) {
    return el.className;
  }));
  await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.5);
  await page.waitForTimeout(150);
  await page.keyboard.type('North');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Dakota');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  console.log(await page.evaluate(function() {
    return JSON.stringify({info: window.mapshaper.undoTest.getLayerInfo('labels'),
      symbols: document.querySelectorAll('.mapshaper-svg-symbol').length});
  }));

  // select it and hang it off to the north-east, one of the positions whose
  // offset is in ems
  await clickLabel();
  await page.locator('.text-style-panel .label-position-grid [data-position="ne"]').click();
  await page.waitForTimeout(200);
  await shoot('align-centered');

  await page.locator('.text-style-panel .label-align-buttons [data-align="left"]').click();
  await page.waitForTimeout(250);
  await shoot('align-left');
  console.log(JSON.stringify(await page.evaluate(function() {
    var symbol = document.querySelector('.mapshaper-svg-symbol');
    var node = symbol.tagName == 'text' ? symbol : symbol.querySelector('text');
    return {rec: window.mapshaper.undoTest.getLayerInfo('labels').records[0],
      x: node.getAttribute('x'), anchor: node.getAttribute('text-anchor')};
  }), null, 2));

  await page.locator('.text-style-panel .label-align-buttons [data-align="right"]').click();
  await page.waitForTimeout(250);
  await shoot('align-right');

  async function shoot(name) {
    await page.screenshot({path: 'test-results/' + name + '.png',
      clip: {x: box.x + box.width * 0.42 - 90, y: box.y + box.height * 0.5 - 70,
        width: 180, height: 110}});
  }

  async function clickLabel() {
    var r = await page.evaluate(function() {
      var node = document.querySelector('.mapshaper-svg-symbol');
      var b = node.getBoundingClientRect();
      return {x: b.x + b.width / 2, y: b.y + b.height / 2};
    });
    await page.mouse.click(r.x, r.y);
    await page.waitForTimeout(150);
  }
});
