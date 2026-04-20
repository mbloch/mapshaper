import { getFeatureCount, layerHasPaths } from '../dataset/mapshaper-layer-utils';
import { aggregateDataRecords } from '../dissolve/mapshaper-data-aggregation';
import { cloneShapes } from '../paths/mapshaper-shape-utils';
import { dissolvePointGeometry } from '../dissolve/mapshaper-point-dissolve';
import { dissolvePolylineGeometry } from '../dissolve/mapshaper-polyline-dissolve';
import { dissolvePolygonGeometry } from '../dissolve/mapshaper-polygon-dissolve';
import { dissolvePolygonLayer2 } from '../dissolve/mapshaper-polygon-dissolve2';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { findSegmentIntersections } from '../paths/mapshaper-segment-intersection';
import { getCategoryClassifier } from '../dissolve/mapshaper-data-aggregation';
import { applyCommandToLayerSelection } from '../dataset/mapshaper-command-utils';
import utils from '../utils/mapshaper-utils';
import { message, stop } from '../utils/mapshaper-logging';
import cmd from '../mapshaper-cmd';
import { DataTable } from '../datatable/mapshaper-data-table';

// Options that require the topology-repair algorithm and are not supported
// by the no-repair fast path.
var REPAIR_REQUIRED_OPTS = ['gap_fill_area', 'sliver_control', 'allow_overlaps'];

// Sample size used to detect intersections in no-repair mode. Detection stops
// after this many hits, so the warning message can include sample locations
// without paying for an exhaustive scan on badly-formed input.
var INTERSECTION_SAMPLE_LIMIT = 10;

// cmd.dissolve accepts two signatures:
//   (layers, dataset, opts) — multi-layer entry used by the CLI dispatcher.
//     Polygon layers go through the topology-repairing algorithm by default,
//     or through the legacy fast algorithm when opts.no_repair is set.
//   (lyr, arcs, opts) — legacy single-layer entry, retained for backward
//     compatibility with internal callers and existing tests. Always uses the
//     legacy fast algorithm; does not perform topology repair.
//
cmd.dissolve = function(arg1, arg2, opts) {
  if (Array.isArray(arg1)) {
    return dissolveLayers(arg1, arg2, opts);
  }
  return dissolveSingleLayer(arg1, arg2, opts);
};

function dissolveLayers(layers, dataset, optsArg) {
  var opts = utils.extend({}, optsArg);
  if (opts.field) opts.fields = [opts.field]; // support old "field" parameter

  if (opts.no_repair) {
    var conflicting = REPAIR_REQUIRED_OPTS.filter(function(k) { return opts[k]; });
    if (conflicting.length > 0) {
      stop('The no-repair option is incompatible with',
        conflicting.map(function(k) { return k.replace(/_/g, '-'); }).join(', '));
    }
  }

  var anyPolygon = layers.some(function(lyr) {
    return lyr.geometry_type == 'polygon' && layerHasPaths(lyr);
  });

  if (anyPolygon) {
    if (opts.no_repair) {
      detectAndWarnIntersections(dataset, opts);
    } else {
      addIntersectionCuts(dataset, opts);
    }
  }

  return layers.map(function(lyr) {
    return dissolveOneLayer(lyr, dataset, opts);
  });
}

function dissolveOneLayer(lyr, dataset, opts) {
  if (opts.where) {
    return dissolveLayerWithWhereClause(lyr, dataset, opts);
  }
  if (opts.multipart || opts.group_points) {
    var classifier = getCategoryClassifier(opts.fields, lyr.data);
    return composeDissolveLayer(lyr, makeMultipartShapes(lyr, classifier), classifier, opts);
  }
  if (lyr.geometry_type == 'polygon') {
    return dissolvePolygonInLayer(lyr, dataset, opts);
  }
  if (lyr.geometry_type == 'polyline') {
    var polylineClassifier = getCategoryClassifier(opts.fields, lyr.data);
    var polylineShapes = dissolvePolylineGeometry(lyr, polylineClassifier, dataset.arcs, opts);
    return composeDissolveLayer(lyr, polylineShapes, polylineClassifier, opts);
  }
  if (lyr.geometry_type == 'point') {
    var pointClassifier = getCategoryClassifier(opts.fields, lyr.data);
    var pointShapes = dissolvePointGeometry(lyr, pointClassifier, opts);
    return composeDissolveLayer(lyr, pointShapes, pointClassifier, opts);
  }
  // tabular (no geometry): aggregate records only
  var nullClassifier = getCategoryClassifier(opts.fields, lyr.data);
  return composeDissolveLayer(lyr, undefined, nullClassifier, opts);
}

function dissolvePolygonInLayer(lyr, dataset, opts) {
  if (!layerHasPaths(lyr)) return lyr;
  if (opts.no_repair) {
    var classifier = getCategoryClassifier(opts.fields, lyr.data);
    var shapes = dissolvePolygonGeometry(lyr.shapes, classifier);
    return composeDissolveLayer(lyr, shapes, classifier, opts);
  }
  return dissolvePolygonLayer2(lyr, dataset, opts);
}

function dissolveLayerWithWhereClause(lyr, dataset, opts) {
  // Run dissolve on a subset of features defined by opts.where, then merge the
  // dissolved subset back together with the unselected features.
  // Topology repair (if needed) was already performed at the dataset level by
  // dissolveLayers, so the recursive call uses no_repair=true to avoid doing
  // the work a second time on a subset of the same arcs.
  var arcs = dataset.arcs;
  var subsetLyr = getLayerSelection(lyr, arcs, opts);
  var cmdOpts = utils.defaults({where: null, no_repair: true}, opts);
  var dissolved = dissolveOneLayer(subsetLyr, dataset, cmdOpts);
  var filteredLyr = getLayerSelection(lyr, arcs, utils.defaults({invert: true}, opts));
  var merged = cmd.mergeLayers([filteredLyr, dissolved], {verbose: false, force: true});
  return merged[0];
}

function getLayerSelection(lyr, arcs, opts) {
  var lyr2 = utils.extend({}, lyr);
  var filterOpts = {
    expression: opts.where,
    invert: !!opts.invert,
    verbose: false,
    no_replace: opts.no_replace
  };
  return cmd.filterFeatures(lyr2, arcs, filterOpts);
}

// Detect a small sample of segment intersections; print a warning if any are
// found. Used by the no-repair fast path to alert users that their input has
// topology problems. Detection stops after INTERSECTION_SAMPLE_LIMIT hits, so
// the cost is bounded for badly-formed input.
function detectAndWarnIntersections(dataset, opts) {
  if (opts.quiet || opts.silent) return;
  if (!dataset.arcs || dataset.arcs.size() === 0) return;
  var sample = findSegmentIntersections(dataset.arcs, {limit: INTERSECTION_SAMPLE_LIMIT});
  if (sample.length === 0) return;
  var atLeast = sample.length >= INTERSECTION_SAMPLE_LIMIT ? 'at least ' : '';
  message('Warning: found ' + atLeast + sample.length +
    ' segment intersection' + (sample.length == 1 ? '' : 's') +
    '. The no-repair option assumes clean topology; output may be incorrect.');
}

// Backward-compat: the legacy per-layer entry, still used by internal callers
// and by tests that exercise the original fast algorithm directly. Retains
// the original behavior (no topology repair, no multi-layer prep).
function dissolveSingleLayer(lyr, arcs, opts) {
  var dissolveShapes, classifier;
  opts = utils.extend({}, opts);
  if (opts.where) {
    return applyCommandToLayerSelection(dissolveSingleLayer, lyr, arcs, opts);
  }
  if (opts.field) opts.fields = [opts.field];
  classifier = getCategoryClassifier(opts.fields, lyr.data);
  if (opts.multipart || opts.group_points) {
    dissolveShapes = makeMultipartShapes(lyr, classifier);
  } else if (lyr.geometry_type == 'polygon') {
    dissolveShapes = dissolvePolygonGeometry(lyr.shapes, classifier);
  } else if (lyr.geometry_type == 'polyline') {
    dissolveShapes = dissolvePolylineGeometry(lyr, classifier, arcs, opts);
  } else if (lyr.geometry_type == 'point') {
    dissolveShapes = dissolvePointGeometry(lyr, classifier, opts);
  }
  return composeDissolveLayer(lyr, dissolveShapes, classifier, opts);
}

function makeMultipartShapes(lyr, getGroupId) {
  if (!lyr.shapes || !lyr.geometry_type) {
    stop('Layer is missing geometry');
  }
  var shapes = cloneShapes(lyr.shapes);
  var shapes2 = [];
  lyr.shapes.forEach(function(shp, i) {
    var groupId = getGroupId(i);
    if (!shp) return;
    if (!shapes2[groupId]) {
      shapes2[groupId] = shp;
    } else {
      shapes2[groupId].push.apply(shapes2[groupId], shp);
    }
  });
  return shapes2;
}

// @lyr: original undissolved layer
// @shapes: dissolved shapes
export function composeDissolveLayer(lyr, shapes, getGroupId, opts) {
  var records = null;
  var lyr2;
  if (lyr.data) {
    records = aggregateDataRecords(lyr.data.getRecords(), getGroupId, opts);
    // replace missing shapes with nulls
    for (var i=0, n=records.length; i<n; i++) {
      if (shapes && !shapes[i]) {
        shapes[i] = null;
      }
    }
  }
  lyr2 = {
    name: opts.no_replace ? null : lyr.name,
    shapes: shapes,
    data: records ? new DataTable(records) : null,
    geometry_type: lyr.geometry_type
  };
  if (!opts.silent) {
    printDissolveMessage(lyr, lyr2);
  }
  return lyr2;
}

function printDissolveMessage(pre, post) {
  var n1 = getFeatureCount(pre),
      n2 = getFeatureCount(post),
      msg = utils.format('Dissolved %,d feature%s into %,d feature%s',
        n1, utils.pluralSuffix(n1), n2,
        utils.pluralSuffix(n2));
  message(msg);
}
