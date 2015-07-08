/* @requires mapshaper-gui-lib */

function Message(str) {
  var wrapper = El('div').appendTo('body').addClass('error-wrapper');
  var box = El('div').appendTo(wrapper).addClass('error-box info-box');
  var msg = El('div').addClass('error-message').appendTo(box);
  var close = El('div').addClass("g-btn dialog-btn").appendTo(box).html('close');

  new SimpleButton(close).on('click', remove);

  message(str);

  function message(str) {
    msg.html(str);
  }

  function remove() {
    wrapper.remove();
  }
}