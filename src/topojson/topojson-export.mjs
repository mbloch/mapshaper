
import TopoJSON from '../topojson/topojson-common';
import GeoJSON from '../geojson/geojson-export';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';
import { getPresimplifyFunction } from '../topojson/topojson-presimplify';
import { Bounds } from '../geom/mapshaper-bounds';
import { exportMetadata } from '../dataset/mapshaper-metadata';
import { explodePolygon } from '../commands/mapshaper-explode';
import { filterEmptyArcs, getAvgSegment2 } from '../paths/mapshaper-path-utils';
import { getFeatureCount, transformPointsInLayer, layerHasPoints } from '../dataset/mapshaper-layer-utils';
import { exportIds } from '../geojson/geojson-export';
import { exportProperties } from '../geojson/geojson-export';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { setCoordinatePrecision } from '../geom/mapshaper-rounding';
import { transformDatasetToPixels } from '../furniture/mapshaper-pixel-transform';
import { getFormattedStringify } from '../geojson/mapshaper-stringify';
import { copyDatasetForExport, datasetHasPaths, splitDataset, getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { getOutputFileBase } from '../utils/mapshaper-filename-utils';

TopoJSON.getPresimplifyFunction = getPresimplifyFunction;

export function exportTopoJSON(dataset, opts) {
  var extension = '.' + (opts.extension || 'json'),
      needCopy = !opts.final || datasetHasPaths(dataset) && dataset.arcs.getRetainedInterval() > 0,
      stringify = JSON.stringify;

  if (needCopy) {
    dataset = copyDatasetForExport(dataset);
  }

  if (opts.prettify) {
    stringify = getFormattedStringify('coordinates,arcs,bbox,translate,scale'.split(','));
  }

  if (opts.width > 0 || opts.height > 0) {
    opts = utils.defaults({invert_y: true}, opts);
    transformDatasetToPixels(dataset, opts);
  } else if (opts.fit_bbox) {
    transformDatasetToPixels(dataset, {fit_bbox: opts.fit_bbox});
  }

  if (opts.precision) {
    setCoordinatePrecision(dataset, opts.precision);
  }

  if (opts.singles) {
    return splitDataset(dataset).map(function(dataset) {
      return {
        content: stringify(TopoJSON.exportTopology(dataset, opts)),
        filename: (dataset.layers[0].name || 'output') + extension
      };
    });
  } else {
    return [{
      filename: opts.file || getOutputFileBase(dataset) + extension,
      content: stringify(TopoJSON.exportTopology(dataset, opts))
    }];
  }
}

// Convert a dataset object to a TopoJSON topology object
// Careful -- arcs must be a copy if further processing will occur.
TopoJSON.exportTopology = function(dataset, opts) {
  var topology = {type: "Topology", arcs: []},
      hasPaths = datasetHasPaths(dataset),
      bounds = getDatasetBounds(dataset);

  if (opts.bbox && bounds.hasBounds()) {
    topology.bbox = bounds.toArray();
  }

  if (hasPaths && opts.presimplify && !dataset.arcs.getVertexData().zz) {
    // Calculate simplification thresholds if needed
    cmd.simplify(dataset, opts);
  }
  // auto-detect quantization if arcs are present
  if (!opts.no_quantization && (opts.quantization || hasPaths)) {
    topology.transform = TopoJSON.transformDataset(dataset, bounds, opts);
  }
  if (hasPaths) {
    dissolveArcs(dataset); // dissolve/prune arcs for more compact output
    topology.arcs = TopoJSON.exportArcs(dataset.arcs, bounds, opts);
    if (topology.transform) {
      TopoJSON.deltaEncodeArcs(topology.arcs);
    }
  }

  // export layers as TopoJSON named objects
  topology.objects = dataset.layers.reduce(function(objects, lyr, i) {
    var name = lyr.name || 'layer' + (i + 1);
    objects[name] = TopoJSON.exportLayer(lyr, dataset.arcs, opts);
    return objects;
  }, {});

  if (opts.metadata) {
    topology.metadata = exportMetadata(dataset);
  }
  return topology;
};

TopoJSON.transformDataset = function(dataset, bounds, opts) {
  var bounds2 = TopoJSON.calcExportBounds(bounds, dataset.arcs, opts),
      fw = bounds.getTransform(bounds2),
      inv = fw.invert();

  function transform(x, y) {
    var p = fw.transform(x, y);
    return [Math.round(p[0]), Math.round(p[1])];
  }

  if (dataset.arcs) {
    dataset.arcs.transformPoints(transform);
  }
  // support non-standard format with quantized arcs and non-quantized points
  if (!opts.no_point_quantization) {
    dataset.layers.filter(layerHasPoints).forEach(function(lyr) {
      transformPointsInLayer(lyr, transform);
    });
  }

  // TODO: think about handling geometrical errors introduced by quantization,
  // e.g. segment intersections and collapsed polygon rings.
  return {
    scale: [inv.mx, inv.my],
    translate: [inv.bx, inv.by]
  };
};

// Export arcs as arrays of [x, y] and possibly [z] coordinates
TopoJSON.exportArcs = function(arcs, bounds, opts) {
  var fromZ = null,
      output = [];
  if (opts.presimplify) {
    fromZ = getPresimplifyFunction(bounds.width());
  }
  arcs.forEach2(function(i, n, xx, yy, zz) {
    var arc = [], p;
    for (var j=i + n; i<j; i++) {
      p = [xx[i], yy[i]];
      if (fromZ) {
        p.push(fromZ(zz[i]));
      }
      arc.push(p);
    }
    output.push(arc.length > 1 ? arc : null);
  });
  return output;
};

// Apply delta encoding in-place to an array of topojson arcs
TopoJSON.deltaEncodeArcs = function(arcs) {
  arcs.forEach(function(arr) {
    var ax, ay, bx, by, p;
    for (var i=0, n=arr.length; i<n; i++) {
      p = arr[i];
      bx = p[0];
      by = p[1];
      if (i > 0) {
        p[0] = bx - ax;
        p[1] = by - ay;
      }
      ax = bx;
      ay = by;
    }
  });
};

// Calculate the x, y extents that map to an integer unit in topojson output
// as a fraction of the x- and y- extents of the average segment.
TopoJSON.calcExportResolution = function(arcs, k) {
  // TODO: think about the effect of long lines, e.g. from polar cuts.
  var xy = getAvgSegment2(arcs);
  return [xy[0] * k, xy[1] * k];
};

// Calculate the bounding box of quantized topojson coordinates using one
// of several methods.
TopoJSON.calcExportBounds = function(bounds, arcs, opts) {
  var unitXY, xmax, ymax;
  if (opts.topojson_precision > 0) {
    unitXY = TopoJSON.calcExportResolution(arcs, opts.topojson_precision);
  } else if (opts.quantization > 0) {
    unitXY = [bounds.width() / (opts.quantization-1), bounds.height() / (opts.quantization-1)];
  } else if (opts.precision > 0) {
    unitXY = [opts.precision, opts.precision];
  } else {
    // default -- auto quantization at 0.02 of avg. segment len
    unitXY = TopoJSON.calcExportResolution(arcs, 0.02);
  }
  xmax = Math.ceil(bounds.width() / unitXY[0]) || 0;
  ymax = Math.ceil(bounds.height() / unitXY[1]) || 0;
  return new Bounds(0, 0, xmax, ymax);
};

TopoJSON.exportProperties = function(geometries, table, opts) {
  var properties = exportProperties(table, opts),
      ids = exportIds(table, opts);
  geometries.forEach(function(geom, i) {
    if (properties) {
      geom.properties = properties[i];
    }
    if (ids) {
      geom.id = ids[i];
    }
  });
};

// Export a mapshaper layer as a TopoJSON GeometryCollection
TopoJSON.exportLayer = function(lyr, arcs, opts) {
  var n = getFeatureCount(lyr),
      geometries = [],
      exporter = TopoJSON.exporters[lyr.geometry_type] || null,
      shp;
  for (var i=0; i<n; i++) {
    shp = exporter && lyr.shapes[i];
    if (shp) {
      geometries[i] = exporter(shp, arcs, opts);
    } else {
      geometries[i] = {type: null};
    }
  }
  if (lyr.data) {
    TopoJSON.exportProperties(geometries, lyr.data, opts);
  }
  return {
    type: "GeometryCollection",
    geometries: geometries
  };
};

TopoJSON.exportPolygonGeom = function(shape, coords, opts) {
  var geom = {};
  shape = filterEmptyArcs(shape, coords);
  if (!shape || shape.length === 0) {
    geom.type = null;
  } else if (shape.length > 1) {
    geom.arcs = explodePolygon(shape, coords, opts.invert_y);
    if (geom.arcs.length == 1) {
      geom.arcs = geom.arcs[0];
      geom.type = "Polygon";
    } else {
      geom.type = "MultiPolygon";
    }
  } else {
    geom.arcs = shape;
    geom.type = "Polygon";
  }
  return geom;
};

TopoJSON.exportLineGeom = function(shape, coords) {
  var geom = {};
  shape = filterEmptyArcs(shape, coords);
  if (!shape || shape.length === 0) {
    geom.type = null;
  } else if (shape.length == 1) {
    geom.type = "LineString";
    geom.arcs = shape[0];
  } else {
    geom.type = "MultiLineString";
    geom.arcs = shape;
  }
  return geom;
};

TopoJSON.exporters = {
  polygon: TopoJSON.exportPolygonGeom,
  polyline: TopoJSON.exportLineGeom,
  point: GeoJSON.exportPointGeom
};
