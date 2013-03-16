/* @requires map-core, tweening, core, events, browser */


/**
  This script gets included with the map/chart to be captured
*/



var Phantom = new Waiter();

Phantom.__imageIdx = 0;
Phantom.__optionArray = [];
Phantom.__map = null;
Phantom.__callback = null;

Phantom.__mapArray = null;

Phantom.__getImageProperties = function() { return null };

Opts.exportObject("nytg.Phantom", Phantom);
Opts.exportObject("nytg.trace", trace);




/**
 * @map map object
 * 
 *
 */
Phantom.captureMapViews = function(map, optArr, mapFunc) {
  if (Phantom.isReady()) {
    trace("[Phantom.addMapViews()] Phantom is already READY.");
    return;  
  }
  if (this.__map) {
    trace("[Phantom.addMapViews()] Map can only be added once; it is already set.");
    return;
  }

  if (!Utils.isArray(optArr)) {
    trace("[Phantom.captureMapViews()] Missing array of options.");
    return;
  }

  if (mapFunc && !Utils.isFunction(mapFunc)) {
    trace("[Phantom.captureMapViews()] Third argument is not a function; found:", mapFunc);
    return;
  }

  this.__map = map;
  this.__optionArray = optArr;
  this.__callback = mapFunc;
  //this.__imageIdx = 0;
  map.on('ready', Phantom.startWaiting, Phantom);
}

Phantom.publishMap = function(map, opts) {
  // TODO: check to see if publishing has already completed for this page...
  var obj = {
    opts: opts,
    map: map
  }

  if (!this.__mapArray) {
    this.__mapArray = [];
  }

  this.__mapArray.push(obj);

  Phantom.waitFor(map);
  Phantom.startWaiting();
};


Phantom.captureMap = function(map, opts) {
  var callback = function() {
    return {
      name: "noname_map"
    };
  };
  this.captureMapViews(map, [opts], callback);
};


Phantom.__getMapDimensions = function(map) {
  var w = map.getWidthInPixels();
  var h = map.getHeightInPixels();
  var xy = Browser.getPageXY(map.getContainer());
  // return {width:w, height:h, x:xy.x + 1, y:xy.y + 1};
  return {width:w, height:h, x:xy.x, y:xy.y};
};


/**
 * TODO: Make sure this doesn't cancel a timer that is underway.
 */
Phantom.done = function() {
  this.__hasNext = false;
}

Phantom.getNextMapImage = function() {
  var maps = this.__mapArray;
  var idx = this.__imageIdx || 0;
  if (!maps || maps.length <= idx) {
    return null;
  } 

  var obj = maps[idx];
  var mapRect = this.__getMapDimensions(obj.map);

  var opts = {};
  Opts.copyNewParams(opts, obj.opts);
  Opts.copyNewParams(opts, mapRect);
  this.__imageIdx += 1;
  return opts;
};

Phantom.getNextImage = function(phantomOpts) {

  if (this.__mapArray) {
    return Phantom.getNextMapImage();
  }
  var argArr = this.__optionArray;
  var idx = this.__imageIdx || 0;
  if (!argArr || argArr.length <= idx) {
    return null;
  }
  
  var callbackArgs = argArr[idx];
  var genOpts = this.__callback ? this.__callback(callbackArgs) : {};
  var mapRect = this.__getMapDimensions(this.__map);

  if (!genOpts) {
    trace("[Phantom.getNextImage()] Callback returned no data; stopping.");
    return null;
  }

  var opts = {};
  Opts.copyNewParams(opts, callbackArgs); // TODO: improve
  Opts.copyNewParams(opts, phantomOpts);  // merge in options from phantomjs script
  Opts.copyNewParams(opts, genOpts);      // merge in options from callback function...
  Opts.copyNewParams(opts, mapRect);      // merge in map dimensions

  if (!opts.name) {
    opts.name = Utils.getUniqueName();
    trace("[Phantom.getNextImage()] Callback data is missing a 'name' parameter; using:", opts.name);
  }

  this.__imageIdx += 1;

  return opts;
};
