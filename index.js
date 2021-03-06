#! /usr/bin/env node

var tls = require('tls');
var net = require('net');
var eos = require('end-of-stream');
var through = require('through2');
var minimist = require('minimist');
var allContainers = require('docker-allcontainers');
var statsFactory = require('docker-stats');
var logFactory = require('docker-loghose');

function connect(opts) {
  var stream;
  if (opts.secure) {
    stream = tls.connect(20000, 'api.logentries.com', onSecure);
  } else {
    stream = net.createConnection(10000, 'api.logentries.com');
  }

  function onSecure() {
    // let's just crash if we are not secure
    if (!stream.authorized) throw new Error('secure connection not authorized');
  }

  return stream;
}


function start(opts) {
  var token = opts.token;
  var out;
  var noRestart = function() {};
  var filter = through.obj(function(obj, enc, cb) {
    addAll(opts.add, obj);
    this.push(token);
    this.push(' ');
    this.push(JSON.stringify(obj));
    this.push('\n');
    cb()
  });
  var events = allContainers(opts);
  opts.events = events;

  var loghose = logFactory(opts);
  loghose.pipe(filter);

  if (opts.stats !== false) {
    var stats = statsFactory(opts);
    stats.pipe(filter);
  }

  pipe();

  // destroy out if loghose is destroyed
  eos(loghose, function() {
    noRestart()
    out.destroy();
  });

  return loghose;

  function addAll(proto, obj) {
    if (!proto) { return; }

    var key;
    for (key in proto) {
      if (proto.hasOwnProperty(key)) {
        obj[key] = proto[key];
      }
    }
  }

  function pipe() {
    if (out) {
      filter.unpipe(out);
    }

    out = connect(opts);

    filter.pipe(out, { end: false });

    // automatically reconnect on socket failure
    noRestart = eos(out, pipe);
  }
}

function cli() {
  var argv = minimist(process.argv.slice(2), {
    boolean: ['json', 'stats'],
    alias: {
      'token': 't',
      'secure': 's',
      'json': 'j',
      'add': 'a'
    },
    default: {
      json: false,
      stats: true,
      add: []
    }
  });

  if (!argv.token) {
    console.log('Usage: docker-logentries -t TOKEN [--secure] [--json] [--no-stats] [-a KEY=VALUE]');
    process.exit(1);
  }

  if (argv.add && !Array.isArray(argv.add)) {
    argv.add = [argv.add];
  }

  argv.add = argv.add.reduce(function(acc, arg) {
    arg = arg.split('=');
    acc[arg[0]] = arg[1];
    return acc
  }, {});

  start(argv);
}

module.exports = start;

if (require.main === module) {
  cli();
}
