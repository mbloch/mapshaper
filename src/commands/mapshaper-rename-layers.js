/* @requires mapshaper-common */

api.renameLayers = function(layers, names) {
  var nameCount = names && names.length || 0;
  var name = 'layer';
  var suffix = '';
  layers.forEach(function(lyr, i) {
    if (i < nameCount) {
      name = names[i];
    }
    if (nameCount < layers.length && (i >= nameCount - 1)) {
      suffix = (suffix || 0) + 1;
    }
    lyr.name = name + suffix;
  });
};
