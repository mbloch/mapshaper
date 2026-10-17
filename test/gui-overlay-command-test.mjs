import assert from 'assert';
import { getOverlayPlacementCommand, getRemoveOverlayCommand } from '../src/gui/gui-overlay-command';

describe('gui-overlay-command.mjs', function() {
  it('places an overlay at a corner with two margins', function() {
    assert.equal(getOverlayPlacementCommand('main', '"Frame 2"',
      {position: 'top-left', margin_x: 12.3456, margin_y: -4}),
      '-frame target=main overlay="Frame 2" overlay-position=top-left overlay-margin=12.35,-4');
  });

  it('leaves the placement to the command when none is given', function() {
    assert.equal(getOverlayPlacementCommand('main', 'inset', null),
      '-frame target=main overlay=inset');
  });

  it('removes an overlay', function() {
    assert.equal(getRemoveOverlayCommand('main', 'inset'),
      '-frame target=main remove-overlay=inset');
  });
});
