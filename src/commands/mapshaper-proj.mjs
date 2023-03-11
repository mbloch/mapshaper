import { editArcs } from '../paths/mapshaper-arc-editor';
import { editShapes, cloneShapes } from '../paths/mapshaper-shape-utils';
import {
  getProjTransform2,
  getCrsInfo,
  parsePrj,
  crsAreEqual,
  getDatasetCrsInfo,
  setDatasetCrsInfo
} from '../crs/mapshaper-projections';
import { preProjectionClip } from '../crs/mapshaper-spherical-clipping';
import { cleanLayers } from '../commands/mapshaper-clean';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { projectAndDensifyArcs } from '../crs/mapshaper-densify';
import { expandProjDefn } from '../crs/mapshaper-projection-params';
import { layerHasPoints, copyLayerShapes } from '../dataset/mapshaper-layer-utils';
import { datasetHasGeometry } from '../dataset/mapshaper-dataset-utils';
import { runningInBrowser } from '../mapshaper-env';
import { stop, message, error } from '../utils/mapshaper-logging';
import { importFile } from '../io/mapshaper-file-import';
import { buildTopology } from '../topology/mapshaper-topology';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import geom from '../geom/mapshaper-geom';

cmd.proj = function(dataset, catalog, opts) {
  var srcInfo, destInfo, destStr;
  if (opts.init) {
    srcInfo = fetchCrsInfo(opts.init, catalog);
    if (!srcInfo.crs) stop("Unknown projection source:", opts.init);
    setDatasetCrsInfo(dataset, srcInfo);
  }
  if (opts.match) {
    destInfo = fetchCrsInfo(opts.match, catalog);
  } else if (opts.crs) {
    destStr = expandProjDefn(opts.crs, dataset);
    destInfo = getCrsInfo(destStr);
  }
  if (destInfo) {
    projCmd(dataset, destInfo, opts);
  }
};

function projCmd(dataset, destInfo, opts) {
  // modify copy of coordinate data when running in web UI, so original shapes
  // are preserved if an error occurs
  var modifyCopy = runningInBrowser(),
      originals = [],
      target = {info: dataset.info || {}};

  if (!destInfo.crs) {
    stop("Missing projection data");
  }

  if (!datasetHasGeometry(dataset)) {
    // still set the crs of datasets that are missing geometry
    setDatasetCrsInfo(dataset, destInfo);
    return;
  }

  var srcInfo = getDatasetCrsInfo(dataset);
  if (!srcInfo.crs) {
    stop("Unable to project -- source coordinate system is unknown");
  }

  if (crsAreEqual(srcInfo.crs, destInfo.crs)) {
    message("Source and destination CRS are the same");
    return;
  }

  if (dataset.arcs) {
    dataset.arcs.flatten(); // bake in any pending simplification
    target.arcs = modifyCopy ? dataset.arcs.getCopy() : dataset.arcs;
  }

  target.layers = dataset.layers.map(function(lyr) {
    if (modifyCopy) {
      originals.push(lyr);
      lyr = copyLayerShapes(lyr);
    }
    return lyr;
  });

  projectDataset(target, srcInfo.crs, destInfo.crs, opts || {});

  // dataset.info.prj = destInfo.prj; // may be undefined
  setDatasetCrsInfo(target, destInfo);

  dataset.arcs = target.arcs;
  originals.forEach(function(lyr, i) {
    // replace original layers with modified layers
    utils.extend(lyr, target.layers[i]);
  });
}


// name: a layer identifier, .prj file or projection defn
// Converts layer ids and .prj files to CRS defn
// Returns projection defn
export function fetchCrsInfo(name, catalog) {
  var dataset, source, info = {};
  if (/\.prj$/i.test(name)) {
    dataset = importFile(name, {});
    if (dataset) {
      info.prj = dataset.info.prj;
      info.crs = parsePrj(info.prj);
    }
    return info;
  }
  if (catalog && (source = catalog.findSingleLayer(name))) {
    dataset = source.dataset;
    return getDatasetCrsInfo(dataset);
  }
  // assume name is a projection defn
  return getCrsInfo(name);
}

export function projectDataset(dataset, src, dest, opts) {
  var proj = getProjTransform2(src, dest); // v2 returns null points instead of throwing an error
  var badArcs = 0;
  var badPoints = 0;
  var clipped = preProjectionClip(dataset, src, dest, opts);
  dataset.layers.forEach(function(lyr) {
    if (layerHasPoints(lyr)) {
      badPoints += projectPointLayer(lyr, proj); // v2 compatible (invalid points are removed)
    }
  });
  if (dataset.arcs) {
    if (opts.densify) {
      badArcs = projectAndDensifyArcs(dataset.arcs, proj);
    } else {
      badArcs = projectArcs2(dataset.arcs, proj);
    }
  }

  if (clipped) {
    // TODO: could more selective in cleaning clipped layers
    // (probably only needed when clipped area crosses the antimeridian or includes a pole)
    cleanProjectedPathLayers(dataset);
  }

  if (badArcs > 0 && !opts.quiet) {
    message(`Removed ${badArcs} ${badArcs == 1 ? 'path' : 'paths'} containing unprojectable vertices.`);
  }
  if (badPoints > 0 && !opts.quiet) {
    message(`Removed ${badPoints} unprojectable ${badPoints == 1 ? 'point' : 'points'}.`);
  }
  dataset.info.crs = dest;
}

// * Heals cuts in previously split-apart polygons
// * Removes line intersections
// * TODO: what if a layer contains polygons with desired overlaps? should
//   we ignore overlaps between different features?
export function cleanProjectedPathLayers(dataset) {
  // TODO: only clean affected polygons (cleaning all polygons can be slow)
  var polygonLayers = dataset.layers.filter(lyr => lyr.geometry_type == 'polygon');
  // clean options: force a topology update (by default, this only happens when
  // vertices change during cleaning, but reprojection can require a topology update
  // even if clean does not change vertices)
  var cleanOpts = {
    allow_overlaps: true,
    rebuild_topology: true,
    no_arc_dissolve: true,
    quiet: true,
    verbose: false};
  cleanLayers(polygonLayers, dataset, cleanOpts);
 // remove unused arcs from polygon and polyline layers
  // TODO: fix bug that leaves uncut arcs in the arc table
  //   (e.g. when projecting a graticule)
  dissolveArcs(dataset);
}

// proj: function to project [x, y] point; should return null if projection fails
// TODO: fatal error if no points project?
export function projectPointLayer(lyr, proj) {
  var errors = 0;
  editShapes(lyr.shapes, function(p) {
    var p2 = proj(p[0], p[1]);
    if (!p2) errors++;
    return p2; // removes points that fail to project
  });
  return errors;
}

export function projectArcs(arcs, proj) {
  var data = arcs.getVertexData(),
      xx = data.xx,
      yy = data.yy,
      // old simplification data  will not be optimal after reprojection;
      // re-using for now to avoid error in web ui
      zz = data.zz,
      z = arcs.getRetainedInterval(),
      p;

  for (var i=0, n=xx.length; i<n; i++) {
    p = proj(xx[i], yy[i]);
    if (!p) error('Unprojectable point:', xx[i], yy[i]);
    xx[i] = p[0];
    yy[i] = p[1];
  }
  arcs.updateVertexData(data.nn, xx, yy, zz);
  arcs.setRetainedInterval(z);
}

export function projectArcs2(arcs, proj) {
  return editArcs(arcs, onPoint);
  function onPoint(append, x, y, prevX, prevY, i) {
    var p = proj(x, y);
    // TODO: prevent arcs with just one point
    if (p) {
      append(p);
    } else {
      return false; // signal that the arc is invalid (no more points will be projected in this arc)
    }
  }
}

