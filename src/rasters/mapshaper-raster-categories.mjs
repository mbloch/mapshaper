// The names of a categorical raster's values, read from the file it came from
// (see mapshaper-geotiff-categories.mjs) or from a palette with labels:
//
// grid.categoryNames = {<band number>: {<value>: name}}
//
// band numbers are 1-based, as in the source file (as in grid.bandDescriptions).
// The names belong to the values, not to how they are colored, so a new
// palette keeps them. Plain data, so they go where the grid goes: reprojected,
// clipped, or saved in a session.

// {<value>: name} for a band, or null
// @band: band number in the source file
export function getRasterCategoryNames(grid, band) {
  var names = grid && grid.categoryNames;
  return names && names[band] || null;
}

// The name of a value, or null
export function getRasterCategoryName(grid, band, value) {
  var names = getRasterCategoryNames(grid, band);
  var name = names ? names[value] : null;
  return name === undefined ? null : name;
}

// @names: {<value>: name}, or null to remove a band's names
export function setRasterCategoryNames(grid, band, names) {
  var all = Object.assign({}, grid.categoryNames);
  if (names && Object.keys(names).length > 0) {
    all[band] = names;
  } else {
    delete all[band];
  }
  if (Object.keys(all).length > 0) {
    grid.categoryNames = all;
  } else {
    delete grid.categoryNames;
  }
}
