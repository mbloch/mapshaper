import { initPointDrawing } from './gui-draw-points';
import { initLineDrawing } from './gui-draw-lines';

export function initDrawing(gui, ext, mouse, hit) {
  initPointDrawing(gui, ext, mouse, hit);
  initLineDrawing(gui, ext, mouse, hit);
}
