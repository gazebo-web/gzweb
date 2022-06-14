(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('rxjs'), require('protobufjs')) :
  typeof define === 'function' && define.amd ? define(['exports', 'rxjs', 'protobufjs'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.gzweb = {}, global.rxjs, global.protobufjs));
})(this, (function (exports, rxjs, protobufjs) { 'use strict';

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
   * Type that represents a simulation asset that needs to be fetched from a websocket server.
   */
  var Asset = /*#__PURE__*/_createClass(function Asset(uri, cb) {
    _classCallCheck(this, Asset);

    this.uri = uri;
    this.cb = cb;
  });

  /**
   * Create a gamepad interface
   * @param {function} onButton - Function callback that accepts a button
   * object. This function is called when a button is pressed.
   * @param {function} onAxis - Function callback that accepts an axis
   * object. This function is called when a joystick axis is moved.
   */
  var Gamepad = /*#__PURE__*/function () {
    function Gamepad(onButton, onAxis) {
      _classCallCheck(this, Gamepad);

      this.controllers = {};
      this.onButtonCb = null;
      this.onAxisCb = null;
      this.onButtonCb = onButton;
      this.onAxisCb = onAxis; // Listen for gamepad connections.

      window.addEventListener('gamepadconnected', handleGamepadConnect); // Listen for gamepad disconnections.

      window.addEventListener('gamepaddisconnected', handleGamepadDisconnect); // Start the main processing event loop

      requestAnimationFrame(this.updateGamepads);
    }
    /** Main controller processing function. This function is called every
     * animation frame to poll for controller updates.
     */


    _createClass(Gamepad, [{
      key: "updateGamepads",
      value: function (_updateGamepads) {
        function updateGamepads() {
          return _updateGamepads.apply(this, arguments);
        }

        updateGamepads.toString = function () {
          return _updateGamepads.toString();
        };

        return updateGamepads;
      }(function () {
        // Scan for connected gamepads.
        this.scanGamepads(); // Process each controller

        for (var c in this.controllers) {
          var controller = this.controllers[c]; // Poll each button

          for (var b = 0; b < controller.gamepad.buttons.length; b++) {
            var button = controller.gamepad.buttons[b];

            if (controller.prevButtons[b] !== button.pressed) {
              this.onButtonCb({
                'index': b,
                'pressed': button.pressed
              });
            }

            controller.prevButtons[b] = button.pressed;
          } // Poll each axis


          for (var i = 0; i < controller.gamepad.axes.length; i += 2) {
            if (controller.prevAxes[i] !== controller.gamepad.axes[i] || controller.prevAxes[i + 1] !== controller.gamepad.axes[i + 1]) {
              this.onAxisCb({
                'index': (i / 2).toFixed(0),
                'x': controller.gamepad.axes[i],
                'y': controller.gamepad.axes[i + 1]
              });
            }

            controller.prevAxes[i] = controller.gamepad.axes[i];
            controller.prevAxes[i + 1] = controller.gamepad.axes[i + 1];
          }
        }

        requestAnimationFrame(updateGamepads);
      }
      /**
       * Poll for controllers. Some browsers use connection events, and others
       * require polling.
       */
      )
    }, {
      key: "scanGamepads",
      value: function scanGamepads() {
        var gamepads = navigator.getGamepads();

        for (var i = 0; i < gamepads.length; i++) {
          this.addGamepad(gamepads[i]);
        }
      }
      /** Adds or updates a gamepad to the list of controllers.
       * @param {object} The gamepad to add/update
       */

    }, {
      key: "addGamepad",
      value: function addGamepad(gamepad) {
        if (gamepad) {
          if (!(gamepad.index in this.controllers)) {
            console.log('Adding gamepad', gamepad.id);
            this.controllers[gamepad.index] = {
              gamepad: gamepad,
              prevButtons: new Array(gamepad.buttons.length),
              prevAxes: new Array(gamepad.axes.length)
            }; // Set button initial state

            for (var b = 0; b < gamepad.buttons.length; b++) {
              this.controllers[gamepad.index].prevButtons[b] = false;
            } // Set axes initial state


            for (var a = 0; a < gamepad.axes.length; a++) {
              this.controllers[gamepad.index].prevAxes[a] = 0.0;
            }
          } else {
            this.controllers[gamepad.index].gamepad = gamepad;
          }
        }
      }
      /** Removes a gamepad from the list of controllers
       * @param {object} The gamepad to remove
       */

    }, {
      key: "removeGamepad",
      value: function removeGamepad(gamepad) {
        if (gamepad && gamepad.index in this.controllers) {
          delete this.controllers[gamepad.index];
        }
      }
      /** Gamepad connect callback handler
       * @param {event} The gamepad connect event.
       */

    }, {
      key: "handleGamepadConnect",
      value: function handleGamepadConnect(e) {
        addGamepad(e.gamepad);
      }
      /** Gamepad disconnect callback handler
       * @param {event} The gamepad disconnect event.
       */

    }, {
      key: "handleGamepadDisconnect",
      value: function handleGamepadDisconnect(e) {
        removeGamepad(e.gamepad);
      }
    }]);

    return Gamepad;
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
      this.status$ = new rxjs.BehaviorSubject('disconnected');
      /**
       * Scene Information behavior subject.
       * Components can subscribe to it to get the scene information once it is obtained.
       */

      this.sceneInfo$ = new rxjs.BehaviorSubject({});
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
        this.status$.next('disconnected');
        this.sceneInfo$.next({});
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


                _this2.status$.next('connected');

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


          if (_this2.status$.getValue() === 'disconnected') {
            return;
          } // Decode as UTF-8 to get the header.


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
                _this2.sceneInfo$.next(msg); // Once we received the Scene Information, we can start working.
                // We emit the Ready status to reflect this.


                _this2.status$.next('ready');

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
        this.status$.next('error');
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

  var Scene = /*#__PURE__*/function () {
    function Scene() {
      _classCallCheck(this, Scene);

      /**
       * Connection status from the Websocket.
       */
      this.connectionStatus = 'disconnected';
      /**
       * List of 3d models.
       */

      this.models = [];
      this.transport = new Transport();
    }

    _createClass(Scene, [{
      key: "destroy",
      value: function destroy() {
        this.disconnect();

        if (this.cancelAnimation) {
          cancelAnimationFrame(this.cancelAnimation);
        }

        if (this.scene) {
          this.scene.cleanup();
        }
      }
    }, {
      key: "getConnectionStatus",
      value: function getConnectionStatus() {
        return this.connectionStatus;
      }
    }, {
      key: "disconnect",
      value: function disconnect() {
        // Remove the canvas. Helpful to disconnect and connect several times.
        this.sceneElement = window.document.getElementById('scene');

        if (this.sceneElement && this.sceneElement.childElementCount > 0) {
          this.sceneElement.removeChild(this.scene.scene.renderer.domElement);
        }

        this.transport.disconnect();
        this.sceneInfo = {};
        this.connectionStatus = 'disconnected'; // Unsubscribe from observables.

        if (this.sceneInfoSubscription) {
          this.sceneInfoSubscription.unsubscribe();
        }

        if (this.particleEmittersSubscription) {
          this.particleEmittersSubscription.unsubscribe();
        }

        if (this.statusSubscription) {
          this.statusSubscription.unsubscribe();
        }
      }
    }, {
      key: "connect",
      value: function connect(url, key) {
        var _this = this;

        this.transport.connect(url, key);
        this.statusSubscription = this.transport.status$.subscribe(function (response) {
          if (response === 'error') {
            // TODO: Return an error so the caller can open a snackbar
            console.log('Connection failed. Please contact an administrator.'); // this.snackBar.open('Connection failed. Please contact an administrator.', 'Got it');
          }

          _this.connectionStatus = response; // We can start setting up the visualization after we are Connected.
          // We still don't have scene and world information at this step.

          if (response === 'connected') {
            _this.setupVisualization();
          } // Once the status is Ready, we have the world and scene information
          // available.


          if (response === 'ready') {
            // Subscribe to the pose topic and modify the models' poses.
            var poseTopic = new Topic("/world/".concat(_this.transport.getWorld(), "/dynamic_pose/info"), function (msg) {
              msg['pose'].forEach(function (pose) {
                // Objects created by Gz3D have an unique name, which is the
                // name plus the id.
                var entity = _this.scene.getByName("".concat(pose['name']).concat(pose['id']));

                if (entity) {
                  _this.scene.setPose(entity, pose.position, pose.orientation);
                }
              });
            });

            _this.transport.subscribe(poseTopic); // create a sun light


            _this.sunLight = _this.scene.createLight(3, new THREE.Color(0.8, 0.8, 0.8), 0.9, {
              position: {
                x: 0,
                y: 0,
                z: 10
              },
              orientation: {
                x: 0,
                y: 0,
                z: 0,
                w: 1
              }
            }, null, true, 'sun', {
              x: 0.5,
              y: 0.1,
              z: -0.9
            });

            _this.scene.add(_this.sunLight);

            _this.scene.ambient.color = new THREE.Color(0x666666); // Subscribe to the 'scene/info' topic which sends scene changes.

            var sceneTopic = new Topic("/world/".concat(_this.transport.getWorld(), "/scene/info"), function (sceneInfo) {
              if (!sceneInfo) {
                return;
              } // Process each model in the scene.


              sceneInfo['model'].forEach(function (model) {
                // Check to see if the model already exists in the scene. This
                // could happen when a simulation level is loaded multiple times.
                var foundIndex = -1;

                for (var i = 0; i < _this.models.length; ++i) {
                  // Simulation enforces unique names between models. The ID
                  // of a model may change. This occurs when levels are loaded,
                  // unloaded, and then reloaded.
                  if (_this.models[i]['name'] === model['name']) {
                    foundIndex = i;
                    break;
                  }
                } // If the model was not found, then add the new model. Otherwise
                // update the models ID and gz3dName.


                if (foundIndex < 0) {
                  _this.scene.getByName();

                  var modelObj = _this.sdfParser.spawnFromObj({
                    model: model
                  }, {
                    enableLights: false
                  });

                  model['gz3dName'] = modelObj.name;

                  _this.models.push(model);

                  _this.scene.add(modelObj);
                } else {
                  // Make sure to update the exisiting models so that future pose
                  // messages can update the model.
                  _this.models[foundIndex]['gz3dName'] = "".concat(model['name']).concat(model['id']);
                  _this.models[foundIndex]['id'] = model['id'];
                }
              });
            });

            _this.transport.subscribe(sceneTopic);
          }
        }); // Scene information.

        this.sceneInfoSubscription = this.transport.sceneInfo$.subscribe(function (sceneInfo) {
          if (!sceneInfo) {
            return;
          }

          if ('sky' in sceneInfo && sceneInfo['sky']) {
            _this.scene.addSky();
          }

          _this.sceneInfo = sceneInfo;

          _this.startVisualization();

          sceneInfo['model'].forEach(function (model) {
            var modelObj = _this.sdfParser.spawnFromObj({
              model: model
            }, {
              enableLights: false
            });

            model['gz3dName'] = modelObj.name;

            _this.models.push(model);

            _this.scene.add(modelObj);
          });
          sceneInfo['light'].forEach(function (light) {
            var lightObj = _this.sdfParser.spawnLight(light);

            _this.scene.add(lightObj);
          }); // Set the ambient color, if present

          if (sceneInfo['ambient'] !== undefined && sceneInfo['ambient'] !== null) {
            _this.scene.ambient.color = new THREE.Color(sceneInfo['ambient']['r'], sceneInfo['ambient']['g'], sceneInfo['ambient']['b']);
          }
        });
      }
      /**
       * Setup the visualization scene.
       */

    }, {
      key: "setupVisualization",
      value: function setupVisualization() {
        var that = this; // Create a find asset helper

        function findAsset(_uri, _cb) {
          that.transport.getAsset(_uri, _cb);
        }

        this.scene = new GZ3D.Scene(new GZ3D.Shaders(), undefined, undefined, undefined, findAsset);
        this.sdfParser = new GZ3D.SdfParser(this.scene);
        this.sdfParser.usingFilesUrls = true;
        this.sceneElement = window.document.getElementById('gz-scene');
        this.sceneElement.appendChild(this.scene.renderer.domElement);
        this.scene.setSize(this.sceneElement.clientWidth, this.sceneElement.clientHeight);
      }
      /**
       * Start the visualization.
       */

    }, {
      key: "startVisualization",
      value: function startVisualization() {
        var _this2 = this;

        // Render loop.
        var animate = function animate() {
          _this2.scene.render();

          _this2.cancelAnimation = requestAnimationFrame(function () {
            animate();
          });
        };

        animate();
      }
      /**
       * Change the width and height of the visualization upon a resize event.
       */

    }, {
      key: "resize",
      value: function resize() {
        if (this.scene) {
          console.log('REsize', this.sceneElement.clientWidth, this.sceneElement.clientHeight);
          this.scene.setSize(this.sceneElement.clientWidth, this.sceneElement.clientHeight);
        }
      }
    }, {
      key: "snapshot",
      value: function snapshot() {
        if (this.scene) {
          this.scene.saveScreenshot(this.transport.getWorld());
        }
      }
    }, {
      key: "resetView",
      value: function resetView() {
        if (this.scene) {
          this.scene.resetView();
        }
      }
    }, {
      key: "follow",
      value: function follow(entityName) {
        if (this.scene) {
          this.scene.emitter.emit('follow_entity', entityName);
        }
      }
    }, {
      key: "moveTo",
      value: function moveTo(entityName) {
        if (this.scene) {
          this.scene.emitter.emit('move_to_entity', entityName);
        }
      }
    }, {
      key: "select",
      value: function select(entityName) {
        if (this.scene) {
          this.scene.emitter.emit('select_entity', entityName);
        }
      }
    }, {
      key: "getModels",
      value: function getModels() {
        return this.models;
      }
    }]);

    return Scene;
  }();

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
  exports.Gamepad = Gamepad;
  exports.Scene = Scene;
  exports.Topic = Topic;
  exports.Transport = Transport;
  exports.binaryToBase64 = binaryToBase64;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
