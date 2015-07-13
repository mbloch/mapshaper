/* @require mapshaper-gui-lib */

function LayerControl(model) {
  var el = El("#layer-menu");
  var label = El('#layer-control .layer-name');

  model.addMode('layer_menu', turnOn, turnOff);
  new ModeButton('#layer-control .mode-btn', 'layer_menu', model);

  model.on('select', function(e) {
    var name = e.layer.name || "[unnamed layer]";
    label.html(name + " &nbsp;&#9660;");
    render();
  });

  model.on('update', render); // todo: be more selective about when to rerender

  function turnOn() {
    el.show();
  }

  function turnOff() {
    el.hide();
  }

  function render() {
    var list = El('#layer-menu .layer-list');
    var datasets = model.getDatasets();

    list.empty();
    datasets.forEach(function(dataset) {
      dataset.layers.forEach(function(lyr) {
        list.appendChild(renderLayer(lyr, dataset));
      });
    });
  }

  function describeLyr(lyr) {
    var n = MapShaper.getFeatureCount(lyr),
        str;
    if (lyr.geometry_type) {
      str = utils.format('%,d %s feature%s', n, lyr.geometry_type,
          utils.pluralSuffix(n));
    } else if (lyr.data) {
      str = utils.format('%,d data record%s', n, utils.pluralSuffix(n));
    } else {
      str = "[empty]";
    }
    return str;
  }

  function renderLayer(lyr, dataset) {
    var editLyr = model.getEditingLayer().layer;
    var entry = El('div').addClass('layer-item');
    var str = rowHTML('name', lyr.name || '[unnamed]');
    str += rowHTML('source file', dataset.info.input_files[0]);
    str += rowHTML('contents', describeLyr(lyr));
    entry.html(str);
    entry.on('click', function() {
      if (lyr != editLyr) {
        model.setEditingLayer(lyr, dataset);
      }
      model.clearMode();
    });
    if (lyr == editLyr) {
      entry.addClass('active');
    }

    return entry;
  }

  function rowHTML(c1, c2) {
    return utils.format('<div class="row"><div class="col1">%s</div>' +
      '<div class="col2">%s</div></div>', c1, c2);
  }
}
