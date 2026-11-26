import { prepareDatasetForSVG, renderSVGDocument } from '../svg/mapshaper-svg';
import { rasterizeSVGPixels } from '../svg/mapshaper-svg-rasterize';
import { mergeDatasetsForExport } from '../dataset/mapshaper-merging';
import { getLayerBounds } from '../dataset/mapshaper-layer-utils';
import { getFrameLayerData } from '../furniture/mapshaper-frame-utils';
import { resolveFrameForDataset } from '../furniture/mapshaper-frame-resolver';
import { Bounds } from '../geom/mapshaper-bounds';

var DEFAULT_MAP_WIDTH = 800; // CSS pixels, as in SVG output without a frame

// Grid pixels per CSS pixel of the map, so that layers drawn on @grid look as
// they do in the map's frame (or, without a frame, in an SVG of the default
// width)
// @layers [{layer, dataset}]
export function getDrawingScale(catalog, layers, grid) {
  var frame = resolveFrameForDataset(catalog, layers[0].dataset);
  var data, bounds, cssPerUnit;
  if (frame) {
    data = getFrameLayerData(frame.layer, frame.dataset.arcs);
    cssPerUnit = data.width / (data.bbox[2] - data.bbox[0]);
  } else {
    bounds = new Bounds();
    layers.forEach(function(o) {
      var bb = getLayerBounds(o.layer, o.dataset.arcs);
      if (bb) bounds.mergeBounds(bb);
    });
    cssPerUnit = bounds.hasBounds() && bounds.width() > 0 ?
      DEFAULT_MAP_WIDTH / bounds.width() : grid.width / (grid.bbox[2] - grid.bbox[0]);
  }
  return grid.width / ((grid.bbox[2] - grid.bbox[0]) * cssPerUnit);
}

// Draws layers onto the pixels of a north-up raster grid, the way PNG output
// draws them (see mapshaper-map-image-export.mjs)
// @layers [{layer, dataset}], bottom to top, in the grid's coordinate system
// @grid {width, height, bbox}
// @scale grid pixels per CSS pixel, which sets the width of strokes and the
//   size of labels and symbols (like PNG output's pixel-ratio=)
// Returns RGBA samples, not premultiplied by alpha
export async function drawLayersOnGrid(layers, grid, scale) {
  var bbox = grid.bbox;
  var width = grid.width / scale;
  var frame = {
    type: 'frame',
    bbox: bbox.concat(),
    width: width,
    height: width * (bbox[3] - bbox[1]) / (bbox[2] - bbox[0])
  };
  var datasets = groupLayersByDataset(layers);
  var dataset = datasets.length > 1 ? mergeDatasetsForExport(datasets) : datasets[0];
  var o, svg;
  dataset.layers.sort(function(a, b) { return a.draw_order - b.draw_order; });
  o = prepareDatasetForSVG(dataset, {
    final: datasets.length > 1,
    gui_frame: {data: frame},
    raster_res: scale,
    linked_images: false,
    // covers the seams between polygons -- see applySeamStroke()
    seam_stroke_width: 1 / scale,
    svg_image_size: [grid.width, grid.height]
  });
  svg = renderSVGDocument(o.dataset, o.frame, o.dataset.layers, o.opts);
  return rasterizeSVGPixels(svg, grid.width, grid.height);
}

// Shallow copies of the layers (the SVG export copies them again before
// changing them), in datasets of their own, numbered in drawing order
function groupLayersByDataset(layers) {
  var datasets = [];
  var sources = [];
  layers.forEach(function(o, i) {
    var j = sources.indexOf(o.dataset);
    var lyr = Object.assign({}, o.layer, {draw_order: i});
    if (j == -1) {
      sources.push(o.dataset);
      datasets.push(Object.assign({}, o.dataset, {layers: [lyr]}));
    } else {
      datasets[j].layers.push(lyr);
    }
  });
  return datasets;
}
