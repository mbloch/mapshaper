/* @requires mapshaper-common */

api.renameLayers = function(layers, names) {
  if (!names || names.length > 0 === false) {
    names = ['layer'];
  }
  var layerCount = layers.length,
      nameCount = names && names.length;

  layers.forEach(function(lyr, i) {
    var name = i < nameCount - 1 ? names[i] : names[nameCount - 1];
    if (nameCount < layerCount && i >= nameCount - 2) {
      name += i - nameCount + 2;
    }
    lyr.name = name;
  });
};
