
import { requireDataField } from '../dataset/mapshaper-layer-utils';
import { requirePolygonLayer, layerHasNonNullData, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { validateColor } from '../color/color-utils';
import cmd from '../mapshaper-cmd';
import geom from '../geom/mapshaper-geom';
import { stop } from '../utils/mapshaper-logging';
import { DataTable } from '../datatable/mapshaper-data-table';
import utils from '../utils/mapshaper-utils';
import { explodePolygon } from '../commands/mapshaper-explode';
import { placeDotsInPolygon } from '../points/mapshaper-dot-density';

cmd.dots = function(lyr, arcs, opts) {
  requirePolygonLayer(lyr);
  if (!Array.isArray(opts.fields)) {
    stop("Missing required fields parameter");
  }
  if (layerHasNonNullData(lyr)) {
    opts.fields.forEach(function(f, i) {
      requireDataField(lyr, f);
    });
    (opts.copy_fields || []).forEach(function(f) {
      requireDataField(lyr, f);
    });
  }
  // if (!Array.isArray(opts.colors)) {
  //   stop("Missing required colors parameter");
  // }
  if (Array.isArray(opts.colors)) {
    opts.colors.forEach(validateColor);
  }

  var records = lyr.data ? lyr.data.getRecords() : [];
  var shapes2 = [];
  var records2 = [];
  lyr.shapes.forEach(function(shp, i) {
    var d = records[i];
    if (!d) return;
    var data =  makeDotsForShape(shp, arcs, d, opts);
    for (var j=0, n=data.shapes.length; j<n; j++) {
      shapes2.push(data.shapes[j]);
      records2.push(data.attributes[j]);
    }
  });

  var lyr2 = {
    geometry_type: 'point',
    shapes: shapes2,
    data: new DataTable(records2)
  };
  setOutputLayerName(lyr2, lyr, null, opts);
  return [lyr2];
};

function makeDotsForShape(shp, arcs, rec, opts) {
  var retn = {
    shapes: [],
    attributes:[]
  };
  if (!shp) return retn;
  var counts = opts.fields.map(function(f) {
    var val = rec[f] || 0;
    if (opts.per_dot > 0) {
      val = Math.round(val / opts.per_dot);
    }
    return val;
  });
  var indexes = expandCounts(counts);
  var dots = placeDots(shp, arcs, indexes.length, opts);

  // randomize dot sequence so dots of the same color do not always overlap dots of
  // other colors in dense areas.
  // TODO: instead of random shuffling, interleave dot classes more regularly?
  utils.shuffle(indexes);
  var idx, prevIdx = -1;
  var multipart = !!opts.multipart;
  var coords, p, d;
  for (var i=0; i<dots.length; i++) {
    p = dots[i];
    if (!p) continue;
    idx = indexes[i];
    if (p.length === 3 && opts.debug) {
      idx = p.pop(); // way to debug dot placement visually
    }
    if (!multipart || idx != prevIdx) {
      prevIdx = idx;
      retn.shapes.push(coords = []);
      d = getDataRecord(idx, rec, opts);
      retn.attributes.push(d);
    }
    coords.push(p);
  }
  return retn;
}

function placeDots(shp, arcs, n, opts) {
  // split apart multipart polygons for more efficient dot placement
  var polys = shp.length > 1 ? explodePolygon(shp, arcs) : [shp];
  var counts = apportionDotsByArea(polys, arcs, n);
  var dots = [];
  for (var i=0; i<polys.length; i++) {
    dots = dots.concat(placeDotsInPolygon(polys[i], arcs, counts[i], opts));
  }
  return dots;
}

function apportionDotsByArea(polys, arcs, n) {
  if (polys.length === 1) return [n];
  var areas = polys.map(function(shp) {
    return geom.getPlanarShapeArea(shp, arcs);
  });
  var remainingArea = utils.sum(areas);
  var remainingDots = n;
  return areas.map(function(area, i) {
    var pct = area / remainingArea;
    var count = Math.round(remainingDots * pct);
    remainingDots -= count;
    remainingArea -= area;
    return count;
  });
}

function expandCounts(counts) {
  var arr = [];
  counts.forEach(function(n, i) {
    while (n-- > 0) arr.push(i);
  });
  return arr;
}

// i: dot class index
// d: properties of original polygon
// opts: dots command options
export function getDataRecord(i, d, opts) {
  var o = {};
  var key = opts.save_as || 'fill';
  var values = opts.colors || opts.values;
  if (values) {
    o[key] = values[i];
    o.r = opts.r || 1.3;
  } else if (opts.r) {
    o.r = opts.r;
  }
  if (opts.copy_fields) {
    for (var j=0; j<opts.copy_fields.length; j++) {
      o[opts.copy_fields[j]] = d[opts.copy_fields[j]];
    }
  }
  return o;
}
