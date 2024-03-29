import { initLabelDragging } from './gui-edit-labels';
import { initPointEditing } from './gui-edit-points';
import { initLineEditing } from './gui-draw-lines2';


export function initInteractiveEditing(gui, ext, hit) {
  initLabelDragging(gui, ext, hit);
  initPointEditing(gui, ext, hit);
  initLineEditing(gui, ext, hit);
}
