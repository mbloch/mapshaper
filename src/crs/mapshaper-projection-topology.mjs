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
    })
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
