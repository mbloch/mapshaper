import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import { featureHasSvgSymbol, featureIsLabel, featureIsCurve } from '../svg/svg-feature-utils';
import { updatePointFeature } from './mapshaper-update-label';

cmd.updateSymbol = updateSymbol;

var symbolKind = {
  operation: 'update-symbol',
  noun: 'symbol',
  plural: 'symbols',
  test: function(rec) {
    return featureHasSvgSymbol(rec) && !featureIsLabel(rec);
  },
  notKindReason: 'it has no symbol properties, or it is a label',
  validate: function(rec, coords) {
    if (featureIsCurve(rec) && coords.length < 2) {
      stop('A curve needs at least two points');
    }
  }
};

// Moves a symbol that already exists, or rewrites the knots of a curve:
// -symbols coordinates= adds a symbol, -style restyles one, and this changes
// its points and nothing else. The GUI emits it when a symbol or a curve's
// knot is dragged, so that the move is a command, with undo and session
// history, like -update-label for labels.
//
// A closed curve's repeated first point is a point like any other here: the
// caller sends both copies.
export function updateSymbol(targetLayers, dataset, opts) {
  updatePointFeature(targetLayers, dataset, opts, symbolKind);
}
