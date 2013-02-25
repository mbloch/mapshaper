/* @requires browser */

var HashBang = {
  getRawString: function() {
    var url = Browser.getPageUrl();
    var matches = /(.*)(?:#!([^?]*))(\?.+)?/.exec(url);
		return matches && matches[2] || '';
  }
};