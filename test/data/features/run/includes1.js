
module.exports.getCommand = function(io) {
  var data = [{"foo": "bar"}];
  io.addInputFile('data.json', data);
  return '-i data.json';
};
