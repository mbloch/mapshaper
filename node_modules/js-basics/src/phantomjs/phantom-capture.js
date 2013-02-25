/**
 *  This script gets passed to the phantom executable...
 */

/* @requires browser, phantom-core */


var PhantomLib = {
  timeout: 30000,
  queue: [],
  queueId: 0,
  loadCount: 0
};

PhantomLib.loadBase = Math.round(Math.random() * 1000);

/**
 *  @param url Url of a json source
 *  @param callback Function to call when json is loaded
 */
PhantomLib.loadJson = function(url, callback) {
  var page = require('webpage').create();

  // cache-bust url
  var bustStr = "k=" + (this.loadBase + this.loadCount++);
  url = Browser.extendUrl(url, bustStr);
  //trace("&&& loadJson() url:", url);

  page.open(url, function(status) {

    if (status == 'success') {
      //console.log("success!");
      //var json = page.content;  // json wrapped in <html><body><pre> </pre></body></html>

      var str = page.evaluate(function() {
        var str = document.body.innerText; // seems to work for getting json
        return str;
      });

      // TODO: handle invalid JSON
      //var obj = JSON.parse(str);
      //console.log(typeof obj);
      //console.log(Object.keys(obj));

      callback(str);
    }
    else {
      console.log("[PhantomLib.loadJson()] url could not be loaded: " + url);
      callback(null);
    }

    page.close();
  });

}

function PhantomCapture(url, opts) {
  opts = opts || {};
  var outputDir = opts.outputDir || "out/";
  var fileType = (opts.type || "png");
  if ("gif,png,jpg".indexOf(fileType) == -1) {
    trace("[PhantomCapture()] invalid file type:", fileType, "Expected gif, png or jpg; defaulting to png");
    fileType = "png";
  }

  var _self = this;
  var page = null;
  var startTime; 
  _self.trace = trace;
  var intervalId;
  var pageReady = false;


  this.capture = function() {
    if (page) {
      return;
    }

    startTime = +new Date;
    page = require('webpage').create();
    page.settings.localToRemoteUrlAccessEnabled = true; // must be set before page.open()
    page.viewportSize = { width: 1200, height: 1000}; // TODO: remove. KLUDGE: make sure elements don't wrap or contents don't overflow 

    /**
     *  TODO: handle stack trace properly
     */
    page.onError = function(msg, stack) {
      console.log("[error] " + msg);
      if (Utils.isArray(stack)) {
        trace("[error] ** STACK TRACE **");
        for(var i=0; i<stack.length; i++) {
          var obj = stack[i];
          var file = obj.file;
          var idx = file ? file.lastIndexOf('/') : -1;
          if (idx > -1) {
            file = file.substr(idx + 1);
          }
          trace("  ", file, "line:", obj.line, "function:", obj['function'] || "[anonymous]");
          //trace("       ", obj);         
        }
      }
      else if (stack) {
        trace("   ", stack);
      }
      // trace(stack);
      Phantom.exit(1);
      //done(1);
    };


    page.onConsoleMessage = function(msg, lineNo, sourceId) {
      //trace("[page]", msg);
      console.log("[page] " + msg);
    };

    page.open(url, function(status) {
      if (status == 'success') {

        // inject script file, if present
        if (opts.scriptFiles) {
          for (var i=0; i<opts.scriptFiles.length; i++) {
            var fname = opts.scriptFiles[i];
            var ok =  page.injectJs(fname);
            if (!ok) {
              console.log("[PhantomCapture.capture()] failed to inject js file: " + fname);
              // TODO; bail? done?
            }
          }
        }

        // call init function, if present
        if (opts.initFunction) {
          page.evaluate(opts.initFunction, opts.initObject); // pass optional initObject
        }

        startMonitoring();
      }
      else {
        console.log("Failed to load url: " + url + " -- status: " + status);
        done(1);
      }
    });    
  }


  function pageIsReady() {
    var ok = page.evaluate(function() {
      var ready = window.nytg && nytg.Phantom && nytg.Phantom.isReady();
      return ready;
    });
    
    // console.log("[pageIsReady()]: " + ok);
    return ok || false;
  }


  /**
   *  Check to see if graphic is ready to capture
   *
   */
  function checkPageReady() {
    var elapsed = (+new Date) - startTime;
    if (elapsed > PhantomLib.timeout) {
      console.log("[PhantomCapture.checkPageReady()] Timeout error; map url:", url);
      done(1);
      return;
    }

    if (pageIsReady()) {
      window.clearInterval(intervalId);
      captureImage();
    }
  }


  function getNextImage() {
    var data = page.evaluate(function(opts) {
      if (window.nytg && nytg.Phantom) {
        return nytg.Phantom.getNextImage(opts);
      }
    }, opts);
    return data || null;
  }


  /**
   * capture an image from the page (assumes page is ready)
   */
  function captureImage() {

    /* 
    {
      name: "name_of_file",
      done: [true|false],
      delay: [ms],
      width: px,
      height: px,
      top: px,
      left: px
    }
    */
    var nextData = getNextImage();

    if (nextData) {
      //window.clearInterval(intervalId);
      // console.log("RENDERING");

      var fileName = (nextData.name || "unnamed_map");
      var fileSuffix = "." + fileType;
      if (fileName.indexOf(fileSuffix) == -1) {
        fileName += fileSuffix;
      }
      var filePath = outputDir + fileName;
      // RENDER THE PAGE
      renderPage(filePath, nextData);

      if (nextData.done) {
        console.log("DONE");
        done(0);
      }

      if (nextData.delay) {
        window.setTimeout(function() {
          captureImage();
        }, nextData.delay | 0);
      }
      else {
        captureImage();
      }

    }
    else {
      trace("[PhantomCapture] received null termination signal; stopping.");
      done(0);
    }
  }

  function snap(opts) {

  }

  function renderPage(path, opts) {
    var rect = {width:opts.width, height:opts.height, top:opts.y, left:opts.x};
    page.clipRect = rect;

    trace("[PhantomCapture.renderPage()] Rendering to path:", path)
    page.render(path);
  }

  function startMonitoring() {
    intervalId = window.setInterval(checkPageReady, 200);
  }

  function done(code) {
    page.close(); // release page resources (including file handles?)
    page = null;
    _self.startWaiting(); // set READY
    PhantomLib.procQueue();
  }
}

Opts.inherit(PhantomCapture, Waiter);


PhantomLib.procQueue = function() {
  var q = this.queue;
  var qid = this.queueId;

  // case: no more items in the queue
  if (q.length <= qid) {
    var quit = function() {
      if (PhantomLib.waiting) {
        phantom.exit();
      }
    }

    this.waiting = true;
    window.setTimeout(quit, 6000); // delay after 

    // done:
    return;
  }
  
  var lastItem = q[qid];
  if (lastItem.isReady()) {
    this.queueId += 1;
    this.procQueue();
    return;
  }


  lastItem.capture();
};

PhantomLib.captureMap = function(url, opts) {
  var capture = new PhantomCapture(url, opts);
  this.queue.push(capture);
  this.waiting = false;
  this.procQueue();
};

/*
var args = Phantom.arguments;

if (args.length < 2) {
  console.log("[phantom-lib] Pass the url of page to load as an argument.");
  //phantom.exit(1);
}
else {
  var url = args[1];
  PhantomLib.captureMap(url);
}
*/

