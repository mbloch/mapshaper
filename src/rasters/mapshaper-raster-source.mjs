// Sample arrays that hold pixel values as they were read from a raster's
// source file. A raster whose samples are in this set has not been edited
// since it was imported, so its source can be read again in its place, e.g. at
// full resolution or with other bands (see getRasterSourceBands()).
//
// Contract: code that changes pixel values or georeferencing must either make
// a new grid and sample array (as every raster command does now), or call
// markRasterSamplesAsEdited() before writing into an existing sample array.
// Otherwise an edited raster would be replaced by its unedited source.
var sourceSamples = new WeakSet();

// Reads the files of a raster source that is not on the local file system;
// set by the web UI, which keeps imported files in browser storage.
// function(sourceInfo) -> Promise<content group | null>
var sourceReader = null;

export function markRasterSamplesAsSource(grid) {
  if (grid && grid.samples) sourceSamples.add(grid.samples);
}

export function markRasterSamplesAsEdited(grid) {
  if (grid && grid.samples) sourceSamples.delete(grid.samples);
}

export function rasterSamplesAreFromSource(grid) {
  return !!(grid && grid.samples) && sourceSamples.has(grid.samples);
}

// A copy of a raster's samples (e.g. for an undo snapshot) holds the same
// values
export function copyRasterSourceStatus(fromGrid, toGrid) {
  if (rasterSamplesAreFromSource(fromGrid)) markRasterSamplesAsSource(toGrid);
}

export function setRasterSourceReader(fn) {
  sourceReader = fn || null;
}

export function getRasterSourceReader() {
  return sourceReader;
}
