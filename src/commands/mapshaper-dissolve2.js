import cmd from '../mapshaper-cmd';
import { dissolvePolygonLayer2 } from '../dissolve/mapshaper-polygon-dissolve2';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { requirePolygonLayer, layerHasPaths } from '../dataset/mapshaper-layer-utils';

// Removes small gaps and all overlaps
cmd.dissolve2 = function(layers, dataset, opts) {
  layers.forEach(requirePolygonLayer);
  var nodes = addIntersectionCuts(dataset, opts);
  return layers.map(function(lyr) {
    if (!layerHasPaths(lyr)) return lyr;
    return dissolvePolygonLayer2(lyr, dataset, opts);
  });
};
