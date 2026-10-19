/*
 * Two-hemisphere world maps, with the hemispheres one above the other (the
 * default) or side by side. `hemispheres` projects each hemisphere with
 * Lambert azimuthal equal-area and `hemispheres2` with the orthographic
 * projection; the projection math is mproj's (spherical laea and ortho).
 *
 * Parameters:
 *   +lon_0 +lat_0  center of the upper hemisphere (the left one with
 *                  +horizontal)
 *   +lon_1 +lat_1  center of the lower (or right) hemisphere (default: the
 *                  meridian opposite lon_0, at the same latitude as lat_0)
 *   +gap           space between the two disks, as a fraction of their
 *                  radius. A negative gap overlaps the lower (or right)
 *                  disk onto the other one.
 *   +horizontal    place the hemispheres side by side
 *
 * Below, the "front" hemisphere is the lower (or right) one, which is drawn
 * in full where the disks overlap, and the "back" hemisphere is the other.
 *
 * Each disk shows the whole hemisphere around its center. Unless the centers
 * are antipodal, the two hemispheres share a region, which appears in both
 * disks, and part of the globe is more than 90 degrees from both centers,
 * which is not shown. Where the disks overlap, part of the back hemisphere
 * lies under the front disk.
 *
 * Because some places appear twice, a dataset is projected once for each
 * disk, using the CRSs in P.__projection_views, and the results are merged
 * (see projectDataset()). Before each projection, paths are cut along the
 * edge of the area that the disk shows (see insertProjectionTopologyCuts()),
 * after which each arc lies entirely inside or outside of it. A view's fwd()
 * fails for points outside the area, which removes the outside arcs.
 *
 * P.fwd() projects a point into only one disk, the one with the nearer
 * center.
 */

import { stop } from '../utils/mapshaper-logging';

var D2R = Math.PI / 180;
var R2D = 180 / Math.PI;
var FRONT = 0;
var BACK = 1;
var HIDDEN = 2;
// Traditional Eastern and Western Hemisphere maps divide the globe at 20°W and
// 160°E
var DEFAULT_LON0 = 70;
var DEFAULT_GAP = 0;
var EPS = 1e-12;
var INVERSE_TOLERANCE = 1e-7;
// A seam is traced with enough vertices that a straight lon/lat segment between
// two of them stays within this distance (in degrees) of the true boundary.
// It must be well under the width of the cut masks, so that no arc reaches
// across a cut from one region into another.
var SEAM_TOLERANCE = 5e-6;
var SEAM_MASK_WIDTH = 4e-5;
var SEAM_STEPS = 720;
var MAX_SEAM_REFINEMENT = 16;
var OUTLINE_STEPS = 720;

export function registerHemisphereProjections(mproj) {
  if (!mproj) return;
  register('hemispheres', 'Two hemispheres (Lambert azimuthal equal-area)', 'laea');
  register('hemispheres2', 'Two hemispheres (orthographic)', 'ortho');

  function register(id, name, method) {
    if (mproj.internal.pj_list[id]) return;
    mproj.pj_add(function(P) {
      initHemispheres(P, method, mproj);
    }, id, name);
  }
}

function initHemispheres(P, method, mproj) {
  var engine, lon0, views;
  if (!P.params.lon_0) {
    P.lam0 = DEFAULT_LON0 * D2R;
  }
  lon0 = P.lam0 * R2D;
  engine = createHemispheresEngine(mproj, method, getHemisphereParams(P, lon0));
  P.es = 0;
  P.fwd = function(lp, xy) {
    if (engine.forward(lp.lam, lp.phi, xy) == HIDDEN) {
      xy.x = xy.y = Infinity;
    }
  };
  P.inv = function(xy, lp) {
    if (!engine.inverse(xy.x, xy.y, lp)) {
      lp.lam = lp.phi = Infinity;
    }
  };
  P.__projection_topology = getHemispheresTopology(engine.findRegion, null, lon0);
  addRasterRegions(P.__projection_topology, engine, lon0);
  P.__projected_outline = engine.outline.rings;
  P.__projected_footprint = engine.outline.footprint;
  P.__projected_outline_lines = engine.outline.lines;
  // The views are copies of P, so they are created after mproj has finished
  // initializing P. Not enumerable, so that copying P does not copy them.
  Object.defineProperty(P, '__projection_views', {
    get: function() {
      if (!views) {
        // the back disk first, so that its parts are drawn first
        views = [engine.back, engine.front].map(function(hemi) {
          return createHemisphereView(P, engine, hemi, lon0);
        });
      }
      return views;
    }
  });
}

// A raster is projected into each disk that shows a place, and each disk's
// output is masked by its outline (see buildPiecewiseProjectedRasterMesh())
function addRasterRegions(topology, engine, lon0) {
  // ortho squeezes the cells near the rim, which a coarser mesh leaves uncovered
  topology.raster_mesh_interval = 8;
  topology.raster_regions = engine.outline.footprint.map(function(part) {
    return {id: part.id, projected_boundary: part.rings[0]};
  });
  topology.findRasterRegion = function(lon, lat) {
    return engine.findRasterRegions((lon - lon0) * D2R, lat * D2R);
  };
  topology.projectRasterRegion = function(lon, lat, regionId) {
    return engine.projectRasterPoint(regionId, (lon - lon0) * D2R, lat * D2R);
  };
}

// A CRS that projects the part of the globe shown by one of the disks
function createHemisphereView(P, engine, hemi, lon0) {
  var view = Object.assign({}, P);
  var scratchXY = {x: 0, y: 0};
  var findRegion = function(lam, phi) {
    return engine.forwardView(hemi, lam, phi, scratchXY);
  };
  view.fwd = function(lp, xy) {
    if (engine.forwardView(hemi, lp.lam, lp.phi, xy) == HIDDEN) {
      xy.x = xy.y = Infinity;
    }
  };
  view.__projection_topology = getHemispheresTopology(findRegion, function() {
    return engine.getViewSeams(hemi);
  }, lon0);
  return view;
}

function getHemisphereParams(P, lon0) {
  var lon1 = getNumericParam(P, 'lon_1', lon0 + 180);
  var lat1 = getNumericParam(P, 'lat_1', P.phi0 * R2D);
  var gap = getNumericParam(P, 'gap', DEFAULT_GAP);
  if (Math.abs(lat1) > 90) {
    stop('Invalid lat_1 parameter:', lat1);
  }
  if (gap > -1 === false) {
    stop('The gap parameter must be greater than -1');
  }
  return {
    phi0: P.phi0,
    lam1: (lon1 - lon0) * D2R,
    phi1: lat1 * D2R,
    gap: gap,
    horizontal: !!P.params.horizontal
  };
}

function getNumericParam(P, name, defaultValue) {
  var o = P.params[name];
  var val;
  if (!o) return defaultValue;
  val = parseFloat(o.param);
  if (!isFinite(val)) {
    stop('Invalid ' + name + ' parameter:', o.param);
  }
  return val;
}

// Longitudes are relative to the upper hemisphere's center (lon_0), as in
// mproj's fwd() and inv() functions. Projected coordinates are for a unit
// sphere.
export function createHemispheresEngine(mproj, method, params) {
  var back = initHemisphere(BACK, 0, params.phi0);
  var front = initHemisphere(FRONT, params.lam1, params.phi1);
  var r = getDiskRadius(front);
  var spacing = (2 + params.gap) * r; // distance between the disk centers
  var overlap = params.gap < 0;
  var scratchLP = {lam: 0, phi: 0};
  var scratchXY = {x: 0, y: 0};
  var scratchInvXY = {x: 0, y: 0};
  if (1 - dot(front.v, back.v) < 1e-9) {
    stop('The two hemispheres need different centers');
  }
  if (params.horizontal) {
    back.x = -spacing / 2;
    front.x = spacing / 2;
  } else {
    back.y = spacing / 2;
    front.y = -spacing / 2;
  }

  return {
    radius: r,
    front: front,
    back: back,
    forward: forward,
    forwardView: forwardView,
    inverse: inverse,
    findRegion: function(lam, phi) {
      return forward(lam, phi, scratchXY);
    },
    getViewSeams: getViewSeams,
    findRasterRegions: findRasterRegions,
    projectRasterPoint: projectRasterPoint,
    outline: getOutline()
  };

  function initHemisphere(id, lam, phi) {
    // fwd() and inv() of this CRS take longitudes relative to the hemisphere's
    // center
    var crs = mproj.pj_init('+proj=' + method + ' +R=1 +lon_0=0 +lat_0=' + (phi * R2D).toFixed(12));
    return {
      id: id,
      lam: lam,
      phi: crs.phi0,
      v: lonLatToVector(lam, crs.phi0),
      crs: crs,
      x: 0,
      y: 0
    };
  }

  // The radius of the image of a hemisphere (1 for ortho, sqrt(2) for laea)
  function getDiskRadius(hemi) {
    var xy = {x: 0, y: 0};
    var phi = hemi.phi >= 0 ? hemi.phi - Math.PI / 2 : hemi.phi + Math.PI / 2;
    hemi.crs.fwd({lam: 0, phi: phi}, xy);
    return Math.sqrt(xy.x * xy.x + xy.y * xy.y);
  }

  // Projects a point into the disk with the nearer center. Returns the id of
  // the disk, or HIDDEN. Writes the projected location of visible points to xy.
  function forward(lam, phi, xy) {
    var nearer = dotLonLat(front.v, lam, phi) >= dotLonLat(back.v, lam, phi) ? front : back;
    return forwardView(nearer, lam, phi, xy);
  }

  // Projects a point into one of the disks
  function forwardView(hemi, lam, phi, xy) {
    if (dotLonLat(hemi.v, lam, phi) < -EPS) {
      return HIDDEN; // more than 90 degrees from the center
    }
    scratchLP.lam = adjlon(lam - hemi.lam);
    scratchLP.phi = phi;
    hemi.crs.fwd(scratchLP, xy);
    xy.x += hemi.x;
    xy.y += hemi.y;
    if (hemi == back && overlap && inDisk(front, xy.x, xy.y)) {
      return HIDDEN; // under the front disk
    }
    return hemi.id;
  }

  // The disks that show a point (ignoring the part of the back disk that is
  // under the front disk, which a raster mask hides)
  function findRasterRegions(lam, phi) {
    var ids = [];
    if (dotLonLat(back.v, lam, phi) >= -EPS) ids.push(back.id);
    if (dotLonLat(front.v, lam, phi) >= -EPS) ids.push(front.id);
    return ids;
  }

  // Projects a point into a disk, including points a little beyond the disk's
  // horizon, so that raster cells reach the rim. Returns unit-sphere [x, y].
  function projectRasterPoint(id, lam, phi) {
    var hemi = id == front.id ? front : back;
    var d = dotLonLat(hemi.v, lam, phi);
    var xy = {x: 0, y: 0};
    var p;
    if (d < 0 && (method != 'laea' || d < -0.5)) {
      // ortho cannot project points beyond the horizon: use the nearest
      // point on the horizon
      p = lonLatToVector(lam, phi);
      p = normalizeVector([p[0] - d * hemi.v[0], p[1] - d * hemi.v[1], p[2] - d * hemi.v[2]]);
      lam = Math.atan2(p[1], p[0]);
      phi = Math.asin(Math.max(-1, Math.min(1, p[2])));
    }
    hemi.crs.fwd({lam: adjlon(lam - hemi.lam), phi: phi}, xy);
    return [xy.x + hemi.x, xy.y + hemi.y];
  }

  // Writes the location of a projected point to lp. Returns false if the
  // point is not part of the map.
  function inverse(x, y, lp) {
    var hemi = inDisk(front, x, y) ? front : inDisk(back, x, y) ? back : null;
    if (!hemi) return false;
    scratchInvXY.x = x - hemi.x;
    scratchInvXY.y = y - hemi.y;
    hemi.crs.inv(scratchInvXY, lp);
    if (!isFinite(lp.lam) || !isFinite(lp.phi)) return false;
    lp.lam = adjlon(lp.lam + hemi.lam);
    // Inverting a point on a disk's rim is ill-conditioned, so points on the
    // rim are accepted within a tolerance
    return dotLonLat(hemi.v, lp.lam, lp.phi) > -INVERSE_TOLERANCE;
  }

  function inDisk(hemi, x, y) {
    var dx = x - hemi.x;
    var dy = y - hemi.y;
    return dx * dx + dy * dy <= r * r * (1 + EPS);
  }

  // Returns the edges of the part of the globe that a disk shows, as arrays of
  // unit vectors
  function getViewSeams(hemi) {
    var seams = traceCurve(getGreatCircle(hemi.v), keepAll);
    if (hemi == back && overlap) {
      seams = seams.concat(traceCurve(getHiddenRimCurve(), keepAll));
    }
    return seams;
  }

  function keepAll() {
    return true;
  }

  // The rim of the front disk where it crosses the back disk, traced back to
  // the globe through the back hemisphere's inverse projection
  function getHiddenRimCurve() {
    var angles = getIntersectionAngles();
    var lp = {lam: 0, phi: 0};
    var xy = {x: 0, y: 0};
    return function(t) {
      var a = angles.hidden[0] + (angles.hidden[1] - angles.hidden[0]) * t;
      xy.x = front.x + r * Math.cos(a) - back.x;
      xy.y = front.y + r * Math.sin(a) - back.y;
      if (xy.x * xy.x + xy.y * xy.y > r * r) {
        // keep roundoff at the intersection points on the disk
        var k = r / Math.sqrt(xy.x * xy.x + xy.y * xy.y);
        xy.x *= k;
        xy.y *= k;
      }
      back.crs.inv(xy, lp);
      return isFinite(lp.lam) && isFinite(lp.phi) ?
        lonLatToVector(lp.lam + back.lam, lp.phi) : null;
    };
  }

  // Angles (around each disk's center) of the arcs between the two points
  // where the disk rims cross
  function getIntersectionAngles() {
    var th = Math.atan2(back.y - front.y, back.x - front.x);
    var alpha = Math.acos(spacing / (2 * r));
    return {
      hidden: [th - alpha, th + alpha], // front rim inside the back disk
      front: [th + alpha, th + 2 * Math.PI - alpha], // front rim outside the back disk
      back: [th + Math.PI + alpha, th + 3 * Math.PI - alpha] // back rim outside the front disk
    };
  }

  function getOutline() {
    var angles, frontArc, backArc, hiddenRim;
    if (!overlap) {
      return {
        rings: [getCircle(back), getCircle(front)],
        footprint: [
          getFootprintPart(back, getCircle(back)),
          getFootprintPart(front, getCircle(front))
        ],
        lines: null
      };
    }
    angles = getIntersectionAngles();
    frontArc = getArc(front, angles.front[0], angles.front[1]);
    backArc = getArc(back, angles.back[0], angles.back[1]);
    hiddenRim = getArc(front, angles.hidden[1], angles.hidden[0]);
    return {
      rings: [closeRing(frontArc.concat(backArc.slice(1)))],
      // the front disk is last, so that it is drawn over the back disk
      footprint: [
        getFootprintPart(back, closeRing(backArc.concat(hiddenRim.slice(1)))),
        getFootprintPart(front, getCircle(front))
      ],
      lines: [hiddenRim]
    };
  }

  function getFootprintPart(hemi, ring) {
    return {id: hemi.id, properties: {hemisphere: hemi == front ? 'front' : 'back'}, rings: [ring]};
  }

  function getCircle(hemi) {
    return closeRing(getArc(hemi, 0, 2 * Math.PI).slice(0, -1));
  }

  function getArc(hemi, a0, a1) {
    var n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (2 * Math.PI) * OUTLINE_STEPS));
    var points = [];
    for (var i = 0; i <= n; i++) {
      var a = a0 + (a1 - a0) * i / n;
      points.push([hemi.x + r * Math.cos(a), hemi.y + r * Math.sin(a)]);
    }
    return points;
  }
}

// findRegionRad(lam, phi): region of a point (longitude relative to lon0)
// getSeamVectors(): the paths to cut, as arrays of unit vectors. The CRS of the
//   whole map has none, because its datasets are cut by the views.
function getHemispheresTopology(findRegionRad, getSeamVectors, lon0) {
  var seams = null;
  var topology = {
    interrupted: true,
    // fwd() fails for points in parts of the globe that are not shown
    hidden_areas: true,
    // the source antimeridian is inside the map, so features that were split
    // there need to be rejoined
    heal_antimeridian: true,
    regions: [{id: FRONT}, {id: BACK}],
    findRegion: findRegion,
    findTransitionRegion: findRegion
  };
  // Seams are traced on first use; rasters do not need them
  Object.defineProperty(topology, 'seams', {
    enumerable: true,
    get: function() {
      if (!seams) {
        seams = [{
          type: 'cut',
          paths: (getSeamVectors ? getSeamVectors() : []).reduce(function(memo, vectors) {
            return memo.concat(seamVectorsToLonLatPaths(vectors, lon0));
          }, [])
        }];
      }
      return seams;
    }
  });
  return topology;

  function findRegion(lon, lat) {
    return findRegionRad((lon - lon0) * D2R, lat * D2R);
  }
}

// Sample a curve fn(t), t in [0, 1], and return the parts where keep() is true,
// as arrays of unit vectors. fn() returns a unit vector or null.
export function traceCurve(fn, keep) {
  var paths = [];
  var run = null;
  var t0 = 0;
  var v0 = fn(0);
  var k0 = isKept(v0);
  var t1, v1, k1, b;
  if (k0) run = [v0];
  for (var i = 1; i <= SEAM_STEPS; i++) {
    t1 = i / SEAM_STEPS;
    v1 = fn(t1);
    k1 = isKept(v1);
    if (k0 && k1) {
      refineCurve(run, fn, t0, v0, t1, v1, 0);
      run.push(v1);
    } else if (k0) {
      b = findCurveBoundary(fn, isKept, t0, t1);
      refineCurve(run, fn, t0, v0, b.t, b.v, 0);
      run.push(b.v);
      paths.push(run);
      run = null;
    } else if (k1) {
      b = findCurveBoundary(fn, isKept, t1, t0);
      run = [b.v];
      refineCurve(run, fn, b.t, b.v, t1, v1, 0);
      run.push(v1);
    }
    t0 = t1;
    v0 = v1;
    k0 = k1;
  }
  if (run) paths.push(run);
  return paths.filter(function(path) {
    return path.length > 1;
  });

  function isKept(v) {
    return !!v && keep(v);
  }
}

// Append the vertices needed between va and vb (exclusive)
function refineCurve(points, fn, ta, va, tb, vb, depth) {
  var tm = (ta + tb) / 2;
  var vm = fn(tm);
  if (!vm || depth >= MAX_SEAM_REFINEMENT || getChordError(va, vb, vm) <= SEAM_TOLERANCE) {
    return;
  }
  refineCurve(points, fn, ta, va, tm, vm, depth + 1);
  points.push(vm);
  refineCurve(points, fn, tm, vm, tb, vb, depth + 1);
}

// Distance (in degrees) between the lon/lat midpoint of a segment and a point
// on the curve
function getChordError(a, b, m) {
  var pa = vectorToLonLat(a);
  var pb = vectorToLonLat(b);
  var pm = vectorToLonLat(m);
  var dlon = wrapLongitude(pb[0] - pa[0]);
  if (Math.abs(dlon) > 90) return Infinity;
  return Math.max(
    Math.abs(wrapLongitude(pm[0] - pa[0] - dlon / 2)),
    Math.abs(pm[1] - (pa[1] + pb[1]) / 2));
}

// Find the point where a curve enters or leaves the kept part (ta is kept)
function findCurveBoundary(fn, isKept, ta, tb) {
  var va = fn(ta);
  for (var i = 0; i < 50; i++) {
    var tm = (ta + tb) / 2;
    var vm = fn(tm);
    if (isKept(vm)) {
      ta = tm;
      va = vm;
    } else {
      tb = tm;
    }
  }
  return {t: ta, v: va};
}

// Convert a seam to lon/lat paths, split at the antimeridian. Where a seam
// passes over a pole, both sides are extended past the pole (like the seams of
// the interrupted projections), so that polygons containing the pole are cut
// through.
export function seamVectorsToLonLatPaths(vectors, lon0) {
  var paths = [];
  var path = [];
  var prev = null;
  vectors.forEach(function(v) {
    var p = vectorToLonLat(v, lon0, prev);
    var dlon, lat, edge, t, crossingLat;
    if (prev) {
      dlon = p[0] - prev[0];
      if (Math.abs(wrapLongitude(dlon)) > 90) {
        lat = prev[1] + p[1] > 0 ? 91 : -91;
        path.push([prev[0], lat]);
        finishPath();
        path.push([p[0], lat]);
      } else if (Math.abs(dlon) > 180) {
        edge = prev[0] < 0 ? -180 : 180;
        t = (edge - prev[0]) / (dlon + (dlon < 0 ? 360 : -360));
        crossingLat = prev[1] + (p[1] - prev[1]) * t;
        path.push([edge, crossingLat]);
        finishPath();
        path.push([-edge, crossingLat]);
      }
    }
    path.push(p);
    prev = p;
  });
  finishPath();
  return paths;

  function finishPath() {
    if (path.length > 1) {
      path.mask_width = SEAM_MASK_WIDTH;
      paths.push(path);
    }
    path = [];
  }
}

// prev: previous point on a path, for the longitude of a pole
function vectorToLonLat(v, lon0, prev) {
  var lat = Math.asin(Math.max(-1, Math.min(1, v[2]))) * R2D;
  var lon;
  if (Math.abs(v[2]) > 1 - 1e-15 && prev) {
    lon = prev[0];
  } else {
    lon = wrapLongitude(Math.atan2(v[1], v[0]) * R2D + (lon0 || 0));
  }
  return [lon, lat];
}

function getGreatCircle(normal) {
  var u = normalizeVector(Math.abs(normal[2]) < 0.9 ?
    crossVectors(normal, [0, 0, 1]) : crossVectors(normal, [1, 0, 0]));
  var w = crossVectors(normal, u);
  return function(t) {
    var a = t * 2 * Math.PI;
    var c = Math.cos(a);
    var s = Math.sin(a);
    return [u[0] * c + w[0] * s, u[1] * c + w[1] * s, u[2] * c + w[2] * s];
  };
}

function closeRing(points) {
  points.push(points[0].concat());
  return points;
}

function lonLatToVector(lam, phi) {
  var cosPhi = Math.cos(phi);
  return [Math.cos(lam) * cosPhi, Math.sin(lam) * cosPhi, Math.sin(phi)];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function dotLonLat(v, lam, phi) {
  var cosPhi = Math.cos(phi);
  return v[0] * Math.cos(lam) * cosPhi + v[1] * Math.sin(lam) * cosPhi + v[2] * Math.sin(phi);
}

function crossVectors(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function normalizeVector(a) {
  var k = 1 / Math.sqrt(dot(a, a));
  return [a[0] * k, a[1] * k, a[2] * k];
}

function adjlon(lam) {
  while (lam > Math.PI) lam -= 2 * Math.PI;
  while (lam < -Math.PI) lam += 2 * Math.PI;
  return lam;
}

function wrapLongitude(lon) {
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}
