import { getProjTransform2, parseCrsString } from '../crs/mapshaper-projections';

// Seas that a DEM's sea mask (see mapshaper-raster-sea-mask.mjs) can't reach
// from the open ocean at the resolution of a world or continental map, where
// straits like Gibraltar, the Bosporus and the Danish straits are narrower
// than a pixel. At higher resolutions the straits connect them.
//
// level: the surface, in meters. The sea is the pixels at or below it that
//   connect to one of the points, so it works whether a DEM gives the sea's
//   depths or only its surface. The Caspian's surface has been between about
//   -26 and -29 m; a level of -25 m leaves out the dry lowland around it,
//   which is below sea level too.
// points: [lon, lat] in open water, away from coasts and islands; a sea has
//   several in case one of them lands on land or nodata, and one in each part
//   that a coarse grid might separate from the rest
var INLAND_SEAS = [
  {name: 'Mediterranean Sea', level: 0, points: [
    [-3, 36], [5, 38.5], [8, 43], [12.5, 39.5], [15, 43], [13, 44.8],
    [18.5, 36], [19, 32.5], [25, 39], [24.5, 35.8], [30, 33.5]]},
  {name: 'Sea of Marmara', level: 0, points: [[28.2, 40.75]]},
  {name: 'Black Sea', level: 0, points: [[31, 43], [34.5, 43.5], [38.5, 42.5], [31.5, 45]]},
  {name: 'Sea of Azov', level: 0, points: [[36.8, 46.2]]},
  {name: 'Caspian Sea', level: -25, points: [[50.5, 42.5], [51, 39], [50, 45.3]]},
  {name: 'Baltic Sea', level: 0, points: [
    [19, 56], [20, 58.5], [20.5, 62], [23, 64.8], [25.5, 59.8], [23.5, 57.7], [11.5, 57]]},
  {name: 'Red Sea', level: 0, points: [[38, 20], [36, 24.5], [41, 16], [34.5, 27]]},
  {name: 'Persian Gulf', level: 0, points: [[51.5, 27], [53.5, 25.5], [50, 28]]},
  {name: 'White Sea', level: 0, points: [[37.5, 65.3]]},
  {name: 'Seto Inland Sea', level: 0, points: [[133.3, 34.2], [132.2, 33.75]]},
  {name: 'Hudson Bay', level: 0, points: [[-85, 60], [-80.5, 53], [-78, 66.5]]}
];

export function getInlandSeas() {
  return INLAND_SEAS;
}

// The inland seas' points in the coordinates of @crs, as [x, y, level], or
// null if @crs is missing. Points that @crs can't project are left out.
export function getInlandSeaSeeds(crs) {
  var proj, seeds;
  if (!crs) return null;
  proj = getProjTransform2(parseCrsString('wgs84'), crs);
  seeds = [];
  INLAND_SEAS.forEach(function(sea) {
    sea.points.forEach(function(p) {
      var xy = proj(p[0], p[1]);
      if (xy && isFinite(xy[0]) && isFinite(xy[1])) {
        seeds.push([xy[0], xy[1], sea.level]);
      }
    });
  });
  return seeds;
}
