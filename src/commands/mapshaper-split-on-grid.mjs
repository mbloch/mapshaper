import { getPointBounds } from '../points/mapshaper-point-utils';
import { getLayerBounds } from '../dataset/mapshaper-layer-utils';
import { stop } from '../utils/mapshaper-logging';
import { DataTable } from '../datatable/mapshaper-data-table';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';

// Split the shapes in a layer according to a grid
// Return array of layers. Use -o bbox-index option to create index
//
cmd.splitLayerOnGrid = function(lyr, arcs, opts) {
  var shapes = lyr.shapes,
      type = lyr.geometry_type,
      setId = !!opts.id_field, // assign id but, don't split to layers
      fieldName = opts.id_field || "__split__",
      classify = getShapeClassifier(getLayerBounds(lyr, arcs), opts.cols, opts.rows),
      properties, layers;

  if (!type) {
    stop("Layer has no geometry");
  }

  if (!lyr.data) {
    lyr.data = new DataTable(shapes.length);
  }
  properties = lyr.data.getRecords();

  lyr.shapes.forEach(function(shp, i) {
    var bounds = type == 'point' ? getPointBounds([shp]) : arcs.getMultiShapeBounds(shp);
    var name = bounds.hasBounds() ? classify(bounds) : '';
    var rec = properties[i] = properties[i] || {};
    rec[fieldName] = name;
  });

  if (setId) return lyr; // don't split layer (instead assign cell ids)

  return cmd.splitLayer(lyr, fieldName).filter(function(lyr) {
    var name = lyr.data.getRecordAt(0)[fieldName];
    lyr.name = name;
    lyr.data.deleteField(fieldName);
    return !!name;
  });

  function getShapeClassifier(bounds, cols, rows) {
    var xmin = bounds.xmin,
        ymin = bounds.ymin,
        w = bounds.width(),
        h = bounds.height();

    if (rows > 0 === false || cols > 0 === false) {
      stop('Invalid grid parameters');
    }

    if (w > 0 === false || h > 0 === false) {
      cols = 1;
      rows = 1;
    }

    return function(bounds) {
      var c = Math.floor((bounds.centerX() - xmin) / w * cols),
          r = Math.floor((bounds.centerY() - ymin) / h * rows);
      c = utils.clamp(c, 0, cols-1) || 0;
      r = utils.clamp(r, 0, rows-1) || 0;
      return "r" + r + "c" + c;
    };
  }
};
