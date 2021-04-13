
import { requireDataField } from '../dataset/mapshaper-layer-utils';
import { requirePolygonLayer, layerHasNonNullData } from '../dataset/mapshaper-layer-utils';
import { parseColor } from '../color/color-utils';
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
  if (!Array.isArray(opts.colors)) {
    stop("Missing required colors parameter");
  }
  if (layerHasNonNullData(lyr)) {
    opts.fields.forEach(function(f, i) {
      requireDataField(lyr, f);
    });
  }
  opts.colors.forEach(parseColor); // validate colors

  var records = lyr.data ? lyr.data.getRecords() : [];
  var shapes2 = [];
  var records2 = [];
  lyr.shapes.forEach(function(shp, i) {
    var d = records[i];
    if (!d) return;
    var data =  makeDotsForShape(shp, arcs, d, opts);
    shapes2.push.apply(shapes2, data.shapes);
    records2.push.apply(records2, data.attributes);
  });

  var lyr2 = {
    name: opts.no_replace ? null : lyr.name,
    geometry_type: 'point',
    shapes: shapes2,
    data: new DataTable(records2)
  };
  return [lyr2];
};

function makeDotsForShape(shp, arcs, d, opts) {
  var retn = {
    shapes: [],
    attributes:[]
  };
  if (!shp) return retn;
  var counts = opts.fields.map(function(f) {
    return d[f] || 0;
  });
  var indexes = expandCounts(counts);
  var dots = placeDots(shp, arcs, indexes.length, opts);

  // randomize dot sequence so dots of the same color do not always overlap dots of
  // other colors in dense areas.
  // TODO: instead of random shuffling, interleave dot classes more regularly?
  shuffle(indexes);
  var idx, prevIdx = -1;
  var grouped = false;
  var coords;
  for (var i=0; i<dots.length; i++) {
    var p = dots[i];
    if (!p) continue;
    idx = indexes[i];
    if (!grouped || idx != prevIdx) {
      prevIdx = idx;
      retn.shapes.push(coords = []);
      retn.attributes.push(getDataRecord(idx, opts));
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

function shuffle(arr) {
  var tmp, i, j;
  for (i = arr.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function getDataRecord(i, opts) {
  var o = {
    fill: opts.colors[i],
    r: opts.r || 2
  };
  if (opts.opacity < 1) {
    o.opacity = opts.opacity;
  }
  return o;
}
