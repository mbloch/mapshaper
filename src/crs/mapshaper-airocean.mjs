/*
 * Buckminster Fuller's Airocean arrangement of the icosahedron.
 *
 * Face layout adapted from d3-geo-polygon (ISC license):
 * https://github.com/d3/d3-geo-polygon/blob/main/src/airocean.js
 *
 * The Gray-Fuller raw transform below is based on Robert W. Gray's published
 * equations and Philippe Rivière's public-domain clean-room implementation:
 * https://github.com/d3/d3-geo-polygon/blob/main/src/grayfuller.js
 *
 * airocean (gnomonic facets) matches PROJ's +proj=airocean (PROJ 9.6+): the
 * same net, size, origin, +orient parameter and treatment of ellipsoids.
 * airocean2 (Gray-Fuller facets) is mapshaper's own, laid out on the same net.
 * The two differ from PROJ in one respect: they default to +orient=horizontal,
 * which is written into the CRS definition so that PROJ reads it the same way.
 *
 * dymaxion and dymaxion2 are the earlier names of airocean2 and airocean.
 * They are kept, unchanged, for existing scripts: horizontal, centered on the
 * origin, spherical, and using d3's rounded rotation.
 */

import {
  createPolyhedralProjection,
  rotateSphericalRadians
} from './mapshaper-polyhedral-projection';
import { stop, warnOnce } from '../utils/mapshaper-logging';

var D2R = Math.PI / 180;
var R2D = 180 / Math.PI;
var SQRT3 = Math.sqrt(3);
var GRAY_Z = Math.sqrt(5 + 2 * Math.sqrt(5)) / Math.sqrt(15);
var GRAY_EL = Math.sqrt(8) / Math.sqrt(5 + Math.sqrt(5));
var GRAY_DVE = Math.sqrt(3 + Math.sqrt(5)) / Math.sqrt(5 + Math.sqrt(5));
var LEGACY_ROTATION = [-83.65929, 25.44458, -87.45184];
// Fitted to the icosahedron vertices in PROJ's airocean.cpp (RMS error 2e-16)
var ROTATION = [-83.65921998965584, 25.444585663567924, -87.45180612366421];
// The engine scales the net so that a face edge is as long as the arc between
// two icosahedron vertices; PROJ's edges are the chords of an icosahedron
// inscribed in the sphere.
var EDGE_ANGLE = Math.acos(1 / Math.sqrt(5));
var PROJ_SCALE = 2 * Math.sin(EDGE_ANGLE / 2) / EDGE_ANGLE;
var PARENTS = [
  -1, 0, 1, 11, 13,
  6, 7, 1, 7, 8,
  9, 10, 11, 12, 13,
  6, 8, 10, 17, 21,
  16, 15, 19, 19
];
var engines = {};

export function registerAiroceanProjections(mproj) {
  // Some unit tests import source modules directly in an ESM context where
  // optional CommonJS dependencies are intentionally unavailable.
  if (!mproj) return;
  register('airocean', 'Airocean (gnomonic facets)', 'gnomonic');
  register('airocean2', 'Airocean (Gray-Fuller facets)', 'fuller');
  register('dymaxion', 'Airocean (Gray-Fuller facets, deprecated name)', 'fuller', 'airocean2');
  register('dymaxion2', 'Airocean (gnomonic facets, deprecated name)', 'gnomonic', 'airocean');

  function register(id, name, method, replacement) {
    if (mproj.internal.pj_list[id]) return;
    mproj.pj_add(function(P) {
      if (replacement) {
        warnOnce('The ' + id + ' projection is now called ' + replacement +
          ', which is laid out like PROJ\'s airocean (with a different origin' +
          ' and scale). ' + id + ' still produces its old coordinates.');
        initLegacyProjection(P, method);
      } else {
        initAirocean(P, method);
      }
    }, id, name);
  }
}

// layout: 'horizontal' or 'vertical' (PROJ's net), or 'legacy'
export function getAiroceanEngine(method, layout) {
  var key;
  method = method || 'fuller';
  layout = layout || 'horizontal';
  key = method + ':' + layout;
  if (!engines[key]) {
    var data = createAiroceanFaces();
    engines[key] = createPolyhedralProjection({
      faces: data.faces,
      faceSites: data.sites,
      parents: PARENTS,
      rotation: layout == 'legacy' ? LEGACY_ROTATION : ROTATION,
      angle: -60,
      layout: layout == 'legacy' ? null : getProjLayout(layout == 'vertical'),
      faceProjector: method == 'gnomonic' ?
        createGnomonicFaceProjector :
        createGrayFullerFaceProjector
    });
  }
  return engines[key];
}

// PROJ's horizontal net occupies [0, 0, width, height]; its vertical net is
// the horizontal one turned a quarter turn clockwise, occupying
// [0, 0, height, width].
function getProjLayout(vertical) {
  return function(width, height) {
    var k = PROJ_SCALE;
    return vertical ?
      [0, k, k * height / 2, -k, 0, k * width / 2] :
      [k, 0, k * width / 2, 0, k, k * height / 2];
  };
}

function initLegacyProjection(P, method) {
  var engine = getAiroceanEngine(method, 'legacy');
  P.es = 0;
  P.inv = null;
  P.fwd = function(lp, xy) {
    var p = engine.forward(lp.lam, lp.phi);
    if (!p) {
      xy.x = xy.y = Infinity;
    } else {
      xy.x = p[0];
      xy.y = p[1];
    }
  };
  P.__projection_topology = engine.getTopology(P.lam0 * R2D);
  P.__projected_outline = engine.outline;
}

function initAirocean(P, method) {
  var engine = getAiroceanEngine(method, getOrientation(P));
  // Like PROJ, project geocentric latitudes onto a sphere with radius a
  var oneEs = 1 - P.es;
  var toSphere = P.es ? function(phi) {
    return Math.atan(oneEs * Math.tan(phi));
  } : null;
  var fromSphere = P.es ? function(phi) {
    return Math.atan(Math.tan(phi) / oneEs);
  } : null;
  P.es = 0;
  P.inv = null;
  P.fwd = function(lp, xy) {
    var p = engine.forward(lp.lam, toSphere ? toSphere(lp.phi) : lp.phi);
    if (!p) {
      xy.x = xy.y = Infinity;
    } else {
      xy.x = p[0];
      xy.y = p[1];
    }
  };
  P.__projection_topology = engine.getTopology(P.lam0 * R2D);
  if (toSphere) {
    convertTopologyLatitudes(P.__projection_topology, toSphere, fromSphere);
  }
  P.__projected_outline = engine.outline;
}

// Defaults to horizontal, unlike PROJ. The parameter is added to the CRS so
// that the definition mapshaper exports means the same thing to PROJ.
function getOrientation(P) {
  var param = P.params.orient;
  var value = param ? String(param.param) : 'horizontal';
  if (value != 'horizontal' && value != 'vertical') {
    stop('Invalid orient parameter:', value, '(expected horizontal or vertical)');
  }
  P.params.orient = {used: true, param: value};
  return value;
}

// The engine's topology is in geocentric latitudes; datasets are in geodetic
// latitudes.
function convertTopologyLatitudes(topology, toSphere, fromSphere) {
  var findRegion = topology.findRegion;
  var findTransitionRegion = topology.findTransitionRegion;
  var projectRegion = topology.projectRegion;
  topology.seams.forEach(function(seam) {
    seam.paths.forEach(function(path) {
      path.forEach(function(p) {
        if (Math.abs(p[1]) < 90) {
          p[1] = fromSphere(p[1] * D2R) * R2D;
        }
      });
    });
  });
  topology.findRegion = function(lon, lat) {
    return findRegion(lon, toSphere(lat * D2R) * R2D);
  };
  topology.findTransitionRegion = function(lon, lat) {
    return findTransitionRegion(lon, toSphere(lat * D2R) * R2D);
  };
  topology.projectRegion = function(lon, lat, regionId) {
    return projectRegion(lon, toSphere(lat * D2R) * R2D, regionId);
  };
}

function createAiroceanFaces() {
  var theta = Math.atan(0.5) * R2D;
  var vertices = [[0, 90], [0, -90]];
  var faces;
  var sites;
  for (var i = 0; i < 10; i++) {
    vertices.push([(i * 36 + 180) % 360 - 180, i & 1 ? theta : -theta]);
  }
  faces = [
    [0, 3, 11],
    [0, 5, 3],
    [0, 7, 5],
    [0, 9, 7],
    [0, 11, 9],
    [2, 11, 3],
    [3, 4, 2],
    [4, 3, 5],
    [5, 6, 4],
    [6, 5, 7],
    [7, 8, 6],
    [8, 7, 9],
    [9, 10, 8],
    [10, 9, 11],
    [11, 2, 10],
    [1, 2, 4],
    [1, 4, 6],
    [1, 6, 8],
    [1, 8, 10],
    [1, 10, 2]
  ].map(function(ids) {
    return ids.map(function(id) {
      return vertices[id];
    });
  });
  sites = faces.map(getSphericalCentroid);
  splitAiroceanFaces(faces, sites);
  return {faces: faces, sites: sites};
}

function splitAiroceanFaces(faces, sites) {
  var face = faces[15];
  var site = sites[15];
  var original = face.concat();
  face[0] = site;
  faces.push([original[0], site, original[2]]);
  sites.push(site);
  faces.push([original[0], original[1], site]);
  sites.push(site);

  face = faces[14];
  site = sites[14];
  original = face.concat();
  var mid = getGreatCircleMidpoint(face[1], face[2]);
  face[1] = mid;
  faces.push([original[0], original[1], mid]);
  sites.push(site);

  face = faces[19];
  site = sites[19];
  original = face.concat();
  face[1] = mid;
  faces.push([mid, original[0], original[1]]);
  sites.push(site);
}

function createGrayFullerFaceProjector(face) {
  var c = face.centroid;
  var direction = Math.abs(c[1] - 52.62) < 1 ||
    Math.abs(c[1] + 10.81) < 1 ? 0 : 60;
  var rotation = [-c[0], -c[1], direction];
  return function(lam, phi) {
    var p = rotateSphericalRadians(lam, phi, rotation);
    var q = grayFullerRaw(p[0], p[1]);
    // D3's face projections use screen-oriented local y coordinates; retaining
    // that convention reproduces the published Airocean unfolding matrices.
    return [q[0], -q[1]];
  };
}

function createGnomonicFaceProjector(face) {
  var c = face.centroid;
  var rotation = [-c[0], -c[1], 0];
  return function(lam, phi) {
    var p = rotateSphericalRadians(lam, phi, rotation);
    var cosPhi = Math.cos(p[1]);
    var k = cosPhi * Math.cos(p[0]);
    return [
      cosPhi * Math.sin(p[0]) / k,
      -Math.sin(p[1]) / k
    ];
  };
}

function grayFullerRaw(lam, phi) {
  var cosPhi = Math.cos(phi);
  var s = GRAY_Z / (cosPhi * Math.cos(lam));
  var x = cosPhi * Math.sin(lam) * s;
  var y = Math.sin(phi) * s;
  var a1p = Math.atan2(2 * y / SQRT3 + GRAY_EL / 3 - GRAY_EL / 2, GRAY_DVE);
  var a2p = Math.atan2(x - y / SQRT3 + GRAY_EL / 3 - GRAY_EL / 2, GRAY_DVE);
  var a3p = Math.atan2(GRAY_EL / 3 - x - y / SQRT3 - GRAY_EL / 2, GRAY_DVE);
  return [SQRT3 * (a2p - a3p), 2 * a1p - a2p - a3p];
}

function getSphericalCentroid(coords) {
  var sum = [0, 0, 0];
  coords.forEach(function(p) {
    var v = degreesToVector(p);
    sum[0] += v[0];
    sum[1] += v[1];
    sum[2] += v[2];
  });
  return vectorToDegrees(normalize(sum));
}

function getGreatCircleMidpoint(a, b) {
  var av = degreesToVector(a);
  var bv = degreesToVector(b);
  return vectorToDegrees(normalize([
    av[0] + bv[0],
    av[1] + bv[1],
    av[2] + bv[2]
  ]));
}

function degreesToVector(p) {
  var lam = p[0] * D2R;
  var phi = p[1] * D2R;
  var cosPhi = Math.cos(phi);
  return [Math.cos(lam) * cosPhi, Math.sin(lam) * cosPhi, Math.sin(phi)];
}

function vectorToDegrees(p) {
  return [
    Math.atan2(p[1], p[0]) * R2D,
    Math.asin(Math.max(-1, Math.min(1, p[2]))) * R2D
  ];
}

function normalize(p) {
  var k = 1 / Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
  return [p[0] * k, p[1] * k, p[2] * k];
}
