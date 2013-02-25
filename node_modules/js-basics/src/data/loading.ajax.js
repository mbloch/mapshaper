/** @requires core, events */


function AjaxLoader(url, opts) {
  var loader = new FileLoader(opts);
  loader.load(url);
  return loader;
}

// Convenience function, pass loaded data to callback
//
AjaxLoader.load = function(url, callback, opts) {
  new AjaxLoader(url, opts).on('ready', function(evt) { callback(evt.target.data);});
};

/**
 * Load a file via http.
 * @constructor
 * @param (object) opts Optional parameters.
 */
function FileLoader(opts) {
  var _opts = {
    charset: 'x-user-defined',
    nocache: false,
    nocache_minutes: 2
  };

  Opts.copyAllParams(_opts, opts);

  trace(_opts)

  var _req = new XMLHttpRequest();
  var _success = false;
  var _url = '';

  this.data = '';

  var _self = this;
  _req.onreadystatechange = function() {
    if (_req.readyState == 4) {
      // Status 0 => running locally using file:///, e.g. unit testing.
      // Works in firefox & safari, not chrome
      //
      if (_req.status == 200 || _req.status === 0 && _req.responseText /* */) {
        _self.data = _req.responseText;
        _success = true;
      }
      else {
        _self.data = '';
      }
      //_self.dispatchEvent(C.DONE);
      _self.startWaiting();
    }
  };

  this.success = function() {
    return _success;
  };

  this.load = function(url) {
    var inBrowser = window.location.href.indexOf('http://') === 0;
    if (_opts.nocache && inBrowser) {
      url = Browser.cacheBustUrl(url, _opts.nocache_minutes);
    }

    _url = url;
    _success = false;
    _req.open('GET', url, true);
    if (_req.overrideMimeType) {
      var mime = 'text/plain;' + (_opts.charset ? ' charset=' + _opts.charset : '');
      _req.overrideMimeType(mime);  // prevents corruption of binary data in FireFox
      //_req.overrideMimeType('text/plain; charset=utf-16');  // prevents corruption of binary data in FireFox
    }
    try {
      _req.send(null);      
    }
    catch (e) {
      trace("[FileLoader.load()] Unable to load file:", url, "-- Error:", String(e));
    }

    return this;
  };
}

Opts.inherit(FileLoader, Waiter);
