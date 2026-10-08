import require from '../mapshaper-require';
import { runningInBrowser } from '../mapshaper-env';
import { findFontFace } from '../fonts/mapshaper-font-lookup';
import { stop } from '../utils/mapshaper-logging';

// Renders an SVG document as a PNG or JPEG image.
//
// Node uses resvg, compiled to WebAssembly, which cannot see the fonts
// installed on the computer: the files for the families a document names are
// found the way label measurement finds them (see mapshaper-font-lookup.mjs)
// and handed to it. The browser draws the document on a canvas with its own
// fonts.

var resvgPromise = null;

// opts:
//   width, height  size of the document, in CSS pixels
//   scale          image pixels per CSS pixel
//   format         'png' or 'jpeg' (JPEG is drawn over a white background)
//   quality        JPEG quality, 1-100
// Returns the bytes of the image file.
export async function rasterizeSVG(svg, opts) {
  if (runningInBrowser()) {
    return rasterizeInBrowser(svg, opts);
  }
  return rasterizeWithResvg(svg, opts);
}

async function rasterizeWithResvg(svg, opts) {
  var resvg = await loadResvg();
  var renderer = new resvg.Resvg(svg, {
    fitTo: {mode: 'width', value: getImageSize(opts.width, opts.scale)},
    background: opts.format == 'jpeg' ? 'white' : undefined,
    font: svgHasText(svg) ? getResvgFontOptions(svg) : {fontBuffers: []}
  });
  var img = renderer.render();
  var content;
  try {
    if (opts.format == 'jpeg') {
      content = require('jpeg-js').encode({
        data: Buffer.from(img.pixels),
        width: img.width,
        height: img.height
      }, opts.quality).data;
    } else {
      content = Buffer.from(img.asPng());
    }
  } finally {
    // wasm memory is not garbage-collected
    img.free();
    renderer.free();
  }
  return content;
}

function loadResvg() {
  var resvg, fs;
  if (!resvgPromise) {
    resvg = require('@resvg/resvg-wasm');
    fs = require('fs');
    // initWasm() throws if it is called a second time
    resvgPromise = resvg.initWasm(fs.readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')))
      .then(function() { return resvg; });
  }
  return resvgPromise;
}

function svgHasText(svg) {
  return /<text\b/.test(svg);
}

// Regular and bold faces of each family named in @svg, plus the faces that
// the generic families resolve to on this computer.
function getResvgFontOptions(svg) {
  var paths = [];
  var opts = {fontBuffers: []};
  var generics = {
    sansSerifFamily: 'sans-serif',
    serifFamily: 'serif',
    monospaceFamily: 'monospace'
  };
  getFontFamilies(svg).concat(Object.values(generics)).forEach(function(family) {
    [400, 700].forEach(function(weight) {
      var face = findFontFace(family, weight, false);
      if (face && !paths.includes(face.path)) paths.push(face.path);
    });
  });
  Object.keys(generics).forEach(function(key) {
    var face = findFontFace(generics[key], 400, false);
    if (face) opts[key] = face.families[0];
  });
  opts.defaultFontFamily = opts.sansSerifFamily;
  opts.fontBuffers = paths.map(function(path) {
    return require('fs').readFileSync(path);
  });
  return opts;
}

function getFontFamilies(svg) {
  var families = [];
  var rxp = /font-family(?:="|:\s*)([^";]+)/g;
  var match, family;
  while ((match = rxp.exec(svg)) !== null) {
    family = match[1].replace(/&quot;|&apos;/g, '"').trim();
    if (!families.includes(family)) families.push(family);
  }
  return families;
}

async function rasterizeInBrowser(svg, opts) {
  var url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
  var canvas = document.createElement('canvas');
  var img = new Image();
  var ctx, blob;
  try {
    img.src = url;
    await img.decode();
    canvas.width = getImageSize(opts.width, opts.scale);
    canvas.height = getImageSize(opts.height, opts.scale);
    ctx = canvas.getContext('2d');
    if (opts.format == 'jpeg') {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    blob = await new Promise(function(resolve) {
      canvas.toBlob(resolve, 'image/' + opts.format, opts.quality / 100);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
  if (!blob) stop('Unable to render the map image');
  return new Uint8Array(await blob.arrayBuffer());
}

// The pixel-ratio= option: image pixels per CSS pixel (default is 2, for
// sharp images on high-density displays)
export function getPixelRatio(opts) {
  var val = opts.pixel_ratio === undefined ? 2 : opts.pixel_ratio;
  if (val > 0 === false || val > 8) {
    stop('Expected pixel-ratio= to be a number greater than 0 and no more than 8');
  }
  return val;
}

function getImageSize(cssPixels, scale) {
  return Math.max(1, Math.round(cssPixels * scale));
}
