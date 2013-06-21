/** @requires browser, events, tweening, hybrid-mouse, hybrid-mousewheel */


function MshpMouse(ext) {
  var p = ext.position(),
      mouse = new HybridMouse({touchClick: true}),
      _fx, _fy; // zoom foci, [0,1]

  var zoomTween = new NumberTween(function(scale, done) {
    ext.rescale(scale, _fx, _fy);
  });

  // TODO: find a way to reliably prevent text cursor on map pan
  // Browser.unselectable(p.element); // prevent text-select cursor when dragging
  // Browser.unselectable(El('body').node()); // prevent text-select cursor when dragging
  mouse.setMapContainer(p.element)
  calibrate();
  ext.on('resize', calibrate);

  function calibrate() {
    var o = ext.position();
    mouse.updateContainerBounds(o.pageX, o.pageY + o.height, o.pageX + o.width, o.pageY);
  }

  mouse.on('dblclick', function(e) {
    var from = ext.scale(),
        to = from * 3;
    _fx = e.mapX / ext.width();
    _fy = e.mapY / ext.height();
    zoomTween.start(from, to);
  });

  mouse.on('drag', function(e) {
    ext.pan(e.deltaX, e.deltaY);
  });

  var wheel = new MouseWheelHandler(mouse);
  wheel.on('mousewheel', function(e) {
    var k = 1 + (0.11 * e.multiplier),
        delta = e.direction > 0 ? k : 1 / k;
    ext.rescale(ext.scale() * delta, e.mapX / ext.width(), e.mapY / ext.height());
  });
}
