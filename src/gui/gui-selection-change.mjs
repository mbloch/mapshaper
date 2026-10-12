// Returns a function that is true when it is given a different list of
// selected ids than it was given last time. The hit control fires 'change'
// for hover as well as selection, and a panel whose controls read every
// feature of a large layer should not refresh as the pointer crosses it.
export function getSelectionChangeTest() {
  var lastIds = null;
  return function(ids) {
    var changed = !lastIds || !sameIds(lastIds, ids);
    lastIds = ids.slice();
    return changed;
  };
}

function sameIds(a, b) {
  if (a.length != b.length) return false;
  for (var i=0; i<a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}
