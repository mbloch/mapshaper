/* @requires
mapshaper-commands
*/

api.cli = cli;
api.internal = MapShaper;
api.utils = utils;
api.geom = geom;

// Expose internal objects for testing
utils.extend(api.internal, {
  BinArray: BinArray,
  DouglasPeucker: DouglasPeucker,
  Visvalingam: Visvalingam,
  ShpReader: ShpReader,
  ShpType: ShpType,
  ShapeIter: ShapeIter,
  Bounds: Bounds,
  APIError: APIError
});

if (typeof define === "function" && define.amd) {
  define("mapshaper", api);
} else if (typeof module === "object" && module.exports) {
  module.exports = api;
}
this.mapshaper = api;
