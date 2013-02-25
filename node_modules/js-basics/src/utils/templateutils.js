
/**
 * 
 * @param {string} str String including zero or more #{} blocks.
 * @param {object} context Execution context.
 * @return {string} Interpolated string.
 */
Utils.evaluateString = function(str, context) {
  var rxp = TemplateEngine.STRING_RXP;
  var matches = rxp.exec(str);
  while (matches != null) {
    var orig = matches[0];
    var exp = matches[1];
    with (context) {
      var repl = eval(exp);
    }
    str = str.replace(orig, repl);
    matches = rxp.exec(str);
  }

  return str;
};


Utils.getPagePosition = function(el) {
    for (var lx=0, ly=0;
         el != null;
         lx += el.offsetLeft, ly += el.offsetTop, el = el.offsetParent);
    return {x: lx, y: ly};
};

Utils.getPagePosition2 = function(el) {
  var curleft = curtop = 0;
  if (el.offsetParent) {
    do {
    curleft += el.offsetLeft;
    curtop += el.offsetTop;
    } while (el = el.offsetParent);
  }
  return {x:curleft, y:curtop};

};




