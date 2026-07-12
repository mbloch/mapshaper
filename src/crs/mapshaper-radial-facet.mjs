import {createGnomonicProjector} from './mapshaper-slice-and-dice';

var D2R = Math.PI / 180;
var EPS = 1e-12;

// Create a smooth facet projection from any radial azimuthal projection.
// The azimuthal coordinates are warped back to the gnomonic polygon along
// the boundary, so adjacent facets retain identical straight edges.
export function createRadialFacetProjector(coords, options) {
  options = options || {};
  var center = options.planarCenter || getSphericalCenter(coords);
  var gnomonic = createGnomonicProjector(center);
  var planar = coords.map(function(p) {
    return gnomonic(p[0] * D2R, p[1] * D2R);
  });
  var edges = createNormalizedEdges(planar);
  var radial = createRadialFunction(
    options.radial || 'equal-area',
    options.radial2,
    options.radialBlend
  );
  var boundaryStrength = options.boundaryStrength || 1;
  var radialScale = getRadialScale(planar, radial) *
    (options.radialScale || 1);

  project.radial = options.radial || 'equal-area';
  project.boundaryStrength = boundaryStrength;
  return project;

  function project(lam, phi) {
    var p = gnomonic(lam, phi);
    var r = Math.hypot(p[0], p[1]);
    if (r < EPS) return [0, 0];
    var c = Math.atan(r);
    var azimuthalRadius = radial(c) * radialScale;
    var boundaryWeight = getBoundaryWeight(p, edges, boundaryStrength);
    var scale = 1 + boundaryWeight * (azimuthalRadius / r - 1);
    return [p[0] * scale, p[1] * scale];
  }
}

function createRadialFunction(radial1, radial2, blend) {
  var f1 = getRadialFunction(radial1);
  if (!radial2) return f1;
  var f2 = getRadialFunction(radial2);
  var k = Math.max(0, Math.min(1, blend == null ? 0.5 : blend));
  return function(c) {
    return f1(c) + (f2(c) - f1(c)) * k;
  };
}

function getRadialFunction(id) {
  if (typeof id == 'function') return id;
  id = normalizeRadialProjectionName(id);
  if (id == 'aeqd') return function(c) {
    return c;
  };
  if (id == 'stere') return function(c) {
    return 2 * Math.tan(c / 2);
  };
  if (id == 'ortho') return function(c) {
    return Math.sin(c);
  };
  if (id == 'gnom') return function(c) {
    return Math.tan(c);
  };
  // Lambert azimuthal equal-area
  return function(c) {
    return 2 * Math.sin(c / 2);
  };
}

export function normalizeRadialProjectionName(id) {
  id = String(id || '').toLowerCase().replace(/_/g, '-');
  if (id == 'laea' || id == 'lambert' || id == 'equal-area') return 'laea';
  if (id == 'aeqd' || id == 'equidistant') return 'aeqd';
  if (id == 'stere' || id == 'stereographic') return 'stere';
  if (id == 'ortho' || id == 'orthographic') return 'ortho';
  if (id == 'gnom' || id == 'gnomonic') return 'gnom';
  throw new Error('Unsupported facet projection: ' + id);
}

function getRadialScale(planar, radial) {
  var sum = 0;
  planar.forEach(function(p) {
    var r = Math.hypot(p[0], p[1]);
    sum += r / radial(Math.atan(r));
  });
  return sum / planar.length;
}

function createNormalizedEdges(planar) {
  var center = [0, 0];
  return planar.map(function(a, i) {
    var b = planar[(i + 1) % planar.length];
    var dx = b[0] - a[0];
    var dy = b[1] - a[1];
    var centerCross = dx * (center[1] - a[1]) -
      dy * (center[0] - a[0]);
    return {
      a: a,
      dx: dx,
      dy: dy,
      denominator: centerCross
    };
  });
}

function getBoundaryWeight(p, edges, strength) {
  var product = 1;
  for (var i = 0; i < edges.length; i++) {
    var edge = edges[i];
    var cross = edge.dx * (p[1] - edge.a[1]) -
      edge.dy * (p[0] - edge.a[0]);
    product *= Math.max(0, cross / edge.denominator);
  }
  product = Math.max(0, Math.min(1, product));
  return 1 - Math.pow(1 - product, strength);
}

function getSphericalCenter(coords) {
  var sum = coords.reduce(function(memo, p) {
    var lam = p[0] * D2R;
    var phi = p[1] * D2R;
    var cosPhi = Math.cos(phi);
    memo[0] += Math.cos(lam) * cosPhi;
    memo[1] += Math.sin(lam) * cosPhi;
    memo[2] += Math.sin(phi);
    return memo;
  }, [0, 0, 0]);
  return [
    Math.atan2(sum[1], sum[0]) / D2R,
    Math.atan2(sum[2], Math.hypot(sum[0], sum[1])) / D2R
  ];
}
