/* @require mapshaper-gui-lib */

function LayerControl(model) {
  var el = El("#layer-control").on('click', gui.handleDirectEvent(model.clearMode));
  var label = El('#layer-control-btn .layer-name');
  var btn = new ModeButton('#layer-control-btn .mode-btn', 'layer_menu', model);
  model.addMode('layer_menu', turnOn, turnOff);

  model.on('select', function(e) {
    updateBtn();
    render();
  });

  function turnOn() {
    render();
    el.show();
  }

  function turnOff() {
    el.hide();
  }

  function updateBtn() {
    var name = model.getEditingLayer().layer.name || "[unnamed layer]";
    label.html(name + " &nbsp;&#9660;");
  }

  function render() {
    var list = El('#layer-control .layer-list').empty();
    model.forEachLayer(function(lyr, dataset) {
      list.appendChild(renderLayer(lyr, dataset));
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

  function describeSrc(lyr, dataset) {
    var file = dataset.info.input_files[0] || '';
    if (utils.endsWith(file, '.shp') && !lyr.data && lyr == dataset.layers[0]) {
      file += " (missing .dbf)";
    }
    return file;
  }

  function renderLayer(lyr, dataset) {
    var unnamed = '[unnamed]';
    var entry = El('div').addClass('layer-item');
    var editLyr = model.getEditingLayer().layer;
    var html = rowHTML('name', '<span class="layer-name colored-text dot-underline">' + (lyr.name || unnamed) + '</span>');
    var nameEl;
    html += rowHTML('source file', describeSrc(lyr, dataset));
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
    // delete button
    El('<img>').attr('src', 'images/close.png').appendTo(entry)
    .on('mouseup', function(e) {
      var otherLyr = model.findAnotherLayer(lyr);
      if (!otherLyr) {
        window.location.href = window.location.href.toString(); // refresh browser
      } else {
        model.selectLayer(otherLyr.layer, otherLyr.dataset);
        model.deleteLayer(lyr, dataset);
        render();
      }
      e.stopPropagation();
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
