/**
 * Create a gamepad interface
 * @param {function} onButton - Function callback that accepts a button
 * object. This function is called when a button is pressed.
 * @param {function} onAxis - Function callback that accepts an axis
 * object. This function is called when a joystick axis is moved.
 */
export class Gamepad {

  private controllers = {};
  private onButtonCb: any = null;
  private onAxisCb: any = null;

  constructor(onButton: any, onAxis: any) {
    this.onButtonCb = onButton;
    this.onAxisCb = onAxis;

    // Listen for gamepad connections.
    window.addEventListener('gamepadconnected', handleGamepadConnect);
    // Listen for gamepad disconnections.
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnect);

    // Start the main processing event loop
    requestAnimationFrame(this.updateGamepads);
  }

  /** Main controller processing function. This function is called every
   * animation frame to poll for controller updates.
   */
  private updateGamepads() {
    // Scan for connected gamepads.
    this.scanGamepads();
  
    // Process each controller
    for (var c in this.controllers) {
      var controller = this.controllers[c];
  
      // Poll each button
      for (var b = 0; b < controller.gamepad.buttons.length; b++) {
        var button = controller.gamepad.buttons[b];
  
        if (controller.prevButtons[b] !== button.pressed) {
            this.onButtonCb({'index': b, 'pressed': button.pressed});
        }
        controller.prevButtons[b] = button.pressed;
      }
  
      // Poll each axis
      for (var i = 0; i < controller.gamepad.axes.length; i += 2) {
        if (controller.prevAxes[i] !== controller.gamepad.axes[i] ||
            controller.prevAxes[i+1] !== controller.gamepad.axes[i+1]) {
          this.onAxisCb({'index': (i/2).toFixed(0),
                    'x': controller.gamepad.axes[i],
                    'y': controller.gamepad.axes[i+1]});
        }
        controller.prevAxes[i] = controller.gamepad.axes[i];
        controller.prevAxes[i+1] = controller.gamepad.axes[i+1];
      }
    }
  
    requestAnimationFrame(updateGamepads);
  }
  
  /**
   * Poll for controllers. Some browsers use connection events, and others
   * require polling.
   */
  public scanGamepads(): void {
    var gamepads = navigator.getGamepads();
    for (var i = 0; i < gamepads.length; i++) {
      this.addGamepad(gamepads[i]);
    }
  }
  
  /** Adds or updates a gamepad to the list of controllers.
   * @param {object} The gamepad to add/update
   */
  public addGamepad(gamepad: any): void {
    if (gamepad) {
      if (!(gamepad.index in this.controllers)) {
        console.log('Adding gamepad', gamepad.id);
        this.controllers[gamepad.index] = {
          gamepad: gamepad,
          prevButtons: new Array(gamepad.buttons.length),
          prevAxes: new Array(gamepad.axes.length)
        };
  
        // Set button initial state
        for (var b = 0; b < gamepad.buttons.length; b++) {
          this.controllers[gamepad.index].prevButtons[b] = false;
        }
  
        // Set axes initial state
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
  public removeGamepad(gamepad: any) {
    if (gamepad && gamepad.index in this.controllers) {
      delete this.controllers[gamepad.index];
    }
  }
  
  /** Gamepad connect callback handler
   * @param {event} The gamepad connect event.
   */
  public handleGamepadConnect(e: any): void {
    addGamepad(e.gamepad);
  }
  
  /** Gamepad disconnect callback handler
   * @param {event} The gamepad disconnect event.
   */
  public handleGamepadDisconnect(e: any): void {
    removeGamepad(e.gamepad);
  }
}
