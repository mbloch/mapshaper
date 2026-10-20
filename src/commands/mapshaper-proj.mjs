import { editArcs } from '../paths/mapshaper-arc-editor';
import { editShapes, cloneShapes } from '../paths/mapshaper-shape-utils';
import {
  getProjTransform2,
  getCrsInfo,
  parsePrj,
  crsAreEqual,
  getDatasetCrsInfo,
  setDatasetCrsInfo,
  isInvertibleCRS,
  isLatLngCRS,
  isProjectedCRS
} from '../crs/mapshaper-projections';
import { preProjectionClip } from '../crs/mapshaper-spherical-clipping';
import { cleanLayers } from '../commands/mapshaper-clean';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { deleteUnusedArcs } from '../paths/mapshaper-arc-clean';
import { projectAndDensifyArcs } from '../crs/mapshaper-densify';
import { expandProjDefnForTargets } from '../crs/mapshaper-projection-params';
import {
  layerHasPoints, layerHasPaths, layerHasGeometry, layerHasRaster, copyLayerShapes,
  getImplicitlyTargetedLayerNames
} from '../dataset/mapshaper-layer-utils';
import { mergeArcs } from '../dataset/mapshaper-merging';
import { DataTable } from '../datatable/mapshaper-data-table';
import { datasetHasGeometry, datasetHasRaster } from '../dataset/mapshaper-dataset-utils';
import { createRasterPreview } from '../rasters/mapshaper-raster-utils';
import { projectRasterGridForward } from '../rasters/mapshaper-raster-reprojection';
import { runningInBrowser } from '../mapshaper-env';
import { stop, message, warn, error } from '../utils/mapshaper-logging';
import { importFile } from '../io/mapshaper-file-import';
import { buildTopology } from '../topology/mapshaper-topology';
import {
  markDatasetChanged,
  markDatasetInfoChanged,
  markLayerChanged,
  noteDatasetInfoWillChange,
  noteDatasetWillChange,
  noteLayerWillChange,
  withActiveUndoTransaction
} from '../undo/mapshaper-undo-tracking';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import geom from '../geom/mapshaper-geom';
import { getProjectionTopology, isInterruptedProjection } from '../crs/mapshaper-projection-topology';
import { splitPolygonFrameChords } from '../crs/mapshaper-projection-frame-cuts';
import { getHighPrecisionSnapInterval, snapCoordsByInterval } from '../paths/mapshaper-snapping';
import {
  getFrameProjectionSnapshots,
  rebuildProjectedFrameLayer
} from '../furniture/mapshaper-frame-projection';
import {
  getFrameForDataset,
  getFrameMembers,
  getFrames,
  resolveFrameForDataset
} from '../furniture/mapshaper-frame-resolver';
import { getFrameCrsInfo } from '../furniture/mapshaper-frame-members';
import { isFrameComponentLayer } from '../furniture/mapshaper-frame-utils';
import { getLayerTargetId } from '../dataset/mapshaper-target-utils';
import { formatOptionValue } from '../cli/mapshaper-option-parsing-utils';

// Run -proj over all the targets of a single command.
// The destination CRS is resolved once here rather than separately for each
// target, for two reasons. Auto-fitted parameters (e.g. the standard parallels
// that "lcc" expands to) must describe the whole command target, not whichever
// dataset happens to be projected first. And the map frame must receive the
// same CRS as the content instead of re-deriving parameters from its own extent.
cmd.projTargets = function(targets, catalog, opts) {
  var destInfo;
  targets = expandFrameTargets(targets, catalog, opts);
  targets.forEach(function(targ) {
    applyProjInit(targ.dataset, catalog, opts);
  });
  destInfo = resolveProjDestInfo(targets, catalog, opts);
  targets.forEach(function(targ) {
    projectTarget(targ.dataset, opts, targ.layers, destInfo);
  });
  if (destInfo && destInfo.crs) {
    projectMapFrame(targets, catalog, opts, destInfo);
    warnAboutUnprojectedLayers(catalog, targets, destInfo);
  }
};

cmd.proj = function(dataset, catalog, opts, targetLayers, destInfo) {
  applyProjInit(dataset, catalog, opts);
  if (!destInfo) {
    destInfo = resolveProjDestInfo([{dataset: dataset, layers: targetLayers}], catalog, opts);
  }
  projectTarget(dataset, opts, targetLayers, destInfo);
};

function projectTarget(dataset, opts, targetLayers, destInfo) {
  var implicitlyProjectedNames = getImplicitlyTargetedLayerNames(dataset, targetLayers, layerHasGeometry);
  // A preserved GeoJSON "crs" member becomes invalid once the CRS changes.
  deleteGeoJSONMetadataCRS(dataset);
  if (!destInfo) return;
  var didProject = projCmd(dataset, destInfo, opts);
  if (didProject && implicitlyProjectedNames.length > 0) {
    message(
      'Also projected non-target layer' + utils.pluralSuffix(implicitlyProjectedNames.length) +
      ' from the same dataset: ' + implicitlyProjectedNames.join(', ')
    );
  }
}

function applyProjInit(dataset, catalog, opts) {
  if (!opts.init) return;
  var srcInfo = fetchCrsInfo(opts.init, catalog);
  if (!srcInfo.crs) stop("Unknown projection source:", opts.init);
  setDatasetCrsInfo(dataset, srcInfo);
}

// @targets [{dataset, layers}, ...] -- all the targets of one -proj command
function resolveProjDestInfo(targets, catalog, opts) {
  if (opts.match) {
    return fetchCrsInfo(opts.match, catalog);
  }
  if (!opts.crs) return null;
  return getCrsInfo(expandProjDefnForTargets(opts.crs, targets));
}

// A frame's members share its coordinate system, so targeting a frame or any of
// its members projects the whole frame: the frame dataset and every member
// dataset, with all their layers. Members without CRS metadata are read in the
// frame's coordinate system, the only reading under which they were drawn
// correctly in the frame.
function expandFrameTargets(targets, catalog, opts) {
  var expanded = [];
  var implicitNames = [];
  var frames = [];
  if (!catalog) return targets;
  targets.forEach(function(targ) {
    addTarget(targ.dataset, targ.layers);
  });
  targets.forEach(function(targ) {
    var frame = getFrameForDataset(catalog, targ.dataset);
    if (!frame || frames.includes(frame.dataset)) return;
    frames.push(frame.dataset);
    if (!targets.some(function(o) { return o.dataset == frame.dataset; })) {
      message('Also reprojected the map frame:', frame.layer.name);
    }
    [frame.dataset].concat(getFrameMembers(catalog, frame)).forEach(function(dataset) {
      addTarget(dataset, dataset.layers.filter(function(lyr) {
        return dataset != frame.dataset || !isFrameComponentLayer(lyr, dataset);
      }), true);
      addTarget(dataset, dataset.layers);
      if (!opts.init) assumeFrameCrs(catalog, frame, dataset);
    });
  });
  if (implicitNames.length > 0) {
    message('Also projected', implicitNames.length == 1 ? 'layer' : 'layers',
      'in the same frame:', implicitNames.join(', '));
  }
  return expanded;

  function addTarget(dataset, layers, implicit) {
    var target = expanded.find(function(o) { return o.dataset == dataset; });
    if (!target) {
      target = {dataset: dataset, layers: []};
      expanded.push(target);
    }
    layers.forEach(function(lyr) {
      if (target.layers.includes(lyr)) return;
      target.layers.push(lyr);
      if (implicit && layerHasGeometry(lyr)) implicitNames.push(lyr.name || '[unnamed layer]');
    });
  }
}

function assumeFrameCrs(catalog, frame, dataset) {
  var info = dataset.info || {};
  var frameInfo, guessed;
  if (info.crs || info.crs_string || info.wkt1 || info.geopackage_crs || info.flatgeobuf_crs) return;
  frameInfo = getFrameCrsInfo(catalog, frame);
  if (!frameInfo || !frameInfo.crs) return;
  guessed = getDatasetCrsInfo(dataset).crs;
  if (guessed && crsAreEqual(guessed, frameInfo.crs)) return;
  noteDatasetInfoWillChange(dataset, {operation: 'proj'});
  setDatasetCrsInfo(dataset, frameInfo);
  markDatasetInfoChanged(dataset, {operation: 'proj'});
  message('Assumed that', formatLayerNames(dataset.layers), 'use the coordinate system of frame',
    frame.layer.name);
}

function formatLayerNames(layers) {
  return layers.map(function(lyr) { return lyr.name || '[unnamed layer]'; }).join(', ');
}

// A map frame is composition state, not content: its rectangle describes a
// region of the map's coordinate space, so it has to follow the map's CRS even
// when the command targeted only a data layer. The GUI deliberately keeps the
// frame out of default targets, so nothing else reaches it. Each targeted
// dataset's frame is projected (see resolveFrameForDataset()). A frame with
// members is projected only with its members (see expandFrameTargets()).
function projectMapFrame(targets, catalog, opts, destInfo) {
  if (!catalog) return;
  targets.reduce(function(memo, targ) {
    var frame = resolveFrameForDataset(catalog, targ.dataset);
    if (frame && getFrameMembers(catalog, frame).length > 0) return memo;
    if (frame && !memo.some(function(o) { return o.dataset == frame.dataset; })) {
      memo.push(frame);
    }
    return memo;
  }, []).forEach(function(frame) {
    projectFrameDataset(frame, targets, catalog, opts, destInfo);
  });
}

function projectFrameDataset(frame, targets, catalog, opts, destInfo) {
  var frameOpts = opts;
  var frameCrs;
  if (targets.some(function(targ) { return targ.dataset == frame.dataset; })) {
    return; // already projected as an ordinary target
  }
  frameCrs = getDatasetCrsInfo(frame.dataset).crs;
  if (frameCrs && crsAreEqual(frameCrs, destInfo.crs)) {
    return; // already in the destination CRS; say nothing
  }
  if (!frameCrs) {
    warn('Unable to reproject the map frame: its coordinate system is unknown.');
    return;
  }
  if (opts.init) {
    // init= describes the CRS of the targeted data, not the frame's.
    frameOpts = Object.assign({}, opts);
    delete frameOpts.init;
  }
  cmd.proj(frame.dataset, catalog, frameOpts, frame.dataset.layers, destInfo);
  message('Also reprojected the map frame.');
}

// -proj only applies to the command's targets, so layers in other datasets are
// left behind in the old CRS. That usually surfaces much later as a blank
// export or an "unable to combine" error, so name them while the cause is clear.
// Only layers in the same group as the targets are named: frames often have
// different projections, and a frame is always projected whole (see
// expandFrameTargets()), so in practice these are unframed layers.
function warnAboutUnprojectedLayers(catalog, targets, destInfo) {
  var groups, missed, hint;
  if (!catalog) return;
  groups = targets.map(function(targ) { return getLayerGroup(catalog, targ.dataset); });
  missed = catalog.getLayers().filter(function(o) {
    var crs;
    if (!layerHasGeometry(o.layer) && !layerHasRaster(o.layer)) return false;
    if (isFrameComponentLayer(o.layer, o.dataset)) return false;
    if (!groups.includes(getLayerGroup(catalog, o.dataset))) return false;
    crs = getDatasetCrsInfo(o.dataset).crs;
    return !!crs && !crsAreEqual(crs, destInfo.crs);
  });
  if (missed.length === 0) return;
  // target=* would also project every frame, so with frames the hint lists
  // the layers of the group to target
  hint = getFrames(catalog).length > 0 ?
    `To project ${missed.length == 1 ? 'it' : 'them'} with this command, use target=` +
      getGroupTargetIds(catalog, targets, missed).join(',') + '.' :
    'Use target=* to project all layers.';
  warn(`Layer${utils.pluralSuffix(missed.length)} not projected by this command: ` +
    missed.map(function(o) { return o.layer.name || '[unnamed]'; }).join(', ') + '. ' + hint);
}

// The target ids of the layers left behind and of the targeted layers in
// their groups, in catalog order
function getGroupTargetIds(catalog, targets, missed) {
  var groups = missed.map(function(o) { return getLayerGroup(catalog, o.dataset); });
  var missedLayers = missed.map(function(o) { return o.layer; });
  return catalog.getLayers().filter(function(o) {
    if (missedLayers.includes(o.layer)) return true;
    return groups.includes(getLayerGroup(catalog, o.dataset)) && targets.some(function(targ) {
      return targ.layers.includes(o.layer);
    });
  }).map(function(o) {
    return formatOptionValue(getLayerTargetId(catalog, o.layer));
  });
}

// The frame dataset of a dataset's frame, or null for an unframed dataset
function getLayerGroup(catalog, dataset) {
  var frame = getFrameForDataset(catalog, dataset);
  return frame ? frame.dataset : null;
}

function projCmd(dataset, destInfo, opts) {
  // modify copy of coordinate data when running in web UI, so original shapes
  // are preserved if an error occurs
  var modifyCopy = runningInBrowser(),
      originals = [],
      target = {info: dataset.info || {}};

  if (!destInfo.crs) {
    stop("Missing projection data");
  }

  if (!datasetHasGeometry(dataset) && !datasetHasRaster(dataset)) {
    // still set the crs of datasets that are missing geometry
    setDatasetCrsInfo(dataset, destInfo);
    return false;
  }

  var srcInfo = getDatasetCrsInfo(dataset);
  if (!srcInfo.crs) {
    stop("Unable to project -- source coordinate system is unknown");
  }

  if (crsAreEqual(srcInfo.crs, destInfo.crs)) {
    message("Source and destination CRS are the same");
    return false;
  }

  if (dataset.arcs) {
    dataset.arcs.flatten(); // bake in any pending simplification
    target.arcs = modifyCopy ? dataset.arcs.getCopy() : dataset.arcs;
  }
  noteDatasetWillChange(dataset, {operation: 'proj'});

  target.layers = dataset.layers.map(function(lyr) {
    if (modifyCopy) {
      originals.push(lyr);
      lyr = copyLayerShapes(lyr);
    }
    return lyr;
  });

  withActiveUndoTransaction(null, function() {
    projectDataset(target, srcInfo.crs, destInfo.crs, opts || {});

    // dataset.info.wkt1 = destInfo.wkt1; // may be undefined
    setDatasetCrsInfo(target, destInfo);
  });

  dataset.arcs = target.arcs;
  originals.forEach(function(lyr, i) {
    // replace original layers with modified layers
    if (layerWasChangedByProjection(lyr, target.layers[i])) {
      noteLayerWillChange(lyr, {operation: 'proj'});
      utils.extend(lyr, target.layers[i]);
      markLayerChanged(lyr, {operation: 'proj'});
    }
  });
  markDatasetChanged(dataset, {operation: 'proj'});
  return true;
}

// Drop the "crs" member from preserved GeoJSON metadata, so a stale CRS is not
// re-emitted after the dataset has been reprojected. Other metadata is retained.
function deleteGeoJSONMetadataCRS(dataset) {
  var meta = dataset.info && dataset.info.input_geojson_metadata;
  if (meta && 'crs' in meta) {
    delete meta.crs;
  }
}

function layerWasChangedByProjection(a, b) {
  return a.name != b.name ||
    a.geometry_type != b.geometry_type ||
    a.data !== b.data ||
    a.raster !== b.raster ||
    !arraysAreEqual(a.shapes, b.shapes);
}

function arraysAreEqual(a, b) {
  var val;
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    val = a[i];
    if (Array.isArray(val)) {
      if (!arraysAreEqual(val, b[i])) return false;
    } else if (val !== b[i]) {
      return false;
    }
  }
  return true;
}

// name: a layer identifier, .prj file or projection defn
// Converts layer ids and .prj files to CRS defn
// Returns projection defn
export function fetchCrsInfo(name, catalog) {
  var dataset, source, info = {};
  if (/\.prj$/i.test(name)) {
    dataset = importFile(name, {});
    if (dataset) {
      info.wkt1 = dataset.info.wkt1;
      info.crs = parsePrj(info.wkt1);
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
  if (isProjectedCRS(src) && !isInvertibleCRS(src)) {
    stop('Unable to project from a coordinate system that has no inverse transform');
  }
  if (dest.__projection_views && isLatLngCRS(src) && !opts.no_clip) {
    projectDatasetViews(dataset, src, dest, opts);
    return;
  }
  var proj = getProjTransform2(src, dest); // v2 returns null points instead of throwing an error
  var frameSnapshots = getFrameProjectionSnapshots(dataset);
  var badArcs = 0;
  var badPoints = 0;
  var topology = getProjectionTopology(dest);
  // Arcs and points in parts of the globe that the projection does not show
  // are removed by design, so they are not reported as projection failures
  var hidesAreas = !!(topology && topology.hidden_areas);
  var healAntimeridian = isLatLngCRS(src) &&
    isInterruptedProjection(dest) &&
    (Math.abs(dest.lam0) > 1e-12 || !!(topology && topology.heal_antimeridian));
  var clipped = preProjectionClip(dataset, src, dest, opts);
  dataset.layers.forEach(function(lyr) {
    if (layerHasPoints(lyr)) {
      badPoints += projectPointLayer(lyr, proj); // v2 compatible (invalid points are removed)
    } else if (layerHasRaster(lyr)) {
      projectRasterLayer(lyr, src, dest, opts);
    }
  });
  if (dataset.arcs) {
    if (opts.densify) {
      badArcs = projectAndDensifyArcs(dataset.arcs, proj);
    } else {
      badArcs = projectArcs2(dataset.arcs, proj);
    }
  }

  var frameBounds = dest.__projection_topology &&
    dest.__projection_topology.frame_bounds;
  if (clipped && dataset.arcs && frameBounds) {
    splitPolygonFrameChords(dataset, scaleProjectionFrameBounds(frameBounds, dest));
  }

  if (clipped) {
    // TODO: could more selective in cleaning clipped layers
    // (probably only needed when clipped area crosses the antimeridian or includes a pole)
    cleanProjectedPathLayers(dataset, {heal_antimeridian: healAntimeridian});
  }

  frameSnapshots.forEach(function(snapshot) {
    rebuildProjectedFrameLayer(snapshot, dataset, proj, isLatLngCRS(src));
  });

  if (badArcs > 0 && !opts.quiet && !hidesAreas) {
    message(`Removed ${badArcs} ${badArcs == 1 ? 'path' : 'paths'} containing unprojectable vertices.`);
  }
  if (badPoints > 0 && !opts.quiet && hidesAreas) {
    message(`Removed ${badPoints} ${badPoints == 1 ? 'point' : 'points'} in areas that the projection does not show.`);
  } else if (badPoints > 0 && !opts.quiet) {
    message(`Removed ${badPoints} unprojectable ${badPoints == 1 ? 'point' : 'points'}.`);
  }
  dataset.info.crs = dest;
}

// A projection that shows some places more than once (like two hemispheres
// that share a region) has a CRS for each of its views. A copy of the vector
// layers is projected with each view, and each feature gets the parts from all
// of the views. Rasters and frames are projected with the CRS of the whole map.
function projectDatasetViews(dataset, src, dest, opts) {
  var frameSnapshots = getFrameProjectionSnapshots(dataset);
  var frameLayers = frameSnapshots.map(function(o) { return o.layer; });
  var layers = dataset.layers.filter(function(lyr) {
    return layerHasGeometry(lyr) && !frameLayers.includes(lyr);
  });
  var views = dest.__projection_views.map(function(view) {
    var copy = {
      arcs: dataset.arcs ? dataset.arcs.getCopy() : null,
      layers: layers.map(function(lyr) {
        var data = new DataTable(lyr.shapes.length);
        data.getRecords().forEach(function(rec, i) { rec.id = i; });
        return {geometry_type: lyr.geometry_type, shapes: cloneShapes(lyr.shapes), data: data};
      }),
      info: {}
    };
    projectDataset(copy, src, view, Object.assign({}, opts, {quiet: true}));
    return copy;
  });
  var arcOffsets = [];
  var arcCount = 0;
  // a view can remove all of the arcs
  var viewArcs = views.map(function(view) { return view.arcs; }).filter(Boolean);
  views.forEach(function(view) {
    arcOffsets.push(arcCount);
    arcCount += view.arcs ? view.arcs.size() : 0;
  });
  if (dataset.arcs) {
    dataset.arcs = viewArcs.length > 0 ? mergeArcs(viewArcs) : null;
  }
  layers.forEach(function(lyr, i) {
    mergeProjectedViewLayers(lyr, views.map(function(view, j) {
      var viewLyr = view.layers[i];
      if (arcOffsets[j] > 0 && layerHasPaths(viewLyr)) {
        offsetArcIds(viewLyr.shapes, arcOffsets[j]);
      }
      return viewLyr;
    }));
  });
  dataset.layers.forEach(function(lyr) {
    if (layerHasRaster(lyr)) {
      projectRasterLayer(lyr, src, dest, opts);
    }
  });
  frameSnapshots.forEach(function(snapshot) {
    // the frame's old arcs are not in the merged arcs
    snapshot.layer.shapes = snapshot.layer.shapes.map(function() { return null; });
    rebuildProjectedFrameLayer(snapshot, dataset, dest.__projection_views.map(function(view) {
      return getProjTransform2(src, view);
    }), true);
  });
  dataset.info.crs = dest;
}

// Features that were removed from every view are removed
function mergeProjectedViewLayers(lyr, viewLayers) {
  var n = lyr.shapes.length;
  var shapes = new Array(n).fill(null);
  var kept = new Array(n).fill(false);
  viewLayers.forEach(function(viewLyr) {
    viewLyr.data.getRecords().forEach(function(rec, i) {
      var shp = viewLyr.shapes[i];
      kept[rec.id] = true;
      if (shp && shp.length > 0) {
        shapes[rec.id] = shapes[rec.id] ? shapes[rec.id].concat(shp) : shp;
      }
    });
  });
  if (kept.includes(false)) {
    shapes = shapes.filter(function(shp, i) { return kept[i]; });
    if (lyr.data) {
      lyr.data = new DataTable(lyr.data.getRecords().filter(function(rec, i) { return kept[i]; }));
    }
  }
  lyr.shapes = shapes;
}

function offsetArcIds(shapes, offset) {
  shapes.forEach(function(shp) {
    if (!shp) return;
    shp.forEach(function(path) {
      for (var i = 0; i < path.length; i++) {
        path[i] = path[i] < 0 ? path[i] - offset : path[i] + offset;
      }
    });
  });
}

function scaleProjectionFrameBounds(bounds, crs) {
  var scale = crs.a * crs.fr_meter;
  var dx = crs.x0 * crs.fr_meter;
  var dy = crs.y0 * crs.fr_meter;
  return [
    bounds[0] * scale + dx,
    bounds[1] * scale + dy,
    bounds[2] * scale + dx,
    bounds[3] * scale + dy
  ];
}

function projectRasterLayer(lyr, src, dest, opts) {
  var raster = lyr.raster;
  raster.grid = projectRasterGridForward(raster, src, dest, opts || {});
  raster.view = raster.view || {};
  delete raster.view.scalingStats;
  if (runningInBrowser()) {
    raster.view.preview = createRasterPreview(raster, opts || {});
  } else {
    delete raster.view.preview;
  }
}

// * Heals cuts in previously split-apart polygons
// * Removes line intersections
// * TODO: what if a layer contains polygons with desired overlaps? should
//   we ignore overlaps between different features?
export function cleanProjectedPathLayers(dataset, opts) {
  opts = opts || {};
  // TODO: only clean affected polygons (cleaning all polygons can be slow)
  var polygonLayers = dataset.layers.filter(lyr => lyr.geometry_type == 'polygon');
  if (opts.heal_antimeridian && dataset.arcs) {
    // A rotated projection moves the source +/-180 degree boundary into the
    // map interior. Mathematically identical boundary vertices can diverge by
    // a few floating-point units during projection, preventing topology from
    // joining polygon parts that were split at the source antimeridian.
    var arcs = dataset.arcs;
    deleteUnusedArcs(dataset); // unused arcs would pull in the vertices near them
    var snapDist = getHighPrecisionSnapInterval(arcs.getBounds().toArray());
    if (snapCoordsByInterval(arcs, snapDist) > 0) {
      arcs.dedupCoords();
    }
  }
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

