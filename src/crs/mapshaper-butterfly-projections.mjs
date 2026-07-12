/*
 * Octahedral butterfly projections.
 *
 * Face layouts are adapted from d3-geo-polygon (ISC license):
 * https://github.com/d3/d3-geo-polygon
 *
 * Copyright 2017-2024 Mike Bostock
 * ISC License: https://github.com/d3/d3-geo-polygon/blob/main/LICENSE
 */

import {createPolyhedralProjection} from './mapshaper-polyhedral-projection';
import {createGnomonicProjector} from './mapshaper-slice-and-dice';
import {
  createCahillKeyesFaceRaw,
  createCahillKeyesRaw
} from './mapshaper-cahill-keyes';
import {
  createRadialFacetProjector,
  normalizeRadialProjectionName
} from './mapshaper-radial-facet';

var D2R = Math.PI / 180;
var R2D = 180 / Math.PI;
var RADIAL_BOUNDARY_STRENGTH = 1;
var OCTAHEDRON = createOctahedron();
var BUTTERFLY_PARENTS = [-1, 0, 0, 1, 0, 1, 4, 5];
var DEFAULT_LON0 = {
  butterfly: 157.5,
  butterfly2: -20,
  cahill_keyes: -20
};
var engines = {};

export function registerButterflyProjections(mproj) {
  if (!mproj) return;
  register('butterfly', 'Butterfly projection (Pacific aspect)', 'butterfly');
  register('butterfly2', 'Butterfly projection (Atlantic aspect)', 'butterfly2');
  register('cahill_keyes', 'Cahill-Keyes butterfly', 'cahill_keyes');

  function register(id, name, method) {
    if (mproj.internal.pj_list[id]) return;
    mproj.pj_add(function(P) {
      initButterfly(P, method);
    }, id, name);
  }
}

export function getButterflyEngine(method) {
  var key = method == 'butterfly2' ? 'butterfly' : method;
  if (!engines[key]) {
    if (key == 'cahill_keyes') {
      engines[key] = createCahillKeyesEngine();
    } else if (key == 'butterfly') {
      engines[key] = createButterflyEngine();
    } else {
      throw new Error('Unknown butterfly projection: ' + method);
    }
  }
  return engines[key];
}

function initButterfly(P, method) {
  var engine = getButterflyEngine(method);
  if (!P.params.lon_0) {
    P.lam0 = DEFAULT_LON0[method] * D2R;
  }
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
  if (engine.removeOutlineExtremeConnectors) {
    P.__remove_outline_extreme_connectors = true;
  }
  if (engine.useProjectedOutline !== false) {
    P.__projected_outline = engine.outline;
  }
}

function createButterflyEngine() {
  var faceCenters = [-45, 45, -45, 45, -135, 135, -135, 135];
  // Reuse the Cahill-Keyes polar incisions and 12-zone octant transform,
  // then unfold the faces with the butterfly attachment tree.
  var data = createTruncatedOctahedronFaces(
    Math.cos(17 * D2R),
    Math.sin(17 * D2R),
    BUTTERFLY_PARENTS
  );
  var faceRaw = createCahillKeyesFaceRaw(10000);
  var engine = createPolyhedralProjection({
    faces: data.faces,
    parents: data.parents,
    rotation: [0, 0, 0],
    // Face-local CK coordinates point opposite the root face.
    angle: 150,
    findFace: createTruncatedFaceFinder(data.cornerNormals),
    faceProjector: function(face) {
      var baseId = face.id < 8 ? face.id : data.parents[face.id];
      var center = faceCenters[baseId] * D2R;
      var raw = function(lam, phi) {
        return faceRaw(normalizeRadians(lam - center), phi);
      };
      return createNormalizedFacetProjector(face.coords, raw);
    }
  });
  engine.facetProjection = 'cahill_keyes';
  return engine;
}

function createNormalizedFacetProjector(coords, raw) {
  // Remove the global placement and scale of a raw facet while preserving its
  // internal shape. The polyhedral engine then controls how facets unfold.
  var points = coords.map(function(p) {
    return raw(p[0] * D2R, p[1] * D2R);
  });
  var edge = 0;
  var maxLengthSq = -1;
  for (var i = 0; i < points.length; i++) {
    var a = points[i];
    var b = points[(i + 1) % points.length];
    var dx = b[0] - a[0];
    var dy = b[1] - a[1];
    var lengthSq = dx * dx + dy * dy;
    if (lengthSq > maxLengthSq) {
      maxLengthSq = lengthSq;
      edge = i;
    }
  }
  var origin = points[edge];
  var end = points[(edge + 1) % points.length];
  var ux = end[0] - origin[0];
  var uy = end[1] - origin[1];
  var center = points.reduce(function(sum, p) {
    sum[0] += p[0] / points.length;
    sum[1] += p[1] / points.length;
    return sum;
  }, [0, 0]);
  var side = ux * (center[1] - origin[1]) -
    uy * (center[0] - origin[0]) < 0 ? -1 : 1;
  return function(lam, phi) {
    var p = raw(lam, phi);
    var x = p[0] - origin[0];
    var y = p[1] - origin[1];
    return [
      (x * ux + y * uy) / maxLengthSq,
      side * (ux * y - uy * x) / maxLengthSq
    ];
  };
}

export function createRadialButterflyEngine(options) {
  options = normalizeRadialFacetOptions(options);
  var data = createRadialButterflyFaces();
  var radialOptions = {
    radial: options.projection,
    radial2: options.projection2,
    radialBlend: options.blend,
    boundaryStrength: RADIAL_BOUNDARY_STRENGTH
  };
  var squareProjectors = createSquareProjectors(data.faces, radialOptions);
  var engine = createPolyhedralProjection({
    faces: data.faces,
    parents: data.parents,
    rotation: [0, 0, 0],
    angle: -30,
    findFace: createTruncatedFaceFinder(data.cornerNormals),
    faceProjector: function(face) {
      if (face.id < 8) {
        return createRadialFacetProjector(face.coords, radialOptions);
      }
      return squareProjectors.get(pointKey(face.coords[0]));
    }
  });
  engine.radialFacet = {
    projection: options.projection,
    projection2: options.projection2,
    blend: options.blend,
    boundaryStrength: RADIAL_BOUNDARY_STRENGTH
  };
  return engine;
}

function normalizeRadialFacetOptions(options) {
  options = options || {};
  var projection2 = options.projection2 ?
    normalizeRadialProjectionName(options.projection2) :
    null;
  var blend = projection2 ?
    options.blend == null ? 0.5 : Number(options.blend) :
    0;
  if (!Number.isFinite(blend) || blend < 0 || blend > 1) {
    throw new Error('Facet projection blend must be between 0 and 1');
  }
  return {
    projection: normalizeRadialProjectionName(options.projection || 'laea'),
    projection2: projection2,
    blend: blend
  };
}

function createCahillKeyesEngine() {
  var data = createTruncatedOctahedronFaces(
    Math.cos(17 * D2R),
    Math.sin(17 * D2R),
    [-1, 3, 0, 2, 0, 1, 4, 5]
  );
  var raw = createCahillKeyesRaw(10000);
  var engine = createPolyhedralProjection({
    faces: data.faces,
    parents: data.parents,
    rotation: [0, 0, 0],
    angle: 0,
    findFace: createTruncatedFaceFinder(data.cornerNormals),
    faceProjector: function() {
      return function(lam, phi) {
        var p = raw(lam, phi);
        return [p[0], -p[1]];
      };
    }
  });
  // The 12-zone transform positions all octants directly in its M-profile.
  // Its face-tree boundary retraces several edges, so derive graticule
  // footprints through the normal spherical clipping path instead.
  engine.useProjectedOutline = false;
  engine.removeOutlineExtremeConnectors = true;
  return engine;
}

function createRadialButterflyFaces() {
  return createTruncatedOctahedronFaces(
    Math.sqrt(0.9),
    Math.sqrt(0.1),
    BUTTERFLY_PARENTS
  );
}

function createTruncatedOctahedronFaces(edgeWeight, vertexWeight, baseParents) {
  var cornerNormals = [];
  var faces = OCTAHEDRON.map(function(face) {
    var vectors = face.map(degreesToVector);
    var hexagon = [];
    var a = vectors[vectors.length - 1];
    vectors.forEach(function(b) {
      hexagon.push(
        vectorToDegrees(normalizeVector(addScaledVectors(
          a, edgeWeight, b, vertexWeight
        ))),
        vectorToDegrees(normalizeVector(addScaledVectors(
          b, edgeWeight, a, vertexWeight
        )))
      );
      a = b;
    });
    return hexagon;
  });
  canonicalizeVertices(faces);
  faces.forEach(function(hexagon) {
    var normals = [];
    for (var i = 0; i < 3; i++) {
      normals.push(crossVectors(
        degreesToVector(hexagon[(i * 2 + 2) % 6]),
        degreesToVector(hexagon[(i * 2 + 1) % 6])
      ));
    }
    cornerNormals.push(normals);
  });
  var parents = baseParents.concat();
  faces.slice().forEach(function(hexagon, j) {
    var face = OCTAHEDRON[j];
    for (var i = 0; i < 3; i++) {
      faces.push([
        face[i],
        hexagon[(i * 2 + 2) % 6],
        hexagon[(i * 2 + 1) % 6]
      ]);
      parents.push(j);
    }
  });
  return {faces: faces, parents: parents, cornerNormals: cornerNormals};
}

function createTruncatedFaceFinder(cornerNormals) {
  return function(lam, phi) {
    var cosPhi = Math.cos(phi);
    var p = [cosPhi * Math.cos(lam), cosPhi * Math.sin(lam), Math.sin(phi)];
    var face = lam < -Math.PI / 2 ?
      phi < 0 ? 6 : 4 :
      lam < 0 ?
        phi < 0 ? 2 : 0 :
        lam < Math.PI / 2 ?
          phi < 0 ? 3 : 1 :
          phi < 0 ? 7 : 5;
    var normals = cornerNormals[face];
    if (dotVectors(normals[0], p) < 0) return 8 + 3 * face;
    if (dotVectors(normals[1], p) < 0) return 8 + 3 * face + 1;
    if (dotVectors(normals[2], p) < 0) return 8 + 3 * face + 2;
    return face;
  };
}

function canonicalizeVertices(faces) {
  var index = new Map();
  faces.forEach(function(face) {
    face.forEach(function(p, i) {
      var v = degreesToVector(p);
      var key = v.map(function(x) {
        return x.toFixed(12);
      }).join(',');
      if (index.has(key)) {
        face[i] = index.get(key);
      } else {
        index.set(key, p);
      }
    });
  });
}

function createSquareProjectors(faces, radialOptions) {
  var verticesByCenter = new Map();
  var projectors = new Map();
  faces.slice(8).forEach(function(face) {
    var key = pointKey(face[0]);
    var vertices = verticesByCenter.get(key);
    if (!vertices) {
      vertices = new Map();
      verticesByCenter.set(key, vertices);
    }
    vertices.set(pointKey(face[1]), face[1]);
    vertices.set(pointKey(face[2]), face[2]);
  });
  verticesByCenter.forEach(function(vertices, key) {
    var center = key.split(',').map(Number);
    var gnomonic = createGnomonicProjector(center);
    var coords = Array.from(vertices.values()).sort(function(a, b) {
      return planarAngle(a, gnomonic) - planarAngle(b, gnomonic);
    });
    projectors.set(key, createRadialFacetProjector(coords, {
      planarCenter: center,
      radial: radialOptions.radial,
      radial2: radialOptions.radial2,
      radialBlend: radialOptions.radialBlend,
      boundaryStrength: radialOptions.boundaryStrength
    }));
  });
  return projectors;
}

function planarAngle(p, project) {
  var q = project(p[0] * D2R, p[1] * D2R);
  return Math.atan2(q[1], q[0]);
}

function createOctahedron() {
  var vertices = [
    [0, 90],
    [-90, 0],
    [0, 0],
    [90, 0],
    [180, 0],
    [0, -90]
  ];
  return [
    [0, 2, 1],
    [0, 3, 2],
    [5, 1, 2],
    [5, 2, 3],
    [0, 1, 4],
    [0, 4, 3],
    [5, 4, 1],
    [5, 3, 4]
  ].map(function(ids) {
    return ids.map(function(id) {
      return vertices[id];
    });
  });
}

function pointKey(p) {
  return p[0] + ',' + p[1];
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

function addScaledVectors(a, ka, b, kb) {
  return [
    a[0] * ka + b[0] * kb,
    a[1] * ka + b[1] * kb,
    a[2] * ka + b[2] * kb
  ];
}

function crossVectors(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function dotVectors(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalizeVector(p) {
  var k = 1 / Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
  return [p[0] * k, p[1] * k, p[2] * k];
}

function normalizeRadians(lam) {
  return (lam + Math.PI * 3) % (Math.PI * 2) - Math.PI;
}

