import { getCrsSlug } from './mapshaper-proj-info';

// Geographic topology used to prepare paths for projections whose forward
// transform is piecewise. A "cut" seam opens a visible gap; an "attached"
// seam (reserved for polyhedral projections) marks a transform boundary that
// must gain vertices without disconnecting the path.
var landTopology = {
  regions: [
    region('northwest', [-180, 0, -40, 90], -100),
    region('northeast', [-40, 0, 180, 90], 30),
    region('southwest', [-180, -90, -100, 0], -160),
    region('south_central_west', [-100, -90, -20, 0], -60),
    region('south_central_east', [-20, -90, 80, 0], 20),
    region('southeast', [80, -90, 180, 0], 140)
  ],
  seams: [
    cutSeam([[-40, 0], [-40, 91]]),
    cutSeam([[-100, -91], [-100, 0]]),
    cutSeam([[-20, -91], [-20, 0]]),
    cutSeam([[80, -91], [80, 0]])
  ]
};

var oceanTopology = {
  regions: [
    region('northwest', [-180, 0, -90, 90], -140),
    region('north_central', [-90, 0, 60, 90], -10),
    region('northeast', [60, 0, 180, 90], 130),
    region('southwest', [-180, -90, -60, 0], -110),
    region('south_central', [-60, -90, 90, 0], 20),
    region('southeast', [90, -90, 180, 0], 150)
  ],
  seams: [
    cutSeam([[-90, 0], [-90, 91]]),
    cutSeam([[60, 0], [60, 91]]),
    cutSeam([[-60, -91], [-60, 0]]),
    cutSeam([[90, -91], [90, 0]])
  ]
};

var projectionTopologies = {
  igh: landTopology,
  imoll: landTopology,
  igh_o: oceanTopology,
  imoll_o: oceanTopology
};

export function getProjectionTopology(P) {
  if (P && P.__projection_topology) {
    return P.__projection_topology;
  }
  var defn = P && projectionTopologies[getCrsSlug(P)];
  if (!defn) return null;
  var lon0 = P.lam0 * 180 / Math.PI;
  return {
    regions: defn.regions.map(function(o) {
      return {
        id: o.id,
        boundary: rotatePath(o.boundary, lon0),
        transform: {
          lon_0: normalizeLongitude(o.transform.lon_0 + lon0)
        }
      };
    }),
    seams: defn.seams.map(function(o) {
      return {
        type: o.type,
        coordinates: rotatePath(o.coordinates, lon0)
      };
    }),
    findRegion: function(lon, lat) {
      return findClassicRegion(defn, normalizeLongitude(lon - lon0), lat);
    },
    findTransitionRegion: function(lon, lat) {
      return findClassicRegion(defn, normalizeLongitude(lon - lon0), lat);
    },
    constrainRegionPoint: function(lon, lat, regionId) {
      return constrainClassicRegionPoint(defn, lon0, lon, lat, regionId);
    },
    getRegionBoundary: function(regionId) {
      return getClassicRegionBoundary(defn, lon0, regionId, 0.5);
    }
  };
}

export function isInterruptedProjection(P) {
  if (P && P.__projection_topology) {
    return P.__projection_topology.seams.some(function(o) {
      return o.type == 'cut';
    });
  }
  var defn = P && projectionTopologies[getCrsSlug(P)];
  return !!defn && defn.seams.some(function(o) {
    return o.type == 'cut';
  });
}

function region(id, bbox, lon0) {
  return {
    id: id,
    boundary: [
      [bbox[0], bbox[1]],
      [bbox[0], bbox[3]],
      [bbox[2], bbox[3]],
      [bbox[2], bbox[1]],
      [bbox[0], bbox[1]]
    ],
    transform: {lon_0: lon0}
  };
}

function findClassicRegion(defn, lon, lat) {
  for (var i = 0; i < defn.regions.length; i++) {
    var region = defn.regions[i];
    var ring = region.boundary;
    if (lon >= ring[0][0] && lon <= ring[2][0] &&
        lat >= ring[0][1] && lat <= ring[2][1]) {
      return region.id;
    }
  }
  return null;
}

function constrainClassicRegionPoint(defn, lon0, lon, lat, regionId) {
  var region = findRegionById(defn, regionId);
  if (!region) return null;
  var ring = region.boundary;
  var xmin = ring[0][0];
  var ymin = ring[0][1];
  var xmax = ring[2][0];
  var ymax = ring[2][1];
  var localLon = normalizeLongitude(lon - lon0);
  var x = Math.max(xmin, Math.min(xmax, localLon));
  var y = Math.max(ymin, Math.min(ymax, lat));
  var cx = (xmin + xmax) / 2;
  var cy = (ymin + ymax) / 2;
  var inset = 1e-8;
  if (x == xmin || x == xmax) x += (cx - x) * inset;
  if (y == ymin || y == ymax) y += (cy - y) * inset;
  return [normalizeLongitude(x + lon0), y];
}

function getClassicRegionBoundary(defn, lon0, regionId, interval) {
  var region = findRegionById(defn, regionId);
  if (!region) return null;
  var ring = region.boundary;
  var corners = [ring[0], ring[1], ring[2], ring[3], ring[0]];
  var points = [];
  for (var i = 1; i < corners.length; i++) {
    var a = corners[i - 1];
    var b = corners[i];
    var n = Math.max(1, Math.ceil(Math.max(
      Math.abs(b[0] - a[0]),
      Math.abs(b[1] - a[1])
    ) / interval));
    for (var j = 0; j < n; j++) {
      points.push([
        normalizeLongitude(a[0] + (b[0] - a[0]) * j / n + lon0),
        a[1] + (b[1] - a[1]) * j / n
      ]);
    }
  }
  points.push(points[0].concat());
  return points;
}

function findRegionById(defn, regionId) {
  for (var i = 0; i < defn.regions.length; i++) {
    if (defn.regions[i].id == regionId) return defn.regions[i];
  }
  return null;
}

function cutSeam(coordinates) {
  return {
    type: 'cut',
    coordinates: coordinates
  };
}

function rotatePath(path, degrees) {
  return path.map(function(p) {
    return [normalizeLongitude(p[0] + degrees), p[1]];
  });
}

function normalizeLongitude(lon) {
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}
