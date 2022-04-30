import { transformPoints } from '../dataset/mapshaper-dataset-utils';
import { getFrameData } from '../furniture/mapshaper-frame-data';
import { Bounds } from '../geom/mapshaper-bounds';

export function transformDatasetToPixels(dataset, opts) {
  var frame = getFrameData(dataset, opts);
  fitDatasetToFrame(dataset, frame, opts);
  return [frame.width, frame.height];
}

export function fitDatasetToFrame(dataset, frame, opts) {
  var bounds = new Bounds(frame.bbox);
  var bounds2 = new Bounds(0, 0, frame.width, frame.height);
  var fwd = bounds.getTransform(bounds2, opts.invert_y);
  transformPoints(dataset, function(x, y) {
    return fwd.transform(x, y);
  });
}
