/* @require mapshaper-gui-lib */

function LayerControl(model) {
  var el = El("#layer-control").on('click', gui.handleDirectEvent(model.clearMode));
  var buttonLabel = El('#layer-control-btn .layer-name');
  var isOpen = false;

  new ModeButton('#layer-control-btn .mode-btn', 'layer_menu', model);
  model.addMode('layer_menu', turnOn, turnOff);
  model.on('update', function(e) {
    updateBtn();
    if (isOpen) render();
  });

  function turnOn() {
    isOpen = true;
    render();
    el.show();
  }

  function turnOff() {
    isOpen = false;
    el.hide();
  }

  function updateBtn() {
    var name = model.getEditingLayer().layer.name || "[unnamed layer]";
    buttonLabel.html(name + " &nbsp;&#9660;");
  }

  function render() {
    var list = El('#layer-control .layer-list');
    if (isOpen) {
      list.hide().empty();
      model.forEachLayer(function(lyr, dataset) {
        list.appendChild(renderLayer(lyr, dataset));
      });
      list.show();
    }
  }

  function describeLyr(lyr) {
    var n = MapShaper.getFeatureCount(lyr),
        str, type;
    if (lyr.data_type == 'table' || (lyr.data && !lyr.shapes)) {
      type = 'data record';
    } else if (lyr.geometry_type) {
      type = lyr.geometry_type + ' feature';
    }
    if (type) {
      str = utils.format('%,d %s%s', n, type, utils.pluralSuffix(n));
    } else {
      str = "[empty]";
    }
    return str;
  }

  function describeSrc(lyr, dataset) {
    var file = dataset.info.input_files[0] || '';
    if (utils.endsWith(file, '.shp') && !lyr.data && lyr == dataset.layers[0]) {
      file += " (missing .dbf)";
    }
    return file;
  }

  function getDisplayName(name) {
    return name || '[unnamed]';
  }

  function renderLayer(lyr, dataset) {
    var editLyr = model.getEditingLayer().layer;
    var entry = El('div').addClass('layer-item').classed('active', lyr == editLyr);
    var html = rowHTML('name', '<span class="layer-name colored-text dot-underline">' + getDisplayName(lyr.name) + '</span>');
    html += rowHTML('source file', describeSrc(lyr, dataset));
    html += rowHTML('contents', describeLyr(lyr));
    html += '<img src="images/close.png">';
    entry.html(html);
    // init delete button
    entry.findChild('img').on('mouseup', function(e) {
        e.stopPropagation();
        deleteLayer(lyr, dataset);
      });
    // init name editor
    new ClickText2(entry.findChild('.layer-name'))
      .on('change', function(e) {
        var str = cleanLayerName(this.value());
        this.value(getDisplayName(str));
        lyr.name = str;
        updateBtn();
      });
    // init click-to-select
    gui.onClick(entry, function() {
      if (!gui.getInputElement()) { // don't select if user is typing
        model.clearMode();
        if (lyr != editLyr) {
          model.updated({select: true}, lyr, dataset);
        }
      }
    });
    return entry;
  }

  function deleteLayer(lyr, dataset) {
    var otherLyr = model.findAnotherLayer(lyr);
    if (otherLyr) {
      turnOff(); // avoid rendering twice
      if (model.getEditingLayer().layer == lyr) {
        // switch to a different layer if deleted layer was selected
        model.selectLayer(otherLyr.layer, otherLyr.dataset);
      }
      model.deleteLayer(lyr, dataset);
      turnOn();
    } else {
      // refresh browser if deleted layer was the last layer
      window.location.href = window.location.href.toString();
    }
  }

  function cleanLayerName(raw) {
    return raw.replace(/[\n\t/\\]/g, '')
      .replace(/^[\.\s]+/, '').replace(/[\.\s]+$/, '');
  }

  function rowHTML(c1, c2) {
    return utils.format('<div class="row"><div class="col1">%s</div>' +
      '<div class="col2">%s</div></div>', c1, c2);
  }
}
