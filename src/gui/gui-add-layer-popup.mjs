import { showPopupAlert } from './gui-alert';
import { internal } from './gui-core';

export function openAddLayerPopup(gui) {
  var popup = showPopupAlert('', 'Add empty layer');
  var el = popup.container();
  el.addClass('option-menu');
  var html = `<div><input type="text" class="layer-name text-input" placeholder="layer name"></div>
  <div style="margin: 2px 0 4px;">
    Type: &nbsp;
    <label><input type="radio" name="geomtype" checked value="point" class="radio">point</label> &nbsp;
    <label><input type="radio" name="geomtype" value="polygon" class="radio">polygon</label> &nbsp;
    <label><input type="radio" name="geomtype" value="polyline" class="radio">line</label>
  </div>
  <div tabindex="0" class="btn dialog-btn">Create</div></span>`;
  el.html(html);
  var name = el.findChild('.layer-name');
  name.node().focus();
  var btn = el.findChild('.btn').on('click', function() {
    var nameStr = name.node().value.trim();
    var type = el.findChild('input:checked').node().value;
    addLayer(gui, nameStr, type);
    popup.close();
  });
}

function addLayer(gui, name, type) {
  var targ = gui.model.getActiveLayer();
  var crsInfo = targ && internal.getDatasetCrsInfo(targ.dataset);
  var dataset = {
    layers: [{
      name: name || undefined,
      geometry_type: type,
      shapes: []
    }],
    info: {}
  };
  if (type == 'polygon' || type == 'point') {
    dataset.arcs = new internal.ArcCollection();
  }
  if (crsInfo) {
    internal.setDatasetCrsInfo(dataset, crsInfo);
  }
  gui.model.addDataset(dataset);
  gui.model.updated({select: true});
}
