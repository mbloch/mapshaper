import { error, internal } from './gui-core';
import { updatePointCoords, getPointCoords } from './gui-display-utils';

export function initPointDrawing(gui, ext, hit) {
  function active(e) {
    return e.id > -1 && gui.interaction.getMode() == 'add-points';
  }
}