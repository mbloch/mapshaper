/* @requires browser */

var HashString = {
  getRawString: function() {
    var url = Browser.getPageUrl();
    var matches = /(.*)(?:#([^?]*))(\?.+)?/.exec(url);
		return matches && matches[2] || '';
  }

};