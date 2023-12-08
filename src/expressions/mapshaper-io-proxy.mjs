import utils from '../utils/mapshaper-utils';

export function getIOProxy(job) {
  async function addInputFile(filename, content) {
    if (utils.isPromise(content)) {
      content = await content;
    }
    io._cache[filename] = content;
    return filename; // return filename to support -run '-i {io.ifile()}'
  }
  var io = {
    _cache: {},
    addInputFile,
    ifile: addInputFile // ifile() is an alias for addInputFile
  };
  return io;
}
