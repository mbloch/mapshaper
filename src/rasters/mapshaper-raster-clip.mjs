import { clipRasterLayer } from './mapshaper-raster-utils';
import { getPolygonPixelMask } from './mapshaper-raster-mask';
import { fillEmptyRasterPixels } from './mapshaper-raster-fill';
import { warn } from '../utils/mapshaper-logging';

// Removes the pixels of a raster layer whose centers are outside the polygons
// of @clipLyr. The raster is cropped to @bbox (the polygons' bounding box),
// and the remaining outside pixels are emptied as -proj empties the pixels
// it can't fill (see mapshaper-raster-fill).
export function clipRasterToPolygons(lyr, clipLyr, arcs, bbox, opts) {
  return clipRasterLayer(lyr, bbox, opts, {
    pixelCenters: true,
    editGrid: function(grid) {
      var mask = getPolygonPixelMask(grid, clipLyr, arcs);
      var coverage = grid.coverage;
      var n = mask.length;
      var inside = 0, i;
      for (i = 0; i < n; i++) {
        if (mask[i]) inside++;
        else if (coverage) coverage[i] = 0;
      }
      if (inside === 0) {
        warn('The clipping polygons do not contain the center of any raster pixel');
      }
      if (inside == n) return;
      if (!coverage) grid.coverage = mask;
      fillEmptyRasterPixels(grid, lyr.raster, opts);
    }
  });
}
