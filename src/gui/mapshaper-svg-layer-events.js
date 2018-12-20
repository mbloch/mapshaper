

function SvgLayerEvents(svg, mouse) {
  var svgEl = El(svg);
  var dragging = false;
  var activeRecord;
  var activeId = -1;
  var activeLayer;

  // var mouse = new MouseArea(svg, new ElementPosition(svg));

  initEventHandling();

  return {
    setLayer: function(target, type) {
      activeLayer = target.layer;
    },
    clear: function() {
      stop();
      activeLayer = null;
    }
  };

  function initEventHandling() {
    onEvent('click', fireEvent);

  }

  function fireEvent(evt) {
    console.log("SVG fireEvent() :", evt);
  }

  function onEvent(name, cb) {
    var eventPriority = 1;
    mouse.on(name, function(evt) {
      // TODO: filter non-SVG events
      // TODO: identify feature
      // TODO: identify symbol part
      cb(evt);
    }, null, eventPriority);

  }

  // TODO: cancel dragging, etc.
  function stop() {

  }



}