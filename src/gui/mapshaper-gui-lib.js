/* @requires
mapshaper-gui-utils
mapshaper-common
mapshaper-file-types
*/

var gui = api.gui = {};

gui.isReadableFileType = function(filename) {
  return !!MapShaper.guessInputFileType(filename);
};