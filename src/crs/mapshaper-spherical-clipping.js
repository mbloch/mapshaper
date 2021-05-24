import { isLatLngCRS, getDatasetCRS } from '../crs/mapshaper-projections';
import { clipLayersInPlace } from '../commands/mapshaper-clip-erase';
import { getClippingDataset } from '../crs/mapshaper-proj-extents';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';

export function preProjectionClip(dataset, src, dest, opts) {
  if (!isLatLngCRS(src) || opts.no_clip) return false;
  var clipData = getClippingDataset(src, dest, opts);
  if (clipData) {
    // TODO: don't bother to clip content that is fully within
    // the clipping shape. But how to tell?
    clipLayersInPlace(dataset.layers, clipData, dataset, 'clip');
     // remove arcs outside the clip area, so they don't get projected
    //dissolveArcs(dataset);
  }
  return !!clipData;
}
