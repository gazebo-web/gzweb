(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('rxjs'), require('protobufjs')) :
    typeof define === 'function' && define.amd ? define(['exports', 'rxjs', 'protobufjs'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.gzweb = {}, global.rxjs, global.protobufjs));
})(this, (function (exports, rxjs, protobufjs) { 'use strict';

    /**
     * Type that represents a simulation asset that needs to be fetched from a websocket server.
     */
    class Asset {
      constructor(uri, cb) {
        this.uri = uri;
        this.cb = cb;
      }

    }

    let controllers = {};
    let onButtonCb = null;
    let onAxisCb = null;
    /**
     * Create a gamepad interface
     * @param {function} onButton - Function callback that accepts a controller
     * object and a button object. This function is called when a button is pressed.
     * @param {function} onAxis - Function callback that accepts a controller
     * object and an axis object. This function is called when a joystick axis is moved.
     */

    class Gamepad {
      constructor(onButton, onAxis) {
        onButtonCb = onButton;
        onAxisCb = onAxis; // Listen for gamepad connections.

        window.addEventListener('gamepadconnected', handleGamepadConnect); // Listen for gamepad disconnections.

        window.addEventListener('gamepaddisconnected', handleGamepadDisconnect); // Start the main processing event loop

        requestAnimationFrame(updateGamepads);
      }

    }
    /** Main controller processing function. This function is called every
     * animation frame to poll for controller updates.
     */

    function updateGamepads() {
      // Scan for connected gamepads.
      scanGamepads(); // Process each controller

      for (var c in controllers) {
        let controller = controllers[c]; // Poll each button

        for (let b = 0; b < controller.gamepad.buttons.length; b++) {
          let button = controller.gamepad.buttons[b];

          if (controller.prevButtons[b] !== button.pressed) {
            // Note that we update the button *before* we call the user callback.
            // That's so that the user callback can, at its option, get the complete
            // current state of the controller by looking at the prevButtons.
            controller.prevButtons[b] = button.pressed;
            onButtonCb(controller, {
              'index': b,
              'pressed': button.pressed
            });
          }
        } // Poll each axis


        for (let i = 0; i < controller.gamepad.axes.length; i++) {
          let axis = controller.gamepad.axes[i];

          if (controller.prevAxes[i] !== axis) {
            // Note that we update the axis *before* we call the user callback.
            controller.prevAxes[i] = axis;
            onAxisCb(controller, {
              'index': i,
              'axis': axis
            });
          }
        }
      }

      requestAnimationFrame(updateGamepads);
    }
    /**
     * Poll for controllers. Some browsers use connection events, and others
     * require polling.
     */


    function scanGamepads() {
      var gamepads = navigator.getGamepads();

      for (var i = 0; i < gamepads.length; i++) {
        addGamepad(gamepads[i]);
      }
    }
    /** Adds or updates a gamepad to the list of controllers.
     * @param {object} The gamepad to add/update
     */


    function addGamepad(gamepad) {
      if (gamepad) {
        if (!(gamepad.index in controllers)) {
          console.log('Adding gamepad', gamepad.id);
          controllers[gamepad.index] = {
            gamepad: gamepad,
            prevButtons: new Array(gamepad.buttons.length),
            prevAxes: new Array(gamepad.axes.length)
          }; // Set button initial state

          for (var b = 0; b < gamepad.buttons.length; b++) {
            controllers[gamepad.index].prevButtons[b] = false;
          } // Set axes initial state


          for (var a = 0; a < gamepad.axes.length; a++) {
            controllers[gamepad.index].prevAxes[a] = 0.0;
          }
        } else {
          controllers[gamepad.index].gamepad = gamepad;
        }
      }
    }
    /** Removes a gamepad from the list of controllers
     * @param {object} The gamepad to remove
     */


    function removeGamepad(gamepad) {
      if (gamepad && gamepad.index in controllers) {
        delete controllers[gamepad.index];
      }
    }
    /** Gamepad connect callback handler
     * @param {event} The gamepad connect event.
     */


    function handleGamepadConnect(e) {
      addGamepad(e.gamepad);
    }
    /** Gamepad disconnect callback handler
     * @param {event} The gamepad disconnect event.
     */


    function handleGamepadDisconnect(e) {
      removeGamepad(e.gamepad);
    }

    /**
     * Type that represents a topic to be subscribed. This allows communication between Components and
     * the Websocket service of a Simulation.
     */
    class Topic {
      constructor(name, cb) {
        this.name = name;
        this.cb = cb;
      }

    }

    /**
     * The Trasnport class is in charge of managing the websocket connection to a
     * Gazebo websocket server.
     */

    class Transport {
      constructor() {
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

        this.sceneInfo$ = new rxjs.BehaviorSubject(null);
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


      connect(url, key) {
        // First, disconnect from previous connections.
        // This way we make sure that we only support one websocket connection.
        this.disconnect(); // Create the Websocket interface.

        this.ws = new WebSocket(url); // Set the handlers of the websocket events.

        this.ws.onopen = () => this.onOpen(key);

        this.ws.onclose = () => this.onClose();

        this.ws.onmessage = msgEvent => this.onMessage(msgEvent);

        this.ws.onerror = errorEvent => this.onError(errorEvent);
      }
      /**
       * Disconnects from a websocket.
       * Note: The cleanup should be done in the onclose event of the Websocket.
       */


      disconnect() {
        if (this.ws) {
          this.ws.close();
        }
      }
      /**
       * Subscribe to a topic.
       *
       * @param topic The topic to subscribe to.
       */


      subscribe(topic) {
        this.topicMap.set(topic.name, topic);
        const publisher = this.availableTopics.filter(pub => pub['topic'] === topic.name)[0];

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


      unsubscribe(name) {
        if (this.topicMap.has(name)) {
          const topic = this.topicMap.get(name);

          if (topic !== undefined && topic.unsubscribe !== undefined) {
            topic.unsubscribe();
          }

          this.topicMap.delete(name);
          this.ws.send(this.buildMsg(['unsub', name, '', '']));
        }
      }
      /**
       * throttle the rate at which messages are published on a topic.
       *
       * @param topic The topic to throttle.
       * @param rate Publish rate.
       */


      throttle(topic, rate) {
        this.ws.send(this.buildMsg(['throttle', topic.name, 'na', rate.toString()]));
      }
      /**
       * Return the list of available topics.
       *
       * @returns The list of topics that can be subscribed to.
       */


      getAvailableTopics() {
        return this.availableTopics;
      }
      /**
       * Return the list of subscribed topics.
       *
       * @returns A map containing the name and message type of topics that we are currently
       *          subscribed to.
       */


      getSubscribedTopics() {
        return this.topicMap;
      }
      /**
       * Return the world.
       *
       * @returns The name of the world the websocket is connected to.
       */


      getWorld() {
        return this.world;
      }
      /**
       * Get an asset from Gazebo
       */


      getAsset(_uri, _cb) {
        let asset = {
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


      onOpen(key) {
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


      onClose() {
        this.topicMap.clear();
        this.availableTopics = [];
        this.root = null;
        this.status$.next('disconnected');
        this.sceneInfo$.next(null);
      }
      /**
       * Handler for the message event of a Websocket.
       *
       * Parses message responses from Gazebo and sends to the corresponding topic.
       */


      onMessage(event) {
        // If there is no Root, then handle authentication and the message definitions.
        const fileReader = new FileReader();

        if (!this.root) {
          fileReader.onloadend = () => {
            const content = fileReader.result; // Handle the response.

            switch (content) {
              case 'authorized':
                // Get the message definitions.
                this.ws.send(this.buildMsg(['protos', '', '', '']));
                break;

              case 'invalid':
                // TODO(germanmas) Throw a proper Unauthorized error.
                console.error('Invalid key');
                break;

              default:
                // Parse the message definitions.
                this.root = protobufjs.parse(fileReader.result, {
                  keepCase: true
                }).root; // Request topics.

                this.ws.send(this.buildMsg(['topics-types', '', '', ''])); // Request world information.

                this.ws.send(this.buildMsg(['worlds', '', '', ''])); // Now we can update the connection status.

                this.status$.next('connected');
                break;
            }
          };

          fileReader.readAsText(event.data);
          return;
        }

        fileReader.onloadend = () => {
          var _a, _b, _c, _d;

          if (!this.root) {
            console.error("Protobuf root has not been created");
            return;
          } // Return if at any point, the websocket connection is lost.


          if (this.status$.getValue() === 'disconnected') {
            return;
          } // Decode as UTF-8 to get the header.


          const str = new TextDecoder('utf-8').decode(fileReader.result);
          const frameParts = str.split(',');
          const msgType = this.root.lookup(frameParts[2]);
          const buffer = new Uint8Array(fileReader.result); // Decode the Message. The "+3" in the slice accounts for the commas in the frame.

          let msg; // get the actual msg payload without the header

          const msgData = buffer.slice(frameParts[0].length + frameParts[1].length + frameParts[2].length + 3); // do not decode image msg as it is raw compressed png data and not a
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
            if (this.assetMap.has(frameParts[1])) {
              (_b = (_a = this === null || this === void 0 ? void 0 : this.assetMap) === null || _a === void 0 ? void 0 : _a.get(frameParts[1])) === null || _b === void 0 ? void 0 : _b.cb(msg['data']);
            } else {
              console.error('No resource callback');
            }
          } else if (frameParts[0] == 'pub') {
            // Handle actions and messages.
            switch (frameParts[1]) {
              case 'topics-types':
                for (const pub of msg['publisher']) {
                  this.availableTopics.push(pub);
                }

                break;

              case 'topics':
                this.availableTopics = msg['data'];
                break;

              case 'worlds':
                // The world name needs to be used to get the scene information.
                this.world = msg['data'][0];
                this.ws.send(this.buildMsg(['scene', this.world, '', '']));
                break;

              case 'scene':
                // Emit the scene information. Contains all the models used.
                this.sceneInfo$.next(msg); // Once we received the Scene Information, we can start working.
                // We emit the Ready status to reflect this.

                this.status$.next('ready');
                break;

              default:
                // Message from a subscribed topic. Get the topic and execute its
                // callback.
                if (this.topicMap.has(frameParts[1])) {
                  (_d = (_c = this === null || this === void 0 ? void 0 : this.topicMap) === null || _c === void 0 ? void 0 : _c.get(frameParts[1])) === null || _d === void 0 ? void 0 : _d.cb(msg);
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


      onError(event) {
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


      buildMsg(parts) {
        return parts.join(',');
      }

    }

    /**
     * SceneManager handles the interface between a Gazebo server and the
     * rendering scene. A user of gzweb will typically create a SceneManager and
     * then connect the SceneManager to a Gazebo server's websocket.
     *
     * This example will connect to a Gazebo server's websocket at WS_URL, and
     * start the rendering process. Rendering output will be placed in the HTML
     * element with the id ELEMENT_ID
     *
     * ```
     * let sceneMgr = new SceneManager(ELEMENT_ID, WS_URL, WS_KEY);
     * ```
     */

    class SceneManager {
      /**
       * Constructor. If a url is specified, then then SceneManager will connect
       * to the specified websocket server. Otherwise, the `connect` function
       * should be called after construction.
       *
       * @param elemId The id of the HTML element that will hold the rendering
       * context. If not specified, the id gz-scene will be used.
       * @param url An optional websocket url that points to a Gazebo server.
       * @param key An optional authentication key.
       */
      constructor(elemId, url, key) {
        /**
         * Connection status from the Websocket.
         */
        this.connectionStatus = 'disconnected';
        /**
         * List of 3d models.
         */

        this.models = [];
        /**
         * A Transport interface used to connect to a Gazebo server.
         */

        this.transport = new Transport();
        /**
         * Name of the HTML element that will hold the rendering scene.
         */

        this.elementId = 'gz-scene';

        if (typeof elemId !== 'undefined') {
          this.elementId = elemId;
        }

        if (typeof url !== 'undefined') {
          this.connect(url, key);
        }
      }
      /**
       * Destrory the scene
       */


      destroy() {
        this.disconnect();

        if (this.cancelAnimation) {
          cancelAnimationFrame(this.cancelAnimation);
        }

        if (this.scene) {
          this.scene.cleanup();
        }
      }
      /**
       * Get the current connection status to a Gazebo server.
       */


      getConnectionStatus() {
        return this.connectionStatus;
      }
      /**
       * Change the width and height of the visualization upon a resize event.
       */


      resize() {
        if (this.scene) {
          this.scene.setSize(this.sceneElement.clientWidth, this.sceneElement.clientHeight);
        }
      }

      snapshot() {
        if (this.scene) {
          this.scene.saveScreenshot(this.transport.getWorld());
        }
      }

      resetView() {
        if (this.scene) {
          this.scene.resetView();
        }
      }

      follow(entityName) {
        if (this.scene) {
          this.scene.emitter.emit('follow_entity', entityName);
        }
      }

      moveTo(entityName) {
        if (this.scene) {
          this.scene.emitter.emit('move_to_entity', entityName);
        }
      }

      select(entityName) {
        if (this.scene) {
          this.scene.emitter.emit('select_entity', entityName);
        }
      }
      /**
       * Get the list of models in the scene
       * @return The list of available models.
       */


      getModels() {
        return this.models;
      }
      /**
       * Disconnect from the Gazebo server
       */


      disconnect() {
        // Remove the canvas. Helpful to disconnect and connect several times.
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
      /**
       * Connect to a Gazebo server
       * @param url A websocket url that points to a Gazebo server.
       * @param key An optional authentication key.
       */


      connect(url, key) {
        this.transport.connect(url, key);
        this.statusSubscription = this.transport.status$.subscribe(response => {
          if (response === 'error') {
            // TODO: Return an error so the caller can open a snackbar
            console.log('Connection failed. Please contact an administrator.'); // this.snackBar.open('Connection failed. Please contact an administrator.', 'Got it');
          }

          this.connectionStatus = response; // We can start setting up the visualization after we are Connected.
          // We still don't have scene and world information at this step.

          if (response === 'connected') {
            this.setupVisualization();
          } // Once the status is ready, we have the world and scene information
          // available.


          if (response === 'ready') {
            this.subscribeToTopics(); // create a sun light

            /*this.sunLight = this.scene.createLight(3,
              new THREE.Color(0.8, 0.8, 0.8), 0.9,
              {position: {x: 0, y: 0, z: 10},
               orientation: {x: 0, y: 0, z: 0, w: 1}},
              null, true, 'sun', {x: 0.5, y: 0.1, z: -0.9});
                     this.scene.add(this.sunLight);
            this.scene.ambient.color = new THREE.Color(0x666666);
            */
          }
        }); // Scene information.

        this.sceneInfoSubscription = this.transport.sceneInfo$.subscribe(sceneInfo => {
          if (!sceneInfo) {
            return;
          }

          if ('sky' in sceneInfo && sceneInfo['sky']) {
            this.scene.addSky();
          }

          this.sceneInfo = sceneInfo;
          this.startVisualization();
          sceneInfo['model'].forEach(model => {
            const modelObj = this.sdfParser.spawnFromObj({
              model
            }, {
              enableLights: false
            });
            console.log('Adding model', model);
            model['gz3dName'] = modelObj.name;
            this.models.push(model);
            this.scene.add(modelObj);
          });
          sceneInfo['light'].forEach(light => {
            const lightObj = this.sdfParser.spawnLight(light);
            this.scene.add(lightObj);
          }); // Set the ambient color, if present

          if (sceneInfo['ambient'] !== undefined && sceneInfo['ambient'] !== null) {
            this.scene.ambient.color = new THREE.Color(sceneInfo['ambient']['r'], sceneInfo['ambient']['g'], sceneInfo['ambient']['b']);
          }
        });
      }
      /**
       * Subscribe to Gazebo topics required to render a scene. This include
       * /world/WORLD_NAME/dynamic_pose/info and /world/WORLD_NAME/scene/info
       */


      subscribeToTopics() {
        // Subscribe to the pose topic and modify the models' poses.
        const poseTopic = new Topic(`/world/${this.transport.getWorld()}/dynamic_pose/info`, msg => {
          msg['pose'].forEach(pose => {
            let entityName = `${pose['name']}${pose['id']}`; // Objects created by Gz3D have an unique name, which is the
            // name plus the id.

            const entity = this.scene.getByName(entityName);

            if (entity) {
              if (pose['name'] === 'box' && pose['position']['z'] > 1) {
                console.log('Box pose', pose);
              }

              this.scene.setPose(entity, pose.position, pose.orientation);
            } else {
              console.warn('Unable to find entity with name ', entityName);
            }
          });
        });
        this.transport.subscribe(poseTopic); // Subscribe to the 'scene/info' topic which sends scene changes.

        const sceneTopic = new Topic(`/world/${this.transport.getWorld()}/scene/info`, sceneInfo => {
          if (!sceneInfo) {
            return;
          } // Process each model in the scene.


          sceneInfo['model'].forEach(model => {
            // Check to see if the model already exists in the scene. This
            // could happen when a simulation level is loaded multiple times.
            let foundIndex = -1;

            for (let i = 0; i < this.models.length; ++i) {
              // Simulation enforces unique names between models. The ID
              // of a model may change. This occurs when levels are loaded,
              // unloaded, and then reloaded.
              if (this.models[i]['name'] === model['name']) {
                foundIndex = i;
                break;
              }
            } // If the model was not found, then add the new model. Otherwise
            // update the models ID and gz3dName.


            if (foundIndex < 0) {
              this.scene.getByName();
              const modelObj = this.sdfParser.spawnFromObj({
                model
              }, {
                enableLights: false
              });
              model['gz3dName'] = modelObj.name;
              console.log('Adding model', model);
              this.models.push(model);
              this.scene.add(modelObj);
            } else {
              // Make sure to update the exisiting models so that future pose
              // messages can update the model.
              this.models[foundIndex]['gz3dName'] = `${model['name']}${model['id']}`;
              this.models[foundIndex]['id'] = model['id'];
            }
          });
        });
        this.transport.subscribe(sceneTopic);
      }
      /**
       * Setup the visualization scene.
       */


      setupVisualization() {
        var that = this; // Create a find asset helper

        function findAsset(_uri, _cb) {
          that.transport.getAsset(_uri, _cb);
        }

        this.scene = new GZ3D.Scene(new GZ3D.Shaders(), undefined, undefined, undefined, findAsset);
        this.sdfParser = new GZ3D.SdfParser(this.scene);
        this.sdfParser.usingFilesUrls = true;

        if (window.document.getElementById(this.elementId)) {
          this.sceneElement = window.document.getElementById(this.elementId);
        } else {
          console.error('Unable to find HTML element with an id of', this.elementId);
        }

        this.sceneElement.appendChild(this.scene.renderer.domElement);
        this.scene.setSize(this.sceneElement.clientWidth, this.sceneElement.clientHeight);
      }
      /**
       * Start the visualization rendering loop.
       */


      startVisualization() {
        // Render loop.
        const animate = () => {
          this.scene.render();
          this.cancelAnimation = requestAnimationFrame(() => {
            animate();
          });
        };

        animate();
      }

    }

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
    exports.SceneManager = SceneManager;
    exports.Topic = Topic;
    exports.Transport = Transport;
    exports.binaryToBase64 = binaryToBase64;

    Object.defineProperty(exports, '__esModule', { value: true });

}));
