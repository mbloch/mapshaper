import { initLabelDragging } from './gui-edit-labels';
import { initPointDragging } from './gui-edit-points';
import { initLineEditing } from './gui-draw-lines2';
import { initPointDrawing } from './gui-draw-points';


export function initInteractiveEditing(gui, ext, hit) {
  initLabelDragging(gui, ext, hit);
  initPointDragging(gui, ext, hit);
  initPointDrawing(gui, ext, hit);
  initLineEditing(gui, ext, hit);
}
