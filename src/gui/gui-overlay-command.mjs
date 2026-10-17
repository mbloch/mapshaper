// Returns the -frame command that places an overlay frame on a host frame.
// The command adds the placement, or updates it if the overlay is already on
// the host, so every placement gesture is one replayable command.
// @hostRef, @overlayRef frame references, formatted as option values
// @placement {position, margin_x, margin_y}
export function getOverlayPlacementCommand(hostRef, overlayRef, placement) {
  var parts = ['-frame', 'target=' + hostRef, 'overlay=' + overlayRef];
  if (placement) {
    parts.push('overlay-position=' + placement.position);
    parts.push('overlay-margin=' + formatMargin(placement.margin_x) + ',' +
      formatMargin(placement.margin_y));
  }
  return parts.join(' ');
}

export function getRemoveOverlayCommand(hostRef, overlayRef) {
  return '-frame target=' + hostRef + ' remove-overlay=' + overlayRef;
}

function formatMargin(val) {
  return String(Math.round((+val || 0) * 100) / 100);
}
