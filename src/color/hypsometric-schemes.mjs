// Hypsometric tints: colors at fixed elevations, in meters, low to high, for
// coloring elevation rasters so that an elevation has the same color in every
// map. These are cross-blended hypsometric tints (Patterson and Jenny,
// Cartographic Perspectives 69, 2011), one for each climate zone of
// hypsometric-climate.mjs, with colors measured from Tom Patterson's
// public-domain Equal Earth physical map: each zone's colors are a
// least-squares fit to his map's land, with each pixel a blend of the zones
// by the climate grid. Desert, Steppe, Tropical, Temperate and Boreal differ
// in the lowlands; the three humid zones have the same colors from 1000 m
// up, and the five are the same from 3000 m up. Desert's colors up to 1000 m
// are the Sahara's, pale yellow in the lowlands and reddish brown in the
// highlands, rather than an average of the world's deserts. Steppe is for
// the semi-arid grasslands around them. Polar is for tundra, ice and snow.
// All six have the same elevations, which a blend of them shares.
// The stops are close together at the low end, where the lowland colors
// change; colors between them are interpolated, and more stops (at 0, 2000,
// 4000 and 5000 m) made no visible difference to the fit. The 6000 m color
// is a very light grayish tan rather than the fit's bluish gray (#e8ebf3),
// which tinted the high plateaus of Tibet and the Andes.
var peaks = [[3000, '#d0d2c6'], [6000, '#f7f6f3']];
var humidHighlands = [[1000, '#c7d6c0']].concat(peaks);
var hypsometricSchemes = {
  Desert: [[50, '#f5f4e5'], [200, '#f3ebd7'], [600, '#f1e5d0'], [1000, '#e6d9c9']].concat(peaks),
  Steppe: [[50, '#ddd9bc'], [200, '#e1ddbb'], [600, '#e1dabb'], [1000, '#ded7b4']].concat(peaks),
  Tropical: [[50, '#a8c9aa'], [200, '#a8caa5'], [600, '#aecea9']].concat(humidHighlands),
  Temperate: [[50, '#c1d3b5'], [200, '#b9cea9'], [600, '#b4c6a6']].concat(humidHighlands),
  Boreal: [[50, '#d2ddd1'], [200, '#ccdbcc'], [600, '#d5ded3']].concat(humidHighlands),
  Polar: [[50, '#edf3f6'], [200, '#e6e8ec'], [600, '#e5e6ed'], [1000, '#e9ebf4'], [3000, '#f8f9fc'],
    [6000, '#ffffff']]
};

// Presets outside the climate blend, each with its own elevations. Atlas is a
// classic school-atlas ramp, from blue-green lowlands through yellow-green and
// tan to pale yellow and light gray; its elevations are the lower bounds of
// its classes (0-200, 200-500, 500-1000, 1000-2000, 2000-4000, above 4000 m).
// Lowland is from a regional topographic map of southwestern France, for
// detail in low country: a dark gray-green coastal plain, through olive and
// yellow-green hills to cream at 750-1250 m, measured from the map's flat
// ground (its legend is darker), and white from 2000 m, as its legend has.
// Highland is for dry middle mountains: pale olive-cream valleys, ochre and
// rust brown bare slopes, then light tan and white. Its colors are measured
// from a Swiss-style shaded relief of an arid range, at the lightness of its
// flat ground (its shadows are olive and its lit slopes white, so those were
// left out); the image gave no elevations, so they are chosen, not measured.
var otherSchemes = {
  Atlas: [[0, '#b2c9ba'], [200, '#cad7bf'], [500, '#e4e5c4'], [1000, '#efe1c1'], [2000, '#f1edce'],
    [4000, '#f0efee']],
  Lowland: [[0, '#758d6f'], [125, '#a59e6e'], [250, '#c1bd86'], [500, '#dedd9d'], [750, '#e2dbab'],
    [1000, '#ded9af'], [2000, '#ffffff']],
  Highland: [[0, '#cdc5a0'], [500, '#c4b888'], [1000, '#bba260'], [1500, '#b99151'], [2000, '#ddd0b0'],
    [3000, '#e9e5d5'], [4000, '#f7f5ef']]
};

// All the presets: the climate presets, then the others
export function getHypsometricSchemeNames() {
  return getClimateSchemeNames().concat(Object.keys(otherSchemes));
}

// The presets of the climate blend (see hypsometric-climate.mjs)
export function getClimateSchemeNames() {
  return Object.keys(hypsometricSchemes);
}

// [{elevation, color}], or null if there is no such scheme
export function getHypsometricStops(name) {
  var stops = hypsometricSchemes[name] || otherSchemes[name];
  return stops ? stops.map(function(stop) {
    return {elevation: stop[0], color: stop[1]};
  }) : null;
}
