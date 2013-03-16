/* @requires events, basic-button */

function PrevNextButtons(prevBtn, nextBtn, keys, startIdx) {
  this._keys = keys;
  var div = this.div = Browser.createElement('div', "");
  div.appendChild(prevBtn.div);
  div.appendChild(nextBtn.div);
  var currIdx = startIdx || 0;

  prevBtn.addEventListener('click', function() {
    currIdx = currIdx == 0 ? keys.length - 1 : currIdx - 1;
    this.dispatchEvent('change');
  }, this);

  nextBtn.addEventListener('click', function() {
    currIdx = currIdx >= (keys.length - 1) ? 0 : currIdx + 1;
    this.dispatchEvent('change');
  }, this);

  this.getCurrentKey = function() {
    return keys[currIdx];
  };
}

Opts.inherit(PrevNextButtons, EventDispatcher);
