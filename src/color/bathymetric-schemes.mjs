// Bathymetric tints: colors at fixed depths, in meters (negative), deepest
// first, for coloring the sea of an elevation raster (-classify sea=). Pale
// is measured from the ocean of Tom Patterson's public-domain Equal Earth
// physical map, a least-squares fit by depth, with the trenches below 6000 m
// (few pixels, lightened by his shading) extended in the same direction.
// Blue and Gray have the same lightness steps, stronger and with more or
// less chroma (in OKLCH). The stops are those of a 12-stop fit that OKLCH
// interpolation reproduces within 1.4 dE (OKLab x 100) above 10000 m; the
// trenches below take the deepest color.
var bathymetricSchemes = {
  Pale: [[-10000, '#87b9da'], [-5000, '#97cae9'], [-3000, '#a5d5f0'], [-200, '#d9f0f9'],
    [0, '#e2f5fb']],
  Blue: [[-10000, '#1d6a96'], [-5000, '#3d8cb7'], [-3000, '#52a3cd'], [-200, '#b6deed'],
    [0, '#c8e8f2']],
  Gray: [[-10000, '#7d8890'], [-5000, '#95a1a9'], [-3000, '#a7b2b9'], [-200, '#dbe1e3'],
    [0, '#e5eaeb']]
};

export function getBathymetricSchemeNames() {
  return Object.keys(bathymetricSchemes);
}

// [{elevation, color}], deepest first, or null if there is no such scheme
export function getBathymetricStops(name) {
  var stops = bathymetricSchemes[name];
  return stops ? stops.map(function(stop) {
    return {elevation: stop[0], color: stop[1]};
  }) : null;
}
