// The "Editing:" line at the top of the style panels, which says what a
// change to the panel's controls will act on. One wording for every panel.
//
// o.selected     how many features are selected
// o.total        how many features the layer has
// o.newLabels    (label panel) a placement tool is armed with nothing
//                selected, so the controls set the style of the next label
// o.editingText  (label panel) a label is open for typing
export function formatEditingStatus(o) {
  var what = o.editingText ? 'this label' :
    o.selected > 0 ? o.selected + ' selected' :
    o.newLabels ? 'new labels' :
    o.total > 0 ? 'all' : 'none (empty layer)';
  return 'Editing: ' + what;
}
