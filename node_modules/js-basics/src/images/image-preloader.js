/* @requires events, browser */

/**
 * Method one: individual files
 *    var preloader = new ImagePreloader();
 *    preloader.addImage(<url>); // repeat with each image
 *    preloader.start();
 *
 * Method two: a batch of files
 *    new ImagePreloader().preloadImages(<array of urls>);
 */
function ImagePreloader() {

  var index = {};
  var started = false;
  var waitCount = 0;
  var self = this;

  this.addImage = function(url) {
    if (url in index == false) {
      waitCount += 1;
      var img = new Image();
      img.onload = gotOne;
      img.onerror = function() {
        trace("[ImagePreloader] Unable to load image:", url);
        gotOne();
      };
      img.src = url;
      index[url] = img;
    }
  };

  this.preloadImages = function(arr) {
    for (var i=0; i<arr.length; i++) {
      this.addImage(arr[i]);
    }
    this.start();
  };

  this.start = function() {
    started = true;
    if (waitCount == 0) {
      self.startWaiting();
    }
  };

  function gotOne() {
    waitCount -= 1;
    if (started && waitCount == 0) {
      self.startWaiting();
    }
  }

  this.handleReadyState = function() {
    index = null;
  };
}

Opts.inherit(ImagePreloader, Waiter);
