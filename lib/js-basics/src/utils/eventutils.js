/* @requires events */

Utils.monitorEvent = function(obj, evt, handler, trueEvt, falseEvt) {
  var status = void 0; // true or false

  obj.on(evt, function(e) {
    var retn = handler(e);
    if (retn !== status) {
      if (retn === true && trueEvt) {
        obj.dispatchEvent(trueEvt);
      } else if (retn === false) {
       obj.dispatchEvent(falseEvt);
      } else {
        error("Utils#monitorEvent() Handler must return true or false");
      }
      status = retn;
    }
  });
};
