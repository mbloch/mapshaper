// Bathymetric tints: colors at fixed depths, in meters (negative), deepest
// first, for coloring the sea of an elevation raster (-classify sea=). Pale
// is measured from the ocean of Tom Patterson's public-domain Equal Earth
// physical map, a least-squares fit by depth, with the trenches below 6000 m
// (few pixels, lightened by his shading) extended in the same direction.
// Blue and Gray have the same lightness steps, stronger and with more or
// less chroma (in OKLCH).
var bathymetricSchemes = {
  Pale: [[-11000, '#85b6d8'], [-8000, '#8cbedf'], [-6000, '#93c5e5'], [-5000, '#97cae9'], [-4000, '#9aceed'],
    [-3000, '#a5d5f0'], [-2000, '#b7e0f6'], [-1000, '#cbeafa'], [-500, '#d6effb'], [-200, '#d9f0f9'],
    [-50, '#dff4fb'], [0, '#e2f5fb']],
  Blue: [[-11000, '#176591'], [-8000, '#2774a0'], [-6000, '#3582ae'], [-5000, '#3d8cb7'], [-4000, '#4594be'],
    [-3000, '#52a3cd'], [-2000, '#73bbdf'], [-1000, '#9bd0eb'], [-500, '#b1dbef'], [-200, '#b6deed'],
    [-50, '#c2e6f2'], [0, '#c8e8f2']],
  Gray: [[-11000, '#79848c'], [-8000, '#848f97'], [-6000, '#8e9aa2'], [-5000, '#95a1a9'], [-4000, '#9ba7af'],
    [-3000, '#a7b2b9'], [-2000, '#bbc4ca'], [-1000, '#ced6da'], [-500, '#d9dfe2'], [-200, '#dbe1e3'],
    [-50, '#e2e8e9'], [0, '#e5eaeb']]
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
