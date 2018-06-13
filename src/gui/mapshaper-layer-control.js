/* @require mapshaper-gui-lib */

function LayerControl(model, map) {
  var el = El("#layer-control").on('click', gui.handleDirectEvent(gui.clearMode));
  var buttonLabel = El('#layer-control-btn .layer-name');
  var isOpen = false;
  var renderCache = {};
  var idCount = 0; // layer counter for creating unique layer ids

  new ModeButton('#layer-control-btn .header-btn', 'layer_menu');
  gui.addMode('layer_menu', turnOn, turnOff);
  model.on('update', function(e) {
    updateMenuBtn();
    if (isOpen) render();
  });

  function findLayerById(id) {
    return model.findLayer(function(lyr, dataset) {
      return lyr.menu_id == id;
    });
  }

  function layerIsPinned(lyr) {
    return lyr == map.getReferenceLayer();
  }

  function layerIsSelected(lyr) {
    return lyr == model.getActiveLayer().layer;
  }

  function turnOn() {
    isOpen = true;
    El('#layer-control div.info-box-scrolled').css('max-height', El('body').height() - 80);
    render();
    el.show();
  }

  function turnOff() {
    isOpen = false;
    el.hide();
  }

  function updateMenuBtn() {
    var name = model.getActiveLayer().layer.name || "[unnamed layer]";
    buttonLabel.html(name + " &nbsp;&#9660;");
  }

  function render() {
    var list = El('#layer-control .layer-list');
    var uniqIds = {};
    var pinnableCount = 0;
    var oldCache = renderCache;
    renderCache = {};
    list.empty();
    model.forEachLayer(function(lyr, dataset) {
      if (isPinnable(lyr)) pinnableCount++;
    });

    model.forEachLayer(function(lyr, dataset) {
      var pinnable = pinnableCount > 1 && isPinnable(lyr);
      var html, element;
      // Assign a unique id to each layer, so html strings
      // can be used as unique identifiers for caching rendered HTML, and as
      // an id for layer menu event handlers
      if (!lyr.menu_id || uniqIds[lyr.menu_id]) {
        lyr.menu_id = ++idCount;
      }
      uniqIds[lyr.menu_id] = true;
      html = renderLayer(lyr, dataset, pinnable);
      if (html in oldCache) {
        element = oldCache[html];
      } else {
        element = El('div').html(html).firstChild();
        initMouseEvents(element, lyr.menu_id, pinnable);
      }
      renderCache[html] = element;
      list.appendChild(element);
    });
  }

  function renderLayer(lyr, dataset, pinnable) {
    var warnings = getWarnings(lyr, dataset);
    var classes = 'layer-item';
    var entry, html;

    if (layerIsSelected(lyr)) classes += ' active';
    if (map.isReferenceLayer(lyr)) classes += ' pinned';

    html = '<!-- ' + lyr.menu_id + '--><div class="' + classes + '">';
    html += rowHTML('name', '<span class="layer-name colored-text dot-underline">' + getDisplayName(lyr.name) + '</span>', 'row1');
    html += rowHTML('source file', describeSrc(lyr, dataset) || 'n/a');
    html += rowHTML('contents', describeLyr(lyr));
    if (warnings) {
      html += rowHTML('problems', warnings, 'layer-problems');
    }
    html += '<img class="close-btn" src="images/close.png">';
    if (pinnable) {
      html += '<img class="pin-btn unpinned" src="images/eye.png">';
      html += '<img class="pin-btn pinned" src="images/eye2.png">';
    }
    html += '</div>';
    return html;
  }

  function initMouseEvents(entry, id, pinnable) {
    entry.on('mouseover', init);
    function init() {
      entry.removeEventListener('mouseover', init);
      initMouseEvents2(entry, id, pinnable);
    }
  }

  function initMouseEvents2(entry, id, pinnable) {
    // init delete button
    entry.findChild('img.close-btn').on('mouseup', function(e) {
      var target = findLayerById(id);
      e.stopPropagation();
      if (map.isReferenceLayer(target.layer)) {
        // TODO: check for double map refresh after model.deleteLayer() below
        map.removeReferenceLayer(target.layer);
      }
      model.deleteLayer(target.layer, target.dataset);
    });

    if (pinnable) {
      // init pin button
      entry.findChild('img.pinned').on('mouseup', function(e) {
        var target = findLayerById(id);
        e.stopPropagation();
        if (map.isReferenceLayer(target.layer)) {
          map.removeReferenceLayer(target.layer);
          entry.removeClass('pinned');
        } else {
          map.addReferenceLayer(target.layer, target.dataset);
          entry.addClass('pinned');
        }
      });
    }

    // init name editor
    new ClickText2(entry.findChild('.layer-name'))
      .on('change', function(e) {
        var target = findLayerById(id);
        var str = cleanLayerName(this.value());
        this.value(getDisplayName(str));
        target.layer.name = str;
        updateMenuBtn();
      });

    // init click-to-select
    gui.onClick(entry, function() {
      var target = findLayerById(id);
      if (!gui.getInputElement()) { // don't select if user is typing
        gui.clearMode();
        if (!layerIsSelected(target.layer)) {
          model.updated({select: true}, target.layer, target.dataset);
        }
      }
    });
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

  function getWarnings(lyr, dataset) {
    var file = getSourceFile(lyr, dataset);
    var missing = [];
    var msg;
    if (utils.endsWith(file, '.shp') && lyr == dataset.layers[0]) {
      if (!lyr.data) {
        missing.push('.dbf');
      }
      if (!dataset.info.prj && !dataset.info.crs) {
        missing.push('.prj');
      }
    }
    if (missing.length) {
      msg = 'missing ' + missing.join(' and ') + ' data';
    }
    return msg;
  }

  function getSourceFile(lyr, dataset) {
    var inputs = dataset.info.input_files;
    return inputs && inputs[0] || '';
  }

  function describeSrc(lyr, dataset) {
    return getSourceFile(lyr, dataset);
  }

  function getDisplayName(name) {
    return name || '[unnamed]';
  }

  function isPinnable(lyr) {
    return internal.layerHasGeometry(lyr);
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
