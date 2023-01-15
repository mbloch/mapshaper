import { initPointDrawing } from './gui-draw-points';
import { Pencil } from './gui-drawing-pencil';

export function initDrawing(gui, ext, mouse, hit) {
  initPointDrawing(gui, new Pencil(gui, mouse, hit));
}



