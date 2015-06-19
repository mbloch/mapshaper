/* @requires mapshaper-gui-lib */

function Message(str) {
  var wrapper = El('div').appendTo('#page-wrapper').addClass('error-wrapper');
  var box = El('div').appendTo(wrapper).addClass('error-box g-info-box');
  var msg = El('div').addClass('error-message').appendTo(box);
  var close = El('div').addClass("g-panel-btn error-btn active").appendTo(box).html('close');

  new SimpleButton(close).on('click', remove);

  message(str);

  function message(str) {
    msg.html(str);
  }

  function remove() {
    wrapper.remove();
  }
}