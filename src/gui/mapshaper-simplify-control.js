/* @requires mapshaper-elements, mapshaper-mode-button, mapshaper-slider, mapshaper-simplify-pct */

/*
How changes in the simplify control should affect other components

data calculated, 100% simplification
 -> [map] filtered arcs update

data calculated, <100% simplification
 -> [map] filtered arcs update, redraw; [repair] intersection update

change via text field
 -> [map] redraw; [repair] intersection update

slider drag start
 -> [repair] hide display

slider drag
 -> [map] redraw

slider drag end
 -> [repair] intersection update

*/

var SimplifyControl = function(model) {
  var control = {};
  var _value = 1;
  var el = El('#simplify-control-wrapper');
  var menu = El('#simplify-options');
  var slider, text, fromPct;

  new SimpleButton('#simplify-options .submit-btn').on('click', onSubmit);
  new SimpleButton('#simplify-options .cancel-btn').on('click', function() {
    if (el.visible()) {
      // cancel just hides menu if slider is visible
      menu.hide();
    } else {
      gui.clearMode();
    }
  });
  new SimpleButton('#simplify-settings-btn').on('click', function() {
    if (menu.visible()) {
      menu.hide();
    } else {
      initMenu();
    }
  });

  new ModeButton('#simplify-btn', 'simplify');
  gui.addMode('simplify', turnOn, turnOff);
  model.on('select', function() {
    if (gui.getMode() == 'simplify') gui.clearMode();
  });

  // exit simplify mode when user clicks off the visible part of the menu
  menu.on('click', gui.handleDirectEvent(gui.clearMode));

  slider = new Slider("#simplify-control .slider");
  slider.handle("#simplify-control .handle");
  slider.track("#simplify-control .track");
  slider.on('change', function(e) {
    var pct = fromSliderPct(e.pct);
    text.value(pct);
    pct = utils.parsePercent(text.text()); // use rounded value (for consistency w/ cli)
    onChange(pct);
  });
  slider.on('start', function(e) {
    gui.dispatchEvent('simplify_drag_start'); // trigger intersection control to hide
  }).on('end', function(e) {
    gui.dispatchEvent('simplify_drag_end'); // trigger intersection control to redraw
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
    onChange(pct);
    gui.dispatchEvent('simplify_drag_end'); // (kludge) trigger intersection control to redraw
  });

  function turnOn() {
    var target = model.getActiveLayer();
    var arcs = target.dataset.arcs;
    if (!internal.layerHasPaths(target.layer)) {
      gui.alert("This layer can not be simplified");
      return;
    }
    if (arcs.getVertexData().zz) {
      // TODO: try to avoid calculating pct (slow);
      showSlider(); // need to show slider before setting; TODO: fix
      fromPct = internal.getThresholdFunction(arcs, false);
      control.value(arcs.getRetainedPct());

    } else {
      initMenu();
    }
  }

  function initMenu() {
    var dataset = model.getActiveLayer().dataset;
    var showPlanarOpt = !dataset.arcs.isPlanar();
    var opts = internal.getStandardSimplifyOpts(dataset, dataset.info && dataset.info.simplify);
    El('#planar-opt-wrapper').node().style.display = showPlanarOpt ? 'block' : 'none';
    El('#planar-opt').node().checked = !opts.spherical;
    El("#import-retain-opt").node().checked = opts.keep_shapes;
    El("#simplify-options input[value=" + opts.method + "]").node().checked = true;
    menu.show();
  }

  function turnOff() {
    menu.hide();
    control.reset();
  }

  function onSubmit() {
    var dataset = model.getActiveLayer().dataset;
    var showMsg = dataset.arcs && dataset.arcs.getPointCount() > 1e6;
    var delay = 0;
    if (showMsg) {
      delay = 35;
      gui.showProgressMessage('Calculating');
    }
    menu.hide();
    setTimeout(function() {
      var opts = getSimplifyOptions();
      mapshaper.simplify(dataset, opts);
      model.updated({
        // trigger filtered arc rebuild without redraw if pct is 1
        simplify_method: opts.percentage == 1,
        simplify: opts.percentage < 1
      });
      showSlider();
      fromPct = internal.getThresholdFunction(dataset.arcs, false);
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
      percentage: _value,
      no_repair: true,
      keep_shapes: !!El("#import-retain-opt").node().checked,
      planar: !!El('#planar-opt').node().checked
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

  function onChange(pct) {
    if (_value != pct) {
      _value = pct;
      model.getActiveLayer().dataset.arcs.setRetainedInterval(fromPct(pct));
      model.updated({'simplify_amount': true});
      updateSliderDisplay();
    }
  }

  function updateSliderDisplay() {
    // TODO: display resolution and vertex count
    // var dataset = model.getActiveLayer().dataset;
    // var interval = dataset.arcs.getRetainedInterval();
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
