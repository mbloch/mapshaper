/** @requires events, core, browser */

function ScriptLoader(url, charset, opts) {

  if (opts && !opts.no_bust) {
    var minutes = opts && opts.cache_timeout || 1;
    url = Browser.cacheBustUrl(url, minutes);    
  }

  var script = document.createElement('script');
  script.type = 'text/javascript';
  charset = charset || 'utf-8';
  var supportedCharsets = "utf-8, utf-16be, utf-16le, utf16";
  if (!Utils.contains(supportedCharsets.split(', '), charset)) {
    trace("[ScriptLoader] Warning: unknown charset:", charset, "expecting:", supportedCharsets);
  }
  script.charset = charset;
  var self = this;

  var ieMode = !!script.readyState;
  if (ieMode) {
    var targetReadyState = "loaded|complete";
    script.onreadystatechange = function() {
      // targetReadyState may be modified below, depending on whether script is cached.
      //trace("[onreadystatechange] state:", script.readyState, "url:", url);
      if (targetReadyState.indexOf(script.readyState) != -1) {
        self.startWaiting();
        script.onreadystatechange = null;
      }
    };
  }
  else {
    script.onload = function() {
      self.startWaiting();
    };
  }

  Browser.appendToHead(script);

  var initialReadyState = script.readyState; // ie
  script.src = url;

  if (ieMode && script.readyState == initialReadyState) {
    // script is not cached -- readyState becomes 'complete' before script is run.
    targetReadyState = 'loaded';
  }

  /*
    Legend: "pre-src readyState" > "post-src readyState" > *script runs* > [onreadystatechange readyState]
    ie9:
      uncached      "loading" > "loading" > [loading] > *ready* > [loaded]
      hard refresh  "loading" > "loaded" > *ready* > [complete]
      soft refresh  "loading" > *ready* > "loaded" > [loaded]

    ie8:
      uncached       "complete" > "complete" > [complete] > *ready* > [loaded]
      hard refresh   "complete" > "loaded" > *ready* > [complete]
      soft refresh   "complete" > *ready* > "loaded" > [complete]

      *sometimes*    "complete" > "loaded" > [loaded]  (script never runs)

    ie8 "compatibility mode"
      uncached       "complete" > "complete" > [complete] > *ready* > [loaded]
      soft refresh   "complete" > *ready* > "loaded" > [loaded]      
      hard refresh   "complete" > *ready* > "loaded" > [loaded]      
  */

  this.unload = function() {
    // trace("[ScriptLoader.unload()] url:", url);
    Browser.removeElement(script);
  };
}

Opts.inherit(ScriptLoader, Waiter);
