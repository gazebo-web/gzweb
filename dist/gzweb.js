(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('eventemitter2'), require('protobufjs')) :
  typeof define === 'function' && define.amd ? define(['exports', 'eventemitter2', 'protobufjs'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.gzweb = {}, global.eventemitter2, global.protobufjs));
})(this, (function (exports, eventemitter2, protobufjs) { 'use strict';

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  function _defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }

  function _createClass(Constructor, protoProps, staticProps) {
    if (protoProps) _defineProperties(Constructor.prototype, protoProps);
    if (staticProps) _defineProperties(Constructor, staticProps);
    Object.defineProperty(Constructor, "prototype", {
      writable: false
    });
    return Constructor;
  }

  function _unsupportedIterableToArray(o, minLen) {
    if (!o) return;
    if (typeof o === "string") return _arrayLikeToArray(o, minLen);
    var n = Object.prototype.toString.call(o).slice(8, -1);
    if (n === "Object" && o.constructor) n = o.constructor.name;
    if (n === "Map" || n === "Set") return Array.from(o);
    if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
  }

  function _arrayLikeToArray(arr, len) {
    if (len == null || len > arr.length) len = arr.length;

    for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];

    return arr2;
  }

  function _createForOfIteratorHelper(o, allowArrayLike) {
    var it = typeof Symbol !== "undefined" && o[Symbol.iterator] || o["@@iterator"];

    if (!it) {
      if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") {
        if (it) o = it;
        var i = 0;

        var F = function () {};

        return {
          s: F,
          n: function () {
            if (i >= o.length) return {
              done: true
            };
            return {
              done: false,
              value: o[i++]
            };
          },
          e: function (e) {
            throw e;
          },
          f: F
        };
      }

      throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
    }

    var normalCompletion = true,
        didErr = false,
        err;
    return {
      s: function () {
        it = it.call(o);
      },
      n: function () {
        var step = it.next();
        normalCompletion = step.done;
        return step;
      },
      e: function (e) {
        didErr = true;
        err = e;
      },
      f: function () {
        try {
          if (!normalCompletion && it.return != null) it.return();
        } finally {
          if (didErr) throw err;
        }
      }
    };
  }

  /**
   * The Trasnport class is in charge of managing the websocket connection to a
   * Gazebo websocket server.
   */

  var Transport = /*#__PURE__*/function () {
    function Transport() {
      _classCallCheck(this, Transport);

      /**
       * Status connection behavior subject.
       * Components can subscribe to it to get connection status updates.
       * Uses a Behavior Subject because it has an initial state and stores a value.
       */
      this.status = new eventemitter2.EventEmitter2();
      /**
       * List of available topics.
       *
       * Array of objects containing {topic, msg_type}.
       */

      this.availableTopics = [];
      /**
       * Map of the subscribed topics.
       * - Key: The topic name.
       * - Value: The Topic object, which includes the callback.
       *
       * New subscriptions should be added to this map, in order to correctly derive the messages
       * received.
       */

      this.topicMap = new Map();
      /**
       * A map of asset uri to asset types. This allows a caller to request
       * an asset from the websocket server and receive a callback when the
       * aseset has been fetched.
       */

      this.assetMap = new Map();
      /**
       * The world that is being used in the Simulation.
       */

      this.world = '';
    }
    /**
     * Connects to a websocket.
     *
     * @param url The url to connect to.
     * @param key Optional. A key to authorize access to the websocket messages.
     */


    _createClass(Transport, [{
      key: "connect",
      value: function connect(url, key) {
        var _this = this;

        // First, disconnect from previous connections.
        // This way we make sure that we only support one websocket connection.
        this.disconnect(); // Create the Websocket interface.

        this.ws = new WebSocket(url); // Set the handlers of the websocket events.

        this.ws.onopen = function () {
          return _this.onOpen(key);
        };

        this.ws.onclose = function () {
          return _this.onClose();
        };

        this.ws.onmessage = function (msgEvent) {
          return _this.onMessage(msgEvent);
        };

        this.ws.onerror = function (errorEvent) {
          return _this.onError(errorEvent);
        };
      }
      /**
       * Disconnects from a websocket.
       * Note: The cleanup should be done in the onclose event of the Websocket.
       */

    }, {
      key: "disconnect",
      value: function disconnect() {
        if (this.ws) {
          this.ws.close();
        }
      }
      /**
       * Subscribe to a topic.
       *
       * @param topic The topic to subscribe to.
       */

    }, {
      key: "subscribe",
      value: function subscribe(topic) {
        this.topicMap.set(topic.name, topic);
        var publisher = this.availableTopics.filter(function (pub) {
          return pub['topic'] === topic.name;
        })[0];

        if (publisher['msg_type'] === 'ignition.msgs.Image' || publisher['msg_type'] === 'gazebo.msgs.Image') {
          this.ws.send(this.buildMsg(['image', topic.name, '', '']));
        } else {
          this.ws.send(this.buildMsg(['sub', topic.name, '', '']));
        }
      }
      /**
       * Unsubscribe from a topic.
       *
       * @param name The name of the topic to unsubcribe from.
       */

    }, {
      key: "unsubscribe",
      value: function unsubscribe(name) {
        if (this.topicMap.has(name)) {
          var topic = this.topicMap.get(name);

          if (topic !== undefined && topic.unsubscribe !== undefined) {
            topic.unsubscribe();
          }

          this.topicMap["delete"](name);
          this.ws.send(this.buildMsg(['unsub', name, '', '']));
        }
      }
      /**
       * throttle the rate at which messages are published on a topic.
       *
       * @param topic The topic to throttle.
       * @param rate Publish rate.
       */

    }, {
      key: "throttle",
      value: function throttle(topic, rate) {
        this.ws.send(this.buildMsg(['throttle', topic.name, 'na', rate.toString()]));
      }
      /**
       * Return the list of available topics.
       *
       * @returns The list of topics that can be subscribed to.
       */

    }, {
      key: "getAvailableTopics",
      value: function getAvailableTopics() {
        return this.availableTopics;
      }
      /**
       * Return the list of subscribed topics.
       *
       * @returns A map containing the name and message type of topics that we are currently
       *          subscribed to.
       */

    }, {
      key: "getSubscribedTopics",
      value: function getSubscribedTopics() {
        return this.topicMap;
      }
      /**
       * Return the world.
       *
       * @returns The name of the world the websocket is connected to.
       */

    }, {
      key: "getWorld",
      value: function getWorld() {
        return this.world;
      }
      /**
       * Get an asset from Gazebo
       */

    }, {
      key: "getAsset",
      value: function getAsset(_uri, _cb) {
        var asset = {
          uri: _uri,
          cb: _cb
        };
        this.assetMap.set(_uri, asset);
        this.ws.send(this.buildMsg(['asset', '', '', _uri]));
      }
      /**
       * Handler for the open event of a Websocket.
       *
       * @param key Optional. A key to authorize access to the websocket messages.
       */

    }, {
      key: "onOpen",
      value: function onOpen(key) {
        // An authorization key could be required to request the message definitions.
        if (key) {
          this.ws.send(this.buildMsg(['auth', '', '', key]));
        } else {
          this.ws.send(this.buildMsg(['protos', '', '', '']));
        }
      }
      /**
       * Handler for the close event of a Websocket.
       *
       * Cleanup the connections.
       */

    }, {
      key: "onClose",
      value: function onClose() {
        this.topicMap.clear();
        this.availableTopics = [];
        this.root = null;
        this.status.emit('disconnected');
      }
      /**
       * Handler for the message event of a Websocket.
       *
       * Parses message responses from Gazebo and sends to the corresponding topic.
       */

    }, {
      key: "onMessage",
      value: function onMessage(event) {
        var _this2 = this;

        // If there is no Root, then handle authentication and the message definitions.
        var fileReader = new FileReader();

        if (!this.root) {
          fileReader.onloadend = function () {
            var content = fileReader.result; // Handle the response.

            switch (content) {
              case 'authorized':
                // Get the message definitions.
                _this2.ws.send(_this2.buildMsg(['protos', '', '', '']));

                break;

              case 'invalid':
                // TODO(germanmas) Throw a proper Unauthorized error.
                console.error('Invalid key');
                break;

              default:
                // Parse the message definitions.
                _this2.root = protobufjs.parse(fileReader.result, {
                  keepCase: true
                }).root; // Request topics.

                _this2.ws.send(_this2.buildMsg(['topics-types', '', '', ''])); // Request world information.


                _this2.ws.send(_this2.buildMsg(['worlds', '', '', ''])); // Now we can update the connection status.


                _this2.status.emit('connected');

                break;
            }
          };

          fileReader.readAsText(event.data);
          return;
        }

        fileReader.onloadend = function () {
          var _a, _b, _c, _d;

          if (!_this2.root) {
            console.error("Protobuf root has not been created");
            return;
          } // Return if at any point, the websocket connection is lost.


          _this2.status.on('disconnected', function () {
            return;
          }); // Decode as UTF-8 to get the header.


          var str = new TextDecoder('utf-8').decode(fileReader.result);
          var frameParts = str.split(',');

          var msgType = _this2.root.lookup(frameParts[2]);

          var buffer = new Uint8Array(fileReader.result); // Decode the Message. The "+3" in the slice accounts for the commas in the frame.

          var msg; // get the actual msg payload without the header

          var msgData = buffer.slice(frameParts[0].length + frameParts[1].length + frameParts[2].length + 3); // do not decode image msg as it is raw compressed png data and not a
          // protobuf msg

          if (frameParts[2] === 'ignition.msgs.Image' || frameParts[2] === 'gazebo.msgs.Image') {
            msg = msgData;
          } else {
            msg = msgType.decode(msgData);
          } // For frame format information see the WebsocketServer documentation at:
          // https://github.com/gazebosim/gz-launch/blob/ign-launch5/plugins/websocket_server/WebsocketServer.hh


          if (frameParts[0] == 'asset') {
            // Run the callback associated with the asset. This lets the requester
            // process the asset message.
            if (_this2.assetMap.has(frameParts[1])) {
              (_b = (_a = _this2 === null || _this2 === void 0 ? void 0 : _this2.assetMap) === null || _a === void 0 ? void 0 : _a.get(frameParts[1])) === null || _b === void 0 ? void 0 : _b.cb(msg['data']);
            } else {
              console.error('No resource callback');
            }
          } else if (frameParts[0] == 'pub') {
            // Handle actions and messages.
            switch (frameParts[1]) {
              case 'topics-types':
                var _iterator = _createForOfIteratorHelper(msg['publisher']),
                    _step;

                try {
                  for (_iterator.s(); !(_step = _iterator.n()).done;) {
                    var pub = _step.value;

                    _this2.availableTopics.push(pub);
                  }
                } catch (err) {
                  _iterator.e(err);
                } finally {
                  _iterator.f();
                }

                break;

              case 'topics':
                _this2.availableTopics = msg['data'];
                break;

              case 'worlds':
                // The world name needs to be used to get the scene information.
                _this2.world = msg['data'][0];

                _this2.ws.send(_this2.buildMsg(['scene', _this2.world, '', '']));

                break;

              case 'scene':
                // Emit the scene information. Contains all the models used.
                _this2.status.emit('sceneInfo', msg); // Once we received the Scene Information, we can start working.
                // We emit the Ready status to reflect this.


                _this2.status.emit('ready');

                break;

              default:
                // Message from a subscribed topic. Get the topic and execute its
                // callback.
                if (_this2.topicMap.has(frameParts[1])) {
                  (_d = (_c = _this2 === null || _this2 === void 0 ? void 0 : _this2.topicMap) === null || _c === void 0 ? void 0 : _c.get(frameParts[1])) === null || _d === void 0 ? void 0 : _d.cb(msg);
                }

                break;
            }
          } else {
            console.warn('Unhandled websocket message with frame operation', frameParts[0]);
          }
        }; // Read the blob data as an array buffer.


        fileReader.readAsArrayBuffer(event.data);
        return;
      }
      /**
       * Handler for the error event of a Websocket.
       */

    }, {
      key: "onError",
      value: function onError(event) {
        this.status.emit('error');
        this.disconnect();
        console.error(event);
      }
      /**
       * Helper function to build a message.
       * The message is a comma-separated string consisting in four parts:
       * 1. Operation
       * 2. Topic name
       * 3. Message type
       * 4. Payload
       */

    }, {
      key: "buildMsg",
      value: function buildMsg(parts) {
        return parts.join(',');
      }
    }]);

    return Transport;
  }();

  /**
   * Type that represents a topic to be subscribed. This allows communication between Components and
   * the Websocket service of a Simulation.
   */
  var Topic = /*#__PURE__*/_createClass(function Topic(name, cb) {
    _classCallCheck(this, Topic);

    this.name = name;
    this.cb = cb;
  });

  /**
   * Type that represents a simulation asset that needs to be fetched from a websocket server.
   */
  var Asset = /*#__PURE__*/_createClass(function Asset(uri, cb) {
    _classCallCheck(this, Asset);

    this.uri = uri;
    this.cb = cb;
  });

  /Mobi/.test(navigator.userAgent);
  /**
   * Convert a binary byte array to a base64 string.
   * @param {byte array} buffer - Binary byte array
   * @return Base64 encoded string.
   **/

  function binaryToBase64(buffer) {
    var binary = '';
    var len = buffer.byteLength;

    for (var i = 0; i < len; i++) {
      binary += String.fromCharCode(buffer[i]);
    }

    return window.btoa(binary);
  }

  exports.Asset = Asset;
  exports.Topic = Topic;
  exports.Transport = Transport;
  exports.binaryToBase64 = binaryToBase64;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
