// Hypsometric tints: colors at fixed elevations, in meters, low to high, for
// coloring elevation rasters so that an elevation has the same color in every
// map. These are cross-blended hypsometric tints (Patterson and Jenny,
// Cartographic Perspectives 69, 2011), with colors measured from Tom
// Patterson's public-domain Equal Earth physical map: Arid, Lush (warm-humid)
// and Temperate (cold-humid) have the same colors from 1000 m up and differ in
// the lowlands; Polar is for ice and snow. The stops are close together at the
// low end, where the lowland colors change.
var highlands = [[1000, '#d2d4b7'], [2000, '#cecfba'], [3000, '#c9d1c9'], [4000, '#d6d8d3'], [5000, '#dde0e1'], [6000, '#e4e7ea']];
var hypsometricSchemes = {
  Arid: [[0, '#efe5cd'], [50, '#f8e3c8'], [200, '#f6e6c9'], [600, '#f7e3cd']].concat(highlands),
  Lush: [[0, '#9fc19d'], [50, '#96c197'], [200, '#a4c99f'], [600, '#9cc5a0']].concat(highlands),
  Temperate: [[0, '#c2cfcd'], [50, '#b2c2b5'], [200, '#a2bcac'], [600, '#d2cfac']].concat(highlands),
  Polar: [[0, '#f9ffff'], [50, '#f0f9ff'], [200, '#f2f3fd'], [600, '#e5eaf9'], [1000, '#ebecf7'], [2000, '#edf2fa'], [3000, '#f6faff'], [4000, '#ffffff']]
};

export function getHypsometricSchemeNames() {
  return Object.keys(hypsometricSchemes);
}

// [{elevation, color}], or null if there is no such scheme
export function getHypsometricStops(name) {
  var stops = hypsometricSchemes[name];
  return stops ? stops.map(function(stop) {
    return {elevation: stop[0], color: stop[1]};
  }) : null;
}
