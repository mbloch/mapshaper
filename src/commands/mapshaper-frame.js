/* require mapshaper-rectangle, mapshaper-furniture */

import { furnitureRenderers } from '../furniture/mapshaper-furniture';
import { getFrameSize } from '../furniture/mapshaper-frame-data';
import { DataTable } from '../datatable/mapshaper-data-table';
import { message, stop } from '../utils/mapshaper-logging';
import { probablyDecimalDegreeBounds } from '../geom/mapshaper-latlon';
import { getDatasetCRS } from '../crs/mapshaper-projections';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
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
