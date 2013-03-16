/* @requires toggle-buttons */

function StandardTabs() {
  var css = ""; // "position:static;";
  this.__super__(css, {limit:1, unselectable:false});
  Browser.addClass(this.div, 'nytg-tabs'); // already has 'nytg-toggle-buttons'
}

Opts.inherit(StandardTabs, ToggleButtons);

StandardTabs.prototype.addTab = function(label, key, selected) {
  var numTabs = this._keys.length;
  
  var upCSS, downCSS, hoverCSS;
  /*
  var css = numTabs == 0 ? "border 1px solid #ccc;" : "border 1px 1px 1px 0 solid #ccc;";
  css += "text-decoration: none;";

  var upCSS = css + "color:#888; box-shadow: none; ";
  var downCSS = css + "color:black; box-shadow: rgba(0, 0, 0, 0.4) 0 0 4px 0 inset;";
  var hoverCSS = "text-decoration:underline;";
  */

  //var div = LabelButton.create(label, "display:inline-block; padding:6px 14px 7px 14px; font-family:Arial,Helvetica,sans-serif;");
  var div = LabelButton.create(label, "");

  var btn = new UpDownButton(div, upCSS, downCSS, hoverCSS);
  btn._isTab = true; // kludge for setting selected tab class; see UpDownButton.up() and .down()
  Browser.addClass(btn.div, 'nytg-tab');

  if (numTabs == 0) {
    Browser.addClass(btn.div, 'nytg-firstTab');
  }
  else {
    if (numTabs >= 2) {
      Browser.removeClass(this._buttons[numTabs-1].div, 'nytg-lastTab');
    }
    Browser.addClass(btn.div, 'nytg-lastTab');
  }

  this.addButton(key, btn, selected);


};
