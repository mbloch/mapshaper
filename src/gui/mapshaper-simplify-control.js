/* @requires mapshaper-elements, mapshaper-mode-button, mapshaper-slider */

var SimplifyControl = function(model) {
  var control = new EventDispatcher();
  var _value = 1;
  var el = El('#simplify-control-wrapper');
  var planarCheckbox = El('#planar-opt');
  var menu = El('#simplify-options');
  var slider, text;

  new SimpleButton('#simplify-options .submit-btn').on('click', onSubmit);
  new SimpleButton('#simplify-options .cancel-btn').on('click', model.clearMode);
  new ModeButton('#simplify-btn', 'simplify', model);
  model.addMode('simplify', turnOn, turnOff);
  model.on('select', function() {
    if (model.getMode() == 'simplify') model.clearMode();
  });

  // exit simplify mode when user clicks off the visible part of the menu
  menu.on('click', gui.handleDirectEvent(model.clearMode));

  slider = new Slider("#simplify-control .slider");
  slider.handle("#simplify-control .handle");
  slider.track("#simplify-control .track");
  slider.on('change', function(e) {
    var pct = fromSliderPct(e.pct);
    text.value(pct);
    onchange(pct);
  });
  slider.on('start', function(e) {
    control.dispatchEvent('simplify-start');
  }).on('end', function(e) {
    control.dispatchEvent('simplify-end');
  });

  text = new ClickText("#simplify-control .clicktext");
  text.bounds(0, 1);
  text.formatter(function(val) {
    if (isNaN(val)) return '-';
    var pct = val * 100;
    var decimals = 0;
    if (pct <= 0) decimals = 1;
    else if (pct < 0.001) decimals = 4;
    else if (pct < 0.01) decimals = 3;
    else if (pct < 1) decimals = 2;
    else if (pct < 100) decimals = 1;
    return utils.formatNumber(pct, decimals) + "%";
  });

  text.parser(function(s) {
    return parseFloat(s) / 100;
  });

  text.value(0);
  text.on('change', function(e) {
    var pct = e.value;
    slider.pct(toSliderPct(pct));
    control.dispatchEvent('simplify-start');
    onchange(pct);
    control.dispatchEvent('simplify-end');
  });

  function turnOn() {
    var target = model.getEditingLayer();
    if (!MapShaper.layerHasPaths(target.layer) || target.layer.data_type == 'table') {
      gui.alert("This layer can not be simplified");
      return;
    }
    if (target.dataset.arcs.getVertexData().zz) {
      // TODO: try to avoid calculating pct (slow);
      showSlider(); // need to show slider before setting; TODO: fix
      control.value(target.dataset.arcs.getRetainedPct());
    } else {
      showMenu(!target.dataset.arcs.isPlanar());
    }
  }

  function showMenu(spherical) {
    El('#planar-opt-wrapper').node().style.display = spherical ? 'block' : 'none';
    planarCheckbox.node().checked = false;
    menu.show();
  }

  function turnOff() {
    menu.hide();
    control.reset();
  }

  function onSubmit() {
    var dataset = model.getEditingLayer().dataset;
    var showMsg = dataset.arcs && dataset.arcs.getPointCount() > 1e6;
    var delay = 0;
    if (showMsg) {
      delay = 35;
      gui.showProgressMessage('Calculating');
    }
    menu.hide();
    setTimeout(function() {
      var opts = getSimplifyOptions();
      MapShaper.simplifyPaths(dataset.arcs, opts);
      dataset.arcs.setRetainedPct(1);
      if (opts.keep_shapes) {
        MapShaper.keepEveryPolygon(dataset.arcs, dataset.layers);
      }
      control.reset();
      // TODO: also add simplify flag after method switching is supported
      model.updated({presimplify: true});
      showSlider();
      gui.clearProgressMessage();
    }, delay);
  }

  function showSlider() {
    el.show();
    El('body').addClass('simplify'); // for resizing, hiding layer label, etc.
  }

  function getSimplifyOptions() {
    var method = El('#simplify-options input[name=method]:checked').attr('value') || null;
    return {
      method: method,
      keep_shapes: !!El("#import-retain-opt").node().checked,
      cartesian: !!planarCheckbox.node().checked
    };
  }

  function toSliderPct(p) {
    p = Math.sqrt(p);
    var pct = 1 - p;
    return pct;
  }

  function fromSliderPct(p) {
    var pct = 1 - p;
    return pct * pct;
  }

  function onchange(val) {
    if (_value != val) {
      _value = val;
      control.dispatchEvent('change', {value:val});
    }
  }

  control.reset = function() {
    control.value(1);
    el.hide();
    menu.hide();
    El('body').removeClass('simplify');
  };

  control.value = function(val) {
    if (!isNaN(val)) {
      // TODO: validate
      _value = val;
      slider.pct(toSliderPct(val));
      text.value(val);
    }
    return _value;
  };

  control.value(_value);
  return control;
};
