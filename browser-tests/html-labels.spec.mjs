import { expect, test } from '@playwright/test';
import api from '../mapshaper.js';

// HTML output with html-labels: each anchored label's text, written as HTML,
// lands where the same label's SVG text does. The two versions of one map are
// laid over each other and their text compared glyph box to glyph box.
//
// See src/html/html-labels.mjs.

var MAP = '-rectangle bbox=-60,-60,360,260 name=frame -each \'type="frame", width=420\' ' +
  '-point-grid 3,2 bbox=0,0,300,200 + name=pts ' +
  '-each \'$.properties["label-text"] = ["Neb.", "Two<br>lines here", "<b>Bold</b> part", "Wis.", "Long line<wbr>wrapped", "Iowa"][this.id]\' ' +
  '-style font-size=16 r=2 ' +
  '-style label-pos=n where="this.id==0" ' +
  '-style label-pos=e label-background=pink label-padding="4 8" where="this.id==1" ' +
  '-style label-pos=s halo-width=2 halo-color=yellow where="this.id==2" ' +
  '-style dx=20 dy=-30 text-anchor=start callout=line label-background=#ddf label-padding=6 where="this.id==3" ' +
  '-style label-pos=w label-align=left line-height=1.4 where="this.id==4" ' +
  '-style label-pos=c label-padding=3 where="this.id==5"';

async function exportMap(name, flag) {
  var out = await api.applyCommands(MAP + ' -o target=* ' + name + '.html ' + flag);
  // the image is not needed to compare the labels
  return String(out[name + '.html']).replace(/<img[^>]*>/, '');
}

test('HTML labels sit where the SVG labels do', async function({page}) {
  var svg = await exportMap('a', '');
  var html = await exportMap('b', 'html-labels');
  expect(html).not.toContain('<text');
  await page.setContent(`<!doctype html><body style="margin:0">
    <div style="position:absolute;top:10px;left:10px">${svg}</div>
    <div style="position:absolute;top:10px;left:10px">${html}</div></body>`);
  var offsets = await page.evaluate(function() {
    // the last <text> of a halo'd SVG label is its text, and the first its halo
    var svgTexts = Array.from(document.querySelectorAll('#ms-a text')).filter(function(t) {
      return !t.nextElementSibling || t.nextElementSibling.tagName != 'text';
    });
    var htmlTexts = Array.from(document.querySelectorAll('#ms-b .ms-label-text > span:last-child'));
    return svgTexts.map(function(t, i) {
      var a = t.getBoundingClientRect();
      var range = document.createRange();
      range.selectNodeContents(htmlTexts[i]);
      var b = range.getBoundingClientRect();
      return [b.left - a.left, b.top - a.top, b.width - a.width, b.height - a.height];
    });
  });
  expect(offsets.length).toBe(6);
  offsets.forEach(function(arr) {
    arr.forEach(function(d) {
      expect(Math.abs(d)).toBeLessThan(0.5);
    });
  });
});

test('a background fits the HTML text with its padding around it', async function({page}) {
  var html = await exportMap('b', 'html-labels');
  await page.setContent(`<!doctype html><body style="margin:0">${html}</body>`);
  var o = await page.evaluate(function() {
    var box = document.querySelectorAll('#ms-b .ms-label-box')[1];
    var range = document.createRange();
    range.selectNodeContents(box.querySelector('.ms-label-text > span'));
    var a = box.getBoundingClientRect();
    var b = range.getBoundingClientRect();
    return {left: b.left - a.left, right: a.right - b.right,
      color: getComputedStyle(box).backgroundColor};
  });
  expect(o.left).toBeCloseTo(8, 0);
  expect(o.right).toBeCloseTo(8, 0);
  expect(o.color).toBe('rgb(255, 192, 203)');
});
