/* @requires events, core, arrayutils */

var inNode = typeof module !== 'undefined' && !!module.exports;
var Node = {
  inNode: inNode,
  arguments: inNode ? process.argv.slice(1) : null // remove "node" from head of argv list
};


/**
 * Convenience functions for working with files and loading data.
 */
if (inNode) {
  Node.fs = require('fs');
  Node.path = require('path');

  Node.gc = function() {
    global.gc && global.gc();
  };

  Node.statSync = function(fpath) {
    var obj = null;
    try {
      obj = Node.fs.statSync(fpath);
    }
    catch(e) {
      //trace(e, fpath);
    }
    return obj;
  };

  Node.toBuffer = function(src) {
    if (src instanceof Buffer) return src;
    var dest = new Buffer(src.byteLength);
    for (var i = 0, n=dest.length; i < n; i++) {
      dest[i] = src[i];
    }
    return dest;
  };

  Node.shellExec = function(cmd) {
    var parts = cmd.split(/[\s]+/); // TODO: improve, e.g. handle quoted strings w/ spaces
    var spawn = require('child_process').spawn;
    spawn(parts[0], parts.slice(1), {stdio: "inherit"});
  };

  // Converts relative path to absolute path relative to the node script;
  // absolute paths returned unchanged
  //
  Node.resolvePathFromScript = function(path) {
    if (Node.pathIsAbsolute(path))
      return path;
    var scriptDir = Node.getFileInfo(require.main.filename).directory;
    return Node.path.join(scriptDir, path);
  };

  //Node.resolvePathFromFile = function(path) {
  //  return Node.path.join(__dirname, path);
  //}
  Node.pathIsAbsolute = function(path) {
    return (path[0] == '/' || path[0] == "~");
  };

  Node.resolvePathFromShell = function(path) {
    if (Node.pathIsAbsolute(path))
      return path;
    return Node.path.join(process.cwd(), path);
  };


  Node.dirExists = function(path) {
    var ss = Node.statSync(path);
    return ss && ss.isDirectory() || false;
  };

  Node.fileExists = function(path) {
    var ss = Node.statSync(path);
    return ss && ss.isFile() || false;
  };

  Node.parseFilename = function(fpath) {
    // TODO: give better output if fpath is a directory
    var info = {};
    var filename = Node.path.basename(fpath);
    if (filename.lastIndexOf('/') == filename.length - 1) {
      filename = filename.substr(0, filename.length-1);
    }
    info.file = filename;
    info.path = Node.path.resolve(fpath);
    info.ext = Node.path.extname(fpath).toLowerCase().slice(1);
    info.base = info.ext.length > 0 ? info.file.slice(0, -info.ext.length - 1) : info.file;
    info.directory = Node.path.dirname(info.path);
    info.relative_dir = Node.path.dirname(fpath);
    return info;
  };

  Node.getFileInfo = function(fpath) {
    var info = Node.parseFilename(fpath),
        stat;
    Opts.copyAllParams(info, {exists: false, is_directory: false, is_file: false});
    if (stat = Node.statSync(fpath)) {
      if (stat.isFile()) {
        info.exists = true;
        info.is_file = true;
      } else {
        info.is_directory = true;
      }
    }
    return info;
  };

  /**
   * @param charset (optional) 'utf8' to read a string; if undefined, returns Buffer
   * @returns String if charset is provided, *** else Buffer object (node-specific object) ****
   */
  Node.readFile = function(fname, charset) {
    try {
      var content = Node.fs.readFileSync(fname, charset || void 0);
    } catch(e) {
      content = "";
      trace("[Node.readFile()] Error reading file:", fname, "err:", e);
    }
    return content;
  };

  Node.writeFile = function(path, content) {
    if (content instanceof ArrayBuffer)
      content = Node.toBuffer(content);
    Node.fs.writeFile(path, content, function(err) {
      if (err) {
        trace("[Node.writeFile()] Failed to write to file:", path);
      }
    });
  };

  Node.copyFile = function(src, dest) {
    if (!Node.fileExists(src)) error("[copyFile()] File not found:", src);
    var content = Node.fs.readFileSync(src);
    Node.fs.writeFileSync(dest, content);
  };

  Node.post = function(url, data, callback, opts) {
    opts = opts || {};
    opts.method = 'POST';
    opts.data = data;
    Node.request(url, callback, opts);
  }

  Node.readResponse = function(res, callback, encoding) {
    res.setEncoding(encoding || 'utf8');
    var content = '';
    res.on('data', function(chunk) {
      content += chunk;
    });
    res.on('end', function() {
      callback(null, res, content);
    });
  }

  // Current signature: function(opts, callback), like Node.js request module
  //    callback: function(err, response, body)
  // Also supports old signature: function(url, callback, opts)
  //    callback: function(body)
  //
  Node.request = function(opts, callback, old_opts) {
    var url, receive;
    if (Utils.isString(opts)) { // @opts is string -> assume url & old interface
      url = opts;
      opts = old_opts || {};
      receive = function(err, resp, data) {
        if (err) {
          error(err);
        } else {
          callback(data);
        }
      };
    } else {
      url = opts.url;
      receive = callback;
    }

    var o = require('url').parse(url),
        data = null,
        // moduleName: http or https
        moduleName = opts.protocol || o.protocol.slice(0, -1); // can override protocol (e.g. request https:// url using http)

    if (moduleName != 'http' && moduleName != 'https') error("Node.request() Unsupported protocol:", o.protocol);
    var reqOpts = {
      host: o.hostname,
      hostname: o.hostname,
      path: o.path,
      //port: o.port || module == 'https' && 443 || 80,
      method: opts.method || 'GET',
      headers: opts.headers || null
    }

    if (reqOpts.method == 'POST' || reqOpts.method == 'PUT') {
      data = opts.data || opts.body || '';
      reqOpts.headers = Utils.extend({
        'Content-Length': data.length,
        'Connection': 'close',
        'Accept-Encoding': 'identity'
      }, reqOpts.headers);
    }

    var req = require(moduleName).request(reqOpts);
    req.on('response', function(res) {
      if (res.statusCode > 201) {
        receive("Node.request() Unexpected status: " + res.statusCode + " url: " + url, res, null);
      }
      Node.readResponse(res, receive, 'utf8');
    });

    req.on('error', function(e) {
      // trace("Node.request() request error:", e.message);
      receive("Node.request() error: " + e.message, null, null);
    });
    req.end(data);
  };



  Node.atob = function(b64string) {
    return new Buffer(b64string, 'base64').toString('binary')
  };

  Node.readJson = function(url, callback, opts) {
    //Node.readUrl(url, function(str) {
    /*
    opts = {
      headers: {
        'Accept-Encoding': 'identity',
        'Accept-Charset': 'ISO-8859-1,utf-8;q=0.7,*;q=0.3',
        'Connection': 'keep-alive',
        'Cache-control': 'max-age=0',
        'User-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_3) AppleWebKit/537.31 (KHTML, like Gecko) Chrome/26.0.1410.43 Safari/537.31'
      }
    }*/

    Node.request({url: url}, function(err, req, str) {
      var data;
      if (!str) {
        callback(null);
      }
      try {
        // handle JS callback
        if (match = /^\s*([\w.-]+)\(/.exec(str)) {
          var ctx = {};
          Opts.exportObject(match[1], function(o) {return o}, ctx);
          with (ctx) {
            data = eval(str);
          }
        } else {
          data = JSON.parse(str); // no callback: assume valid JSON
        }
      } catch(e) {
        error("Node#readJson() Error reading from url:", url, "--", e);
      }
      callback(data);
    }, opts);
  };

  // super-simple options, if not using optimist
  Node.options = function(o) {
    o = o || {};
    var opts = {_:[]},
        flags = (o.flags || o.binary || '').split(','),
        currOpt;

    var aliases = Utils.reduce((o.aliases || "").split(','), function(item, obj) {
        var parts = item.split(':');
        if (parts.length == 2) {
          obj[parts[0]] = parts[1];
          obj[parts[1]] = parts[0];
        }
        return obj;
      }, {});

    function setOpt(opt, val) {
      opts[opt] = val;
      var alias = aliases[opt];
      if (alias) {
        opts[alias] = val;
      }
    }


    Node.arguments.slice(1).forEach(function(arg) {
      var match, alias, switches;
      if (arg[0] == '-') {
        currOpt = null; // handle this as an error
        if (match = /^--(.*)/.exec(arg)) {
          switches = [match[1]];
        }
        else if (match = /^-(.+)/.exec(arg)) {
          switches = match[1].split('');
        }
        Utils.forEach(switches, function(opt) {
          if (Utils.contains(flags, opt)) {
            setOpt(opt, true);
          } else {
            currOpt = opt;
          }
        });
      }
      else if (currOpt) {
        setOpt(currOpt, Utils.isNumber(arg) ? parseFloat(arg) : arg);
        currOpt = null;
      }
      else {
        opts._.push(arg);
      }
    });
    return opts;
  };
}


/*
Node.loadUrl = function(url) {
  return new NodeUrlLoader(url);
};



function NodeUrlLoader(url) {
  var self = this,
    body = "",
    output,
    opts = Utils.parseUrl(url);
  delete opts.protocol;
  opts.port = 80;

  require('http').get(opts, function(resp) {
    if (resp.headers['content-encoding'] == 'gzip') {
      var gzip = zlib.createGunzip();
      resp.pipe(gzip);
      output = gzip;
    } else {
      output = resp;
    }
    output.on('data', function(chunk) {
      body += chunk;
    });
    output.on('end', function() {
      self.data = body;
      self.startWaiting();
    });

  }).on("error", function(e){
    trace("[NodeUrlLoader] error: " + e.message);
  });
}

Opts.inherit(NodeUrlLoader, Waiter);
*/