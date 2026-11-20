var continuousIcons = 0;

// The continuous colors button's icon: a strip shaded from clear to the text
// color. Each one has its own gradient id: a url(#id) finds the first element
// with the id, which may be in a hidden panel, and a hidden gradient isn't
// drawn.
export function getContinuousIcon() {
  var id = 'color-scheme-continuous-icon-' + (++continuousIcons);
  return '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
    '<defs><linearGradient id="' + id + '">' +
    '<stop offset="0" stop-color="currentColor" stop-opacity="0"/>' +
    '<stop offset="1" stop-color="currentColor"/></linearGradient></defs>' +
    '<rect x="1.5" y="3.5" width="11" height="7" rx="1.5" fill="url(#' + id + ')" ' +
    'stroke="currentColor" stroke-width="1.2"/></svg>';
}
