import { initLabelDragging } from './gui-edit-labels';
import { initPointDragging } from './gui-edit-points';
import { initVertexDragging } from './gui-edit-vertices';

export function initInteractiveEditing(gui, ext, hit) {
  initLabelDragging(gui, ext, hit);
  initPointDragging(gui, ext, hit);
  initVertexDragging(gui, ext, hit);

  // function isClickEvent(up, down) {
  //   var elapsed = Math.abs(down.timeStamp - up.timeStamp);
  //   var dx = up.screenX - down.screenX;
  //   var dy = up.screenY - down.screenY;
  //   var dist = Math.sqrt(dx * dx + dy * dy);
  //   return dist <= 4 && elapsed < 300;
  // }
}
