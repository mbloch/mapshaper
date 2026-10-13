import cmd from '../mapshaper-cmd';
import { featureIsLabel } from '../svg/svg-feature-utils';
import { updatePointFeature } from './mapshaper-update-label';

cmd.updatePoint = updatePoint;

var pointKind = {
  operation: 'update-point',
  noun: 'point',
  plural: 'points',
  test: function(rec) {
    return !featureIsLabel(rec);
  },
  notKindReason: 'it is a label'
};

// Moves a point feature of any kind other than a label, which -update-label
// moves. The GUI emits it when a point is dragged, so that the move is a
// command, with undo and session history, as -update-symbol is for symbols.
export function updatePoint(targetLayers, dataset, opts) {
  updatePointFeature(targetLayers, dataset, opts, pointKind);
}
