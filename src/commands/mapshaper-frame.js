/* require mapshaper-rectangle, mapshaper-furniture */

import { furnitureRenderers, getFurnitureLayerType, getFurnitureLayerData } from '../furniture/mapshaper-furniture';
import { DataTable } from '../datatable/mapshaper-data-table';
import { message, stop } from '../utils/mapshaper-logging';
import { probablyDecimalDegreeBounds } from '../geom/mapshaper-latlon';
import { Bounds } from '../geom/mapshaper-bounds';
import { getDatasetCRS } from '../geom/mapshaper-projections';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { getScaleFactorAtXY } from '../geom/mapshaper-projections';
import { importPolygon } from '../svg/geojson-to-svg';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';

cmd.frame = function(catalog, source, opts) {
  var size, bounds, tmp, dataset;
  if (+opts.width > 0 === false && +opts.pixels > 0 === false) {
    stop("Missing a width or area");
  }
  if (opts.width && opts.height) {
    opts = utils.extend({}, opts);
    // Height is a string containing either a number or a
    //   comma-sep. pair of numbers (range); here we convert height to
    //   an aspect-ratio parameter for the rectangle() function
    opts.aspect_ratio = getAspectRatioArg(opts.width, opts.height);
    // TODO: currently returns max,min aspect ratio, should return in min,max order
    // (rectangle() function should handle max,min argument correctly now anyway)
  }
  tmp = cmd.rectangle(source, opts);
  bounds = getDatasetBounds(tmp);
  if (probablyDecimalDegreeBounds(bounds)) {
    stop('Frames require projected, not geographical coordinates');
  } else if (!getDatasetCRS(tmp)) {
    message('Warning: missing projection data. Assuming coordinates are meters and k (scale factor) is 1');
  }
  size = getFrameSize(bounds, opts);
  if (size[0] > 0 === false) {
    stop('Missing a valid frame width');
  }
  if (size[1] > 0 === false) {
    stop('Missing a valid frame height');
  }
  dataset = {info: {}, layers:[{
    name: opts.name || 'frame',
    data: new DataTable([{
      width: size[0],
      height: size[1],
      bbox: bounds.toArray(),
      type: 'frame'
    }])
  }]};
  catalog.addDataset(dataset);
};

// Convert width and height args to aspect ratio arg for the rectangle() function
export function getAspectRatioArg(widthArg, heightArg) {
  // heightArg is a string containing either a number or a
  // comma-sep. pair of numbers (range);
  return heightArg.split(',').map(function(opt) {
    var height = Number(opt),
        width = Number(widthArg);
    if (!opt) return '';
    return width / height;
  }).reverse().join(',');
}

export function getFrameSize(bounds, opts) {
  var aspectRatio = bounds.width() / bounds.height();
  var height, width;
  if (opts.pixels) {
    width = Math.sqrt(+opts.pixels * aspectRatio);
  } else {
    width = +opts.width;
  }
  height = width / aspectRatio;
  return [Math.round(width), Math.round(height)];
}

function getDatasetDisplayBounds(dataset) {
  var frameLyr = findFrameLayerInDataset(dataset);
  if (frameLyr) {
    // TODO: check for coordinate issues (non-intersection with other layers, etc)
    return getFrameLayerBounds(frameLyr);
  }
  return getDatasetBounds(dataset);
}

// @lyr dataset layer
function isFrameLayer(lyr) {
  return getFurnitureLayerType(lyr) == 'frame';
}

export function findFrameLayerInDataset(dataset) {
  return utils.find(dataset.layers, function(lyr) {
    return isFrameLayer(lyr);
  });
}

export function findFrameDataset(catalog) {
  var target = utils.find(catalog.getLayers(), function(o) {
    return isFrameLayer(o.layer);
  });
  return target ? target.dataset : null;
}

export function findFrameLayer(catalog) {
  var target = utils.find(catalog.getLayers(), function(o) {
    return isFrameLayer(o.layer);
  });
  return target && target.layer || null;
}

export function getFrameLayerBounds(lyr) {
  return new Bounds(getFurnitureLayerData(lyr).bbox);
}


// @data frame data, including crs property if available
// Returns a single value: the ratio or
export function getMapFrameMetersPerPixel(data) {
  var bounds = new Bounds(data.bbox);
  var k, toMeters, metersPerPixel;
  if (data.crs) {
    // TODO: handle CRS without inverse projections
    // scale factor is the ratio of coordinate distance to true distance at a point
    k = getScaleFactorAtXY(bounds.centerX(), bounds.centerY(), data.crs);
    toMeters = data.crs.to_meter;
  } else {
    // Assuming coordinates are meters and k is 1 (not safe)
    // A warning should be displayed when relevant furniture element is created
    k = 1;
    toMeters = 1;
  }
  metersPerPixel = bounds.width() / k * toMeters / data.width;
  return metersPerPixel;
}

furnitureRenderers.frame = function(d) {
  var lineWidth = 1,
      // inset stroke by half of line width
      off = lineWidth / 2,
      obj = importPolygon([[[off, off], [off, d.height - off],
        [d.width - off, d.height - off],
        [d.width - off, off], [off, off]]]);
  utils.extend(obj.properties, {
      fill: 'none',
      stroke: d.stroke || 'black',
      'stroke-width': d['stroke-width'] || lineWidth
  });
  return [obj];
};
