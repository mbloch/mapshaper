
module.exports = function(api) {
  var options = [{
    name: 'string',
    DEFAULT: true
  }];
  var cmd = {
    name: 'set-foo',
    options,
    command: run,
    target: 'layer'
  };

  return cmd;

  // modifies layer in place
  function run(lyr, dataset, opts) {
    lyr.data.getRecords().forEach(function(d) {
      d.foo = opts.string || '';
    });
  }
};

