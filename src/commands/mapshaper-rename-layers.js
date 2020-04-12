import cmd from '../mapshaper-cmd';

cmd.renameLayers = function(layers, names) {
  var nameCount = names && names.length || 0;
  var name = '';
  var suffix = '';
  layers.forEach(function(lyr, i) {
    if (i < nameCount) {
      name = names[i];
    }
    if (name && nameCount < layers.length && (i >= nameCount - 1)) {
      suffix = (suffix || 0) + 1;
    }
    lyr.name = name + suffix;
  });
};
