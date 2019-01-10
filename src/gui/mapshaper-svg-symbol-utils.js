
function getSymbolNodeId(node) {
  return parseInt(node.getAttribute('data-id'));
}

function getSymbolNodeById(id, parent) {
  // TODO: optimize selector
  var sel = '[data-id="' + id + '"]';
  return parent.querySelector(sel);
}

