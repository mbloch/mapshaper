/* @require mapshaper-gui-lib */

function LayerControl(model) {
  var el = El('#layer-control .layer-name');
  model.on('select', function(e) {
    var name = e.layer.name || "[unnamed layer]";
    el.html(name + " &nbsp;&#9660;");
  });
}
