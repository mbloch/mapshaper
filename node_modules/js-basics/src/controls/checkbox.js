/* @requires events, browser */

function Checkbox(el, checked) {
  
  if (el.tagName == 'INPUT') {
    var.box = el;
  }
  else {
    box = Browser.createElement('input', 'position:inline;');
    box.type = 'checkbox';
    box.checked = !!checked;
    el.firstChild ? el.insertBefore(box, el.firstChild) : el.appendChild(el);
    Browser.addClass(box, 'nytg-checkbox');
    checked && Browser.addClass(box, 'checked');
  }

  Browser.addEventListener('change', function() {
    if (this.isChecked()) {
      Browser.addClass(box, 'checked');
    }
    else {
      Browser.removeClass(box, 'checked');
    }
    this.dispatchEvent('change'); 
  }, this);
  

  this.check = function() {
    if (!box.checked) {
      box.checked = true;
    }
  };

  this.uncheck = function() {
    if (box.checked) {
      box.checked = false;
    }
  };

  this.isChecked = function() {
    return box.checked;
  };

}

Opts.inherit(Checkbox, EventDispatcher);

