import { prepareDatasetForSVG, renderSVGDocument, getJpegQuality } from './mapshaper-svg';
import { rasterizeSVG, getPixelRatio } from './mapshaper-svg-rasterize';
import { getOutputFileBase } from '../utils/mapshaper-filename-utils';

// PNG and JPEG output: the whole map, labels and furniture included, drawn as
// it is in SVG output and rasterized: by resvg in Node, by a canvas in the
// browser (see mapshaper-svg-rasterize.mjs).
//
// @format: 'png' or 'jpg'
export async function exportMapImage(dataset, opts) {
  var pixelRatio = getPixelRatio(opts);
  var ext = opts.format == 'jpg' ? '.jpg' : '.png';
  var o = prepareDatasetForSVG(dataset, Object.assign({}, opts, {
    // raster layers are resampled to the pixel density of the image
    raster_res: opts.raster_res || pixelRatio,
    linked_images: false,
    // covers the seams between polygons -- see applySeamStroke()
    seam_stroke_width: 1 / pixelRatio
  }));
  var svg = renderSVGDocument(o.dataset, o.frame, o.dataset.layers, o.opts);
  var content = await rasterizeSVG(svg, {
    width: o.frame.width,
    height: o.frame.height,
    scale: pixelRatio,
    format: ext == '.jpg' ? 'jpeg' : 'png',
    quality: getJpegQuality(opts)
  });
  return [{
    filename: opts.file || getOutputFileBase(o.dataset) + ext,
    content: content
  }];
}
