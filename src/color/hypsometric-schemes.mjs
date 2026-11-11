// Hypsometric tints: colors at fixed elevations, in meters, low to high, for
// coloring elevation rasters so that an elevation has the same color in every
// map. These are cross-blended hypsometric tints (Patterson and Jenny,
// Cartographic Perspectives 69, 2011), with colors measured from Tom
// Patterson's public-domain Equal Earth physical map: Arid, Lush (warm-humid)
// and Temperate (cold-humid) differ in the lowlands; Lush and Temperate have
// the same colors from 1000 m up, Arid's stay brown to 2000 m, and the three
// are the same from 3000 m up. Arid's colors below 3000 m are the Sahara's,
// pale yellow in the lowlands and reddish brown in the highlands, rather than
// an average of the world's deserts. Polar is for ice and snow. All four have
// the same elevations, which a blend of them shares. The stops are close
// together at the low end, where the lowland colors change.
var peaks = [[3000, '#c9d1c8'], [4000, '#d6d8d3'], [5000, '#dde0e1'], [6000, '#e4e7ea']];
var humidHighlands = [[1000, '#c4d4af'], [2000, '#bdcdb4']].concat(peaks);
var hypsometricSchemes = {
  Arid: [[0, '#f1edde'], [50, '#f5f4e5'], [200, '#f3ebd7'], [600, '#f1e5d0'], [1000, '#e6d9c9'],
    [2000, '#ded0c8']].concat(peaks),
  Lush: [[0, '#9fc19d'], [50, '#97c197'], [200, '#a3c99f'], [600, '#9ec5a1']].concat(humidHighlands),
  Temperate: [[0, '#c2cfcd'], [50, '#b3c2b5'], [200, '#a1bcac'], [600, '#d4d0ad']].concat(humidHighlands),
  Polar: [[0, '#f9ffff'], [50, '#f0f9ff'], [200, '#f2f3fd'], [600, '#e5eaf9'], [1000, '#ebecf7'], [2000, '#edf2fa'],
    [3000, '#f6faff'], [4000, '#ffffff'], [5000, '#ffffff'], [6000, '#ffffff']]
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
