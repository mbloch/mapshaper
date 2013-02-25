/* @requires elements, browser, events */

function ZoomControl(map, opts) {
  var _opts = {
    ticSpacing: 5,
    size: 5,
    trackPadding: 5,
    showHomeButton: true
  };
  Opts.copyAllParams(_opts, opts);

  var trackHeight = _opts.ticSpacing * (_opts.size - 1) + _opts.trackPadding * 2;
  var trackTop;
  var ptrOffs;
  var trackPadding = _opts.trackPadding;
  var track;
  var pointer;
  var baseZoom;
  var dragging = false;
  var showTrack = !(Browser.ie && Browser.ieVersion < 9);

  this.__super__('div');
  this.addClass("nytg-zoom-control");
  map.on('ready', init, this);

  function init() {
    baseZoom = opts.minZoom || map.getCRS().baseZoom; // kludge
    var e = El(this.el);
    e.css('position:absolute; z-index:50; padding:2px;');
    e.css("background-color:white; padding:2px;");

    // trace(">> ZoomControl init() css:", this.el.style.cssText);
    
    if (_opts.showHomeButton) {
      var homeBtn = e.child('div').css('padding:3px 6px 7px 4px; margin:2px 0 9px 2px; width:13px; border-bottom:1px solid #ccc;').child('img').attr('src', "http://graphics8.nytimes.com/packages/images/newsgraphics/lib/maps/map2_home.png").css('cursor:pointer;padding-left:1px;').on('click', goHome);
    }


    var btnIn = e.child('div').css('margin:5px;').child('img').attr('src', "http://graphics8.nytimes.com/packages/images/newsgraphics/lib/maps/map2_zoomin.png").css('cursor:pointer;').on('click', zoomIn);
    if (showTrack) {
      //var trackCSS = 'margin:4px 0px 4px 8px; border:1px solid #bbb; width:4px; height:' + trackHeight + 'px; position:relative;';
      var trackCSS = 'margin:7px 0px 9px 11px; border-left:1px solid #ccc; border-top:1px solid #ccc; background-color:#ddd; width:3px; height:' + trackHeight + 'px; position:relative;'
      track = e.child('div').css(trackCSS);
    }
    var btnOut = e.child('div').css('margin:5px;').child('img').attr('src', "http://graphics8.nytimes.com/packages/images/newsgraphics/lib/maps/map2_zoomout.png").css('cursor:pointer;').on('click', zoomOut);

    //Browser.makeUnselectable(btnIn.el);
    if (showTrack) {
      track.on('click', handleTrackClick, this);
      /*
      // init tics   
      for (var i=0; i < _opts.size; i++) {
        if (i ==0) {
          var tic = track.child('div');
        }
        else {
          tic = tic.sibling('div');
        }
        var y = i * _opts.ticSpacing + _opts.trackPadding;
        tic.css('position:absolute; width:4px; border-top:1px solid #bbb; left:8px; top:' + y + 'px;');
      }
      */

      // init slider
      pointer = track.child('img').attr('src', 'http://graphics8.nytimes.com/packages/images/newsgraphics/lib/maps/map2_knob.png')
        .css('position:absolute; top:0px; margin-top:-9px; margin-left:-9px;')
        .on('mousedown', startDragging, this);

      updatePointer();
      map.on('zoom', updatePointer, this);
    }
    else {
      btnIn.css('margin-bottom:0px;');
    }
  }

  function convYToZoom(trackY) {
    var y = trackY - trackPadding;
    var ticId = Math.round(y / _opts.ticSpacing);
    var zoom = baseZoom + (_opts.size - ticId - 1);
    //trace("convYToZoom() tic:", ticId);
    if (zoom < baseZoom) {
      zoom = baseZoom;
    }
    if (zoom >= baseZoom + _opts.size) {
      zoom = baseZoom + _opts.size - 1;
    }
    return zoom;
  }

  function startDragging(evt) {
    if (dragging) {
      return;
    }
    dragging = true;
    var xy = Browser.getPageXY(track.el);
    trackTop = xy.y;
    //ptrOffs = evt.pageY - Browser.getPageXY(pointer.el).y;
    //trace("xy:", xy, 'ptrOffs', ptrOffs);
    Browser.addEventListener(window, 'mousemove', drag, this);
    Browser.addEventListener(window, 'mouseup', stopDragging, this);
    return false;
  }

  function drag(e) {
    var miny = trackPadding;
    var maxy = trackHeight - trackPadding;
    var y = e.pageY - trackTop;
    if (y < miny) {
      y = miny;
    }
    if (y > maxy) {
      y = maxy;
    }

    //trace(e.pageY, trackTop);
    pointer.el.style.top = y + "px";
    var z = convYToZoom(y);
    if (z != map.getZoom()) {
      map.setZoom(z);
    }

  }

  function stopDragging() {
    if (!dragging) {
      return;
    }
    dragging = false;
    Browser.removeEventListener(window, 'mousemove', drag, this);
    Browser.removeEventListener(window, 'mouseup', stopDragging, this);
    updatePointer();
  }

  function handleTrackClick(evt) {
    var y = evt.pageY - Browser.getPageXY(track.el).y;
    var z = convYToZoom(y);
    map.setZoom(z);

  }

  function updatePointer() {
    // trace("updatePointer; currZoom:", map.getZoom(), "base:", baseZoom);
    if (dragging) {
      return;
    }
    var currZoom = map.getZoom();

    var size = _opts.size;
    var ticId = size - (currZoom - baseZoom) -1;
    if (ticId < 0) {
      ticId = 0;
    }
    else if (ticId > _opts.size - 1) {
      ticId = _opts.size - 1;
    }
    var y = trackPadding + ticId * _opts.ticSpacing;
    pointer.css('top:' + y + 'px');
    //pointer.el.style.top = y + "px;";
  };

  function goHome() {
    map.zoomToInitialExtent();
    
  }

  function zoomIn() {
    map.zoomIn();
  }

  function zoomOut() {
    map.zoomOut();
  }
};

Opts.inherit(ZoomControl, Element);
