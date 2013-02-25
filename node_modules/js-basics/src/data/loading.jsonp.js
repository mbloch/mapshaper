/** @requires loading.script, browser */

function JsonPLoader(url, callbackName, charset, opts) {
  var self = this;
  var loaderIndex = Opts.getNamespace("nytg.map.loaderIndex");
  var scriptLoader;
  var loadPriority = JsonPLoader._loadCount || 0;
  JsonPLoader._loadCount = loadPriority + 1;

  var callback = function(obj) {
    self.data = obj;
    self.startWaiting();
  };

  this.on('ready', function() {
    delete loaderIndex[callbackName];
  }, this, loadPriority);

  // this.addEventListener('ready', function() {trace("[JsonPLoader] READY");});

  var priorLoader = loaderIndex[callbackName];
  if (priorLoader) {
    // if a load is underway, use that data
    priorLoader.addEventListener('ready', function(evt) { callback(priorLoader.data); });
  }
  else {
    loaderIndex[callbackName] = this;
    Opts.exportObject(callbackName, callback);
    if (callbackName) {
      url = Browser.extendUrl(url, "callback=" + callbackName); // add callback parameter to url
    }
    
    scriptLoader = new ScriptLoader(url, charset || 'utf-8', opts);
    trace("[JsonPLoader] loading url:", url);
    scriptLoader.on('ready', function() {
      trace("Script Loader is READY"); 
      //trace(scriptLoader.script.src);
    });
    // Remove callback script from page and loader from index when loaded.

    // scriptLoader.addEventListener('ready', function() { scriptLoader.unload(); delete loaderIndex[callbackName] });
    this.waitFor(scriptLoader); // don't need to wait for script loader; ready as soon as loaded js runs
  }
}

Opts.inherit(JsonPLoader, Waiter);

JsonPLoader.load = function(url, callbackName, callback, opts) {
  var loader = new JsonPLoader(url, callbackName).on('ready', function(evt) {
    callback(loader.data);
  });
};