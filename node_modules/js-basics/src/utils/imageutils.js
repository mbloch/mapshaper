/* @requires core, browser */

/*
var ImageUtils = {
  index: {},
  preload: function(url) {
    if (! url in this.index) {
      var img = new Image();
      img.src = url;
      this.index[url] = img;
    }
  },
  getImage: function(url) {
    return this.index[url] || null;
  }
};
*/

Utils.loadImage = function(url, callback) {
  var img = new Image();
  img.src = url;
  Browser.on(img, 'load', function(evt) {
    trace("Image loaded:", url, "size:", img.width, img.height);
    callback(img);
  });
  return img;
};

Utils.loadImages = function(urls, callback) {
  var images = [],
    loadCount = 0;
  Utils.forEach(urls, function(url) {
    var img = Utils.loadImage(url, function(img) {
      loadCount++;
      if (loadCount == urls.length) {
        if (images.length == loadCount)
          callback(images);
        else
          setTimeout(function(){callback(images)}, 50);
      }
    });
    images.push(img);
  });
  return images;
}

