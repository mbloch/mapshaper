/* @require mapshaper-gui-lib */

function LayerControl(model) {
  var el = El("#layer-menu").on('click', gui.handleDirectEvent(model.clearMode));
  var label = El('#layer-control .layer-name');
  var btn = new ModeButton('#layer-control .mode-btn', 'layer_menu', model);
  model.addMode('layer_menu', turnOn, turnOff);

  model.on('select', function(e) {
    updateBtn();
    render();
  });

  model.on('update', render); // todo: be more selective about when to rerender

  function turnOn() {
    el.show();
  }

  function updateBtn() {
    var name = model.getEditingLayer().layer.name || "[unnamed layer]";
    label.html(name + " &nbsp;&#9660;");
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
    var unnamed = '[unnamed]';
    var entry = El('div').addClass('layer-item');
    var editLyr = model.getEditingLayer().layer;
    var html = rowHTML('name', '<span class="layer-name">' + (lyr.name || unnamed) + '</span>');
    var nameEl;

    html += rowHTML('source file', dataset.info.input_files[0]);
    html += rowHTML('contents', describeLyr(lyr));
    entry.html(html);
    if (lyr == editLyr) {
      entry.addClass('active');
    }
    nameEl = new ClickText2(entry.findChild('.layer-name'))
      .on('change', function(e) {
        var str = cleanLayerName(nameEl.value());
        nameEl.value(str || unnamed);
        lyr.name = str;
        updateBtn();
      });
    onClick(entry, function() {
      if (nameEl.editing) {
        return;
      }
      if (lyr != editLyr) {
        model.updated({select: true}, lyr, dataset);
      }
      model.clearMode();
    });
    return entry;
  }

  function cleanLayerName(raw) {
    return raw.replace(/[\n\t/\\]/g, '')
      .replace(/^[\.\s]+/, '').replace(/[\.\s]+$/, '');
  }

  function rowHTML(c1, c2) {
    return utils.format('<div class="row"><div class="col1">%s</div>' +
      '<div class="col2">%s</div></div>', c1, c2);
  }

  // Filter out delayed click events, so users can highlight and copy text
  function onClick(el, cb) {
    var time;
    el.on('mousedown', function() {
      time = +new Date();
    });
    el.on('mouseup', function(e) {
      if (+new Date() - time < 300) cb(e);
    });
  }
}
