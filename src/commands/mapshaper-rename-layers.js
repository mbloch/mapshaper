/* @requires mapshaper-common */

api.renameLayers = function(layers, names) {
  var nameCount = names && names.length || 0;
  layers.forEach(function(lyr, i) {
    var name;
    if (nameCount === 0) {
      name = "layer" + (i + 1);
    } else {
      name = i < nameCount - 1 ? names[i] : names[nameCount - 1];
      if (nameCount < layers.length && i >= nameCount - 2) {
        name += i - nameCount + 2;
      }
    }
    lyr.name = name;
  });
};
