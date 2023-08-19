import { El } from './gui-el';

export function showPopupAlert(msg, title) {
  var self = {}, html = '';
  var _cancel, _close;
  var warningRxp = /^Warning: /;
  var el = El('div').appendTo('body').addClass('alert-wrapper');
  var infoBox = El('div').appendTo(el).addClass('alert-box info-box selectable');
  El('div').appendTo(infoBox).addClass('close2-btn').on('click', function() {
    if (_cancel) _cancel();
    self.close();
  });
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
    content.html(`<p class="error-message">${msg}</p>`);
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

  self.close = function() {
    if (el) el.remove();
    if (_close) _close();
    el = _cancel = _close = null;
  };
  return self;
}

export function AlertControl(gui) {
  var openAlert; // error popup
  var openPopup; // any popup

  gui.addMode('alert', function() {}, closePopup);

  gui.alert = function(str, title) {
    closePopup();
    openAlert = openPopup = showPopupAlert(str, title);
    // alert.button('close', gui.clearMode);
    openAlert.onClose(gui.clearMode);
    gui.enterMode('alert');
  };

  gui.message = function(str, title) {
    if (openPopup) return; // don't stomp on another popup
    openPopup = showPopupAlert(str, title);
    openPopup.onClose(function() {openPopup = null;});
  };

  function closePopup() {
    if (openPopup) openPopup.close();
    openPopup = openAlert = null;
  }
}
