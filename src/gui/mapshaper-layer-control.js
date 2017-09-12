/* @require mapshaper-gui-lib */

function LayerControl(model, map) {
  var el = El("#layer-control").on('click', gui.handleDirectEvent(gui.clearMode));
  var buttonLabel = El('#layer-control-btn .layer-name');
  var isOpen = false;

  new ModeButton('#layer-control-btn .header-btn', 'layer_menu');
  gui.addMode('layer_menu', turnOn, turnOff);
  model.on('update', function(e) {
    updateBtn();
    if (isOpen) render();
  });

  function turnOn() {
    isOpen = true;
    // set max layer menu height
    render();
    El('#layer-control div.info-box-scrolled').css('max-height', El('body').height() - 80);
    el.show();
  }

  function turnOff() {
    isOpen = false;
    el.hide();
  }

  function updateBtn() {
    var name = model.getActiveLayer().layer.name || "[unnamed layer]";
    buttonLabel.html(name + " &nbsp;&#9660;");
  }

  function render() {
    var list = El('#layer-control .layer-list');
    var pinnable = 0;
    if (isOpen) {
      list.hide().empty();
      model.forEachLayer(function(lyr, dataset) {
        if (isPinnable(lyr)) pinnable++;
      });
      if (pinnable === 0 && map.getReferenceLayer()) {
        clearPin(); // a layer has been deleted...
      }
      model.forEachLayer(function(lyr, dataset) {
        list.appendChild(renderLayer(lyr, dataset, pinnable > 1 && isPinnable(lyr)));
      });
      list.show();
    }
  }

  function describeLyr(lyr) {
    var n = internal.getFeatureCount(lyr),
        str, type;
    if (lyr.data && !lyr.shapes) {
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
    var inputs = dataset.info.input_files;
    var file = inputs && inputs[0] || '';
    if (utils.endsWith(file, '.shp') && !lyr.data && lyr == dataset.layers[0]) {
      file += " (missing .dbf)";
    }
    return file;
  }

  function getDisplayName(name) {
    return name || '[unnamed]';
  }

  function setPin(lyr, dataset) {
    if (map.getReferenceLayer() != lyr) {
      clearPin();
      map.setReferenceLayer(lyr, dataset);
      el.addClass('visible-pin');
    }
  }

  function clearPin() {
    if (map.getReferenceLayer()) {
      Elements('.layer-item.pinned').forEach(function(el) {
        el.removeClass('pinned');
      });
      el.removeClass('visible-pin');
      map.setReferenceLayer(null);
    }
  }

  function isPinnable(lyr) {
    return internal.layerHasGeometry(lyr);
  }

  function renderLayer(lyr, dataset, pinnable) {
    var editLyr = model.getActiveLayer().layer;
    var entry = El('div').addClass('layer-item').classed('active', lyr == editLyr);
    var html = rowHTML('name', '<span class="layer-name colored-text dot-underline">' + getDisplayName(lyr.name) + '</span>', 'row1');
    html += rowHTML('source file', describeSrc(lyr, dataset) || 'n/a');
    html += rowHTML('contents', describeLyr(lyr));
    html += '<img class="close-btn" src="images/close.png">';
    if (pinnable) {
      html += '<img class="pin-btn unpinned" src="images/eye.png">';
      html += '<img class="pin-btn pinned" src="images/eye2.png">';
    }
    entry.html(html);

    // init delete button
    entry.findChild('img.close-btn').on('mouseup', function(e) {
      e.stopPropagation();
      if (lyr == map.getReferenceLayer()) {
        clearPin();
      }
      model.deleteLayer(lyr, dataset);
    });

    if (pinnable) {
      if (map.getReferenceLayer() == lyr) {
        entry.addClass('pinned');
      }

      // init pin button
      entry.findChild('img.pinned').on('mouseup', function(e) {
        e.stopPropagation();
        if (lyr == map.getReferenceLayer()) {
          clearPin();
        } else {
          setPin(lyr, dataset);
          entry.addClass('pinned');
        }
      });
    }

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
        gui.clearMode();
        if (lyr != editLyr) {
          model.updated({select: true}, lyr, dataset);
        }
      }
    });
    return entry;
  }

  function cleanLayerName(raw) {
    return raw.replace(/[\n\t/\\]/g, '')
      .replace(/^[\.\s]+/, '').replace(/[\.\s]+$/, '');
  }

  function rowHTML(c1, c2, cname) {
    return utils.format('<div class="row%s"><div class="col1">%s</div>' +
      '<div class="col2">%s</div></div>', cname ? ' ' + cname : '', c1, c2);
  }
}
