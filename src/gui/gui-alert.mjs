import { El } from './gui-el';


export async function showPrompt(msg, title) {
  var popup = showPopupAlert(msg, title);
  return new Promise(function(resolve) {
    popup.onCancel(function() {
      resolve(false);
    });
    popup.button('Yes', function() {
      resolve(true);
    });
    popup.button('No', function() {
      resolve(false);
    });
  });
}

export function showPopupAlert(msg, title, optsArg) {
  var opts = optsArg || {};
  var self = {}, html = '';
  var _cancel, _close;
  var warningRxp = /^Warning: /;
  var el = El('div').appendTo('body').addClass('alert-wrapper')
    .classed('non-blocking', opts.non_blocking);
  var infoBox = El('div').appendTo(el).addClass('alert-box info-box selectable');
  El('div').appendTo(infoBox).addClass('close2-btn').on('click', function() {
    if (_cancel) _cancel();
    self.close();
  });
  if (opts.max_width) {
    infoBox.node().style.maxWidth = opts.max_width;
  }
  var container = El('div').appendTo(infoBox);
  if (!title && warningRxp.test(msg)) {
    title = 'Warning';
    msg = msg.replace(warningRxp, '');
  }
  if (title) {
    El('div').addClass('alert-title').text(title).appendTo(container);
  }
  var content = El('div').appendTo(infoBox);
  if (msg) {
    content.html(`<p class="alert-message">${msg}</p>`);
  }

  self.container = function() { return content; };

  self.onCancel = function(cb) {
    _cancel = cb;
    return self;
  };

  self.onClose = function(cb) {
    _close = cb;
    return self;
  };

  self.button = function(label, cb) {
    El('div')
      .addClass("btn dialog-btn alert-btn")
      .appendTo(infoBox)
      .html(label)
      .on('click', function() {
        self.close();
        cb();
      });
    return self;
  };

  self.close = function(action) {
    var ms = 0;
    var _el = el;
    if (action == 'fade' && _el) {
      ms = 1000;
      _el.addClass('fade-out');
    }
    if (_close) _close();
    el = _cancel = _close = null;
    setTimeout(function() {
      if (_el) _el.remove();
    }, ms);
  };
  return self;
}

export function AlertControl(gui) {
  var openAlert; // error popup
  var openPopup; // any popup
  var quiet = false;

  gui.addMode('alert', function() {}, closePopup);

  gui.alert = function(str, title) {
    closePopup();
    openAlert = openPopup = showPopupAlert(str, title);
    openAlert.onClose(gui.clearMode);
    gui.enterMode('alert');
  };

  gui.quiet = function(flag) {
    quiet = !!flag;
  };

  gui.message = function(str, title) {
    if (quiet) return;
    if (openPopup) return; // don't stomp on another popup
    openPopup = showPopupAlert(str, title);
    openPopup.onClose(function() {openPopup = null;});
  };

  function closePopup() {
    if (openPopup) openPopup.close();
    openPopup = openAlert = null;
  }
}
