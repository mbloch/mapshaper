/* @requires core */

Utils.loadBinaryData = function(url, callback) {
  // TODO: throw error if ajax or arraybuffer not available
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.responseType = 'arraybuffer';
  xhr.onload = function(e) {
    callback(this.response);
  };
  xhr.send();
};
