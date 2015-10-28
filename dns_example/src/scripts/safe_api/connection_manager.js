/**
* Manage the TCP connection with the Launcher
*/

var Connection = function() {
  var net = require('net');
  var log = require('npmlog');
  var socket;
  var onDataReceivedListener;
  var onConnectionErrorListener;
  var alive = false;
  var HOST = 'localhost';
  var LENGTH_SIZE = 8;

  var setOnDataRecievedListener =  function(listnerCallback) {
    onDataReceivedListener = listnerCallback;
  };

  var setOnConnectionErrorListener = function(listnerCallback) {
    onConnectionErrorListener = listnerCallback;
  };

  var OPTIONS = {
    'onData': setOnDataRecievedListener,
    'onError': setOnConnectionErrorListener
  };

  var setFromOptions = function(options) {
    for (var key in OPTIONS) {
      if (!options.hasOwnProperty(key)) {
        continue;
      }
      OPTIONS[key](options[key]);
    }
  };

  var ResponseBuffer = function() {
    var self = this;
    var response;
    var maxsize;
    self.STATE = {
      READY: 0,
      READING: 1
    };
    var state = self.STATE.READY;

    self.read = function(data) {
      var extraBuffer;
      var dataBuffer;
      var dataLength = data.length;
      if (dataLength > maxsize) {
        extraBuffer = data.slice(maxsize);
      }
      dataBuffer  = data.slice(0, maxsize);
      response += dataBuffer.toString();
      maxsize -= dataLength;
      if (maxsize === 0) {
        onDataReceivedListener(JSON.parse(response));
        state = self.STATE.READY;
      }
      return extraBuffer;
    };

    self.reset = function(size) {
      if (state === self.STATE.READING) {
        log.warn('Read overlapping. Trying to read a new stream while the previous one is not complete');
        return;
      }
      state = self.STATE.READING;
      response = '';
      maxsize = size;
    };

    self.getState = function() {
      return state;
    };

    return self;
  };

  var responseBuffer = new ResponseBuffer();

  var onDataReceived = function(data) {
    log.verbose('Data received from launcher');
    if (!onDataReceivedListener) {
      return;
    }
    var readStream = function(buff) {
      var excessBuffer = responseBuffer.read(buff);
      if (excessBuffer) {
        readNewStream(excessBuffer);
      }
    };
    var readNewStream = function(buff) {
      var length = buff.slice(0, LENGTH_SIZE).readUInt32LE(0);
      var dataBuff = buff.slice(LENGTH_SIZE).toString();
      responseBuffer.reset(length);
      readStream(dataBuff);
    };
    (responseBuffer.getState() === responseBuffer.STATE.READY ? readNewStream : readStream)(new Buffer(data));
  };

  var onConnectionError = function() {
    var connectionDroppedMsg = 'Connection with the launcher disconnected';
    var couldNotEstablishConMsg = 'Connection could not be established';
    log.error(alive ? connectionDroppedMsg : couldNotEstablishConMsg);
    alive = false;
    if (!onConnectionErrorListener) {
      return;
    }
    onConnectionErrorListener();
  };

  /**
  * connect function is invoked to connect to a port on the local machine
  * callback will be invoked only when the connection is successful
  * else the onClosed listener will be invoked if the connection fails
  */
  this.connect = function(host, portNumber, callback, options) {
    if (options) {
      setFromOptions(options);
    }
    host = host || HOST;
    log.verbose('Connecting with the launcher at - ' + host + ':' + portNumber);
    socket =  new net.Socket();
    socket.on('data', onDataReceived);
    //socket.on('error', onConnectionError);
    socket.on('close', onConnectionError);
    socket.connect(portNumber, host, function() {
      alive = true;
      log.verbose('Connected with the launcher at port : ' + portNumber);
      callback();
    });
  };

  /**
   * Write data to the launcher TCP connection
   * Length(U64INT - Little Endian format) of the data is prepended as before the data.
   * @param data - Object
   */
  this.send = function(data) {
    data = JSON.stringify(data);
    var lengthAsLE = new Buffer(LENGTH_SIZE);
    lengthAsLE.fill(0);
    lengthAsLE.writeUInt32LE(data.length);
    socket.write(lengthAsLE);
    socket.write(data);
  };

  this.isAlive = function() {
    return alive;
  };

  this.setOnDataRecievedListener = setOnDataRecievedListener;

  this.setOnConnectionErrorListener = setOnConnectionErrorListener;

};

exports = module.exports = new Connection();
