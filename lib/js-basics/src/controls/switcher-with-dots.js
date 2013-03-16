/* @requires events, elements */

function SwitcherWithDots(arr, callback, opts) {
  var id = 0;
  var self = this;
  this.__super__('div');
  this.addClass('nytg-switcher');

  assert(opts && opts.left_btn && opts.right_btn && opts.dot_sel && opts.dot_unsel, "Missing one or more asset urls from opts:", opts);

  var btnLeft = El('div').child('img').attr('src', opts.left_btn).parent().addClass('nytg-switcher-button nytg-switcher-left-button').on('click', function(evt) {
    setId(id - 1, true)
  }).appendTo(this.node());

  var dots = Utils.map(arr, function(item, i) {
    var dot = El('div').addClass('nytg-switcher-dot').on('click', function(evt) {
      setId(i, true);
    }).child('img').attr('src', opts.dot_unsel).parent();

    dot.appendTo(self.node());
    return dot;
  });

  var btnRight = El('div').child('img').attr('src', opts.right_btn).parent().addClass('nytg-switcher-button nytg-switcher-right-button').on('click', function(evt) {
    setId(id + 1, true);
  }).appendTo(this.node());

  this.select = function(obj) {
    var id = 0;
    if (Utils.isObject(obj)) {
      id = Utils.indexOf(arr, obj);
    }
    else if (Utils.isNumber(obj)) {
      id = obj;
    }
    else {
      error("[select()] requires an index or an object");
    }

    setId(id, false);

  };

  function setId(newId, fire) {
    var oldDot = dots[id];
    oldDot.child().attr('src', opts.dot_unsel);

    id = newId;

    if (id < 0) {
      id = arr.length - 1;
    }

    if (id >= arr.length) {
      id = 0;
    }

    trace(">> setId() id:", id, "newId:", newId)

    var newDot = dots[id];
    newDot.child().attr('src', opts.dot_sel);

    fire && self.dispatchEvent('change', {object:arr[id]});
    trace(">>>> dispatching change")

  }

  setId(id);

}

Opts.inherit(SwitcherWithDots, El);
