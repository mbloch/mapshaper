/* @requires mapshaper-gui-lib */

function CommandHistory() {
  var commands = "";
  this.addCommandString = function(str) {
    commands += ' ' + str;
  };

  this.export = function() {
    return commands.trim();
  };
}
