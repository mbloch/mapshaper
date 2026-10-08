import require from '../mapshaper-require';
import { runningInBrowser } from '../mapshaper-env';
import { prepareSvgForResvg } from '../fonts/mapshaper-resvg-fonts';
import { stop } from '../utils/mapshaper-logging';

// Renders an SVG document as a PNG or JPEG image.
//
// Node uses resvg, compiled to WebAssembly, which is given the font files the
// document's text needs (see mapshaper-resvg-fonts.mjs). The browser draws the
// document on a canvas with its own fonts.

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
  var prepared = svgHasText(svg) ? prepareSvgForResvg(svg) :
    {svg: svg, font: {fontBuffers: []}};
  var renderer = new resvg.Resvg(prepared.svg, {
    fitTo: {mode: 'width', value: getImageSize(opts.width, opts.scale)},
    background: opts.format == 'jpeg' ? 'white' : undefined,
    font: prepared.font
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
