import { Subscription } from 'rxjs';
import { Topic } from './topic';
import { Transport } from './transport';

declare let GZ3D: any;
declare let THREE: any;

export class Scene {
  /**
   * Particle emitter updates.
   */
  public particleEmittersSubscription: Subscription;

  /**
   * Subscription for status updates.
   */
  public statusSubscription: Subscription;

  /**
   * Connection status from the Websocket.
   */
  public connectionStatus: string = 'disconnected';

  /**
   * Scene Information updates.
   */
  public sceneInfoSubscription: Subscription;

  /**
   * Scene information obtained from the Websocket.
   */
  public sceneInfo: object;

  /**
   * Gz3D Scene.
   */
  public scene: any;

  /**
   * List of 3d models.
   */
  public models: any[] = [];


  /**
   * A sun directional light for global illumination
   */
  private sunLight: object;

  private transport = new Transport();

  /**
   * ID of the Request Animation Frame method. Required to cancel the animation.
   */
  private cancelAnimation: number;

  /**
   * The container of the GZ3D scene.
   */
  private sceneElement: HTMLElement;

  /**
   * Gz3D SDF parser.
   */
  private sdfParser: any;

  constructor() {
  }

  public destroy(): void {
    this.disconnect();

    if (this.cancelAnimation) {
      cancelAnimationFrame(this.cancelAnimation);
    }

    if (this.scene) {
      this.scene.cleanup();
    }
  }

  public getConnectionStatus(): string {
    return this.connectionStatus;
  }

  public disconnect(): void {
    // Remove the canvas. Helpful to disconnect and connect several times.
    this.sceneElement = window.document.getElementById('scene');
    if (this.sceneElement && this.sceneElement.childElementCount > 0) {
      this.sceneElement.removeChild(this.scene.scene.renderer.domElement);
    }

    this.transport.disconnect();
    this.sceneInfo = {};
    this.connectionStatus = 'disconnected';

    // Unsubscribe from observables.
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

  public connect(url: string, key?: string): void {
    this.transport.connect(url, key);

    this.statusSubscription = this.transport.status$.subscribe((response) => {

      if (response === 'error') {
        // TODO: Return an error so the caller can open a snackbar
        console.log('Connection failed. Please contact an administrator.');
        // this.snackBar.open('Connection failed. Please contact an administrator.', 'Got it');
      }

      this.connectionStatus = response;

      // We can start setting up the visualization after we are Connected.
      // We still don't have scene and world information at this step.
      if (response === 'connected') {
        this.setupVisualization();
      }

      // Once the status is Ready, we have the world and scene information
      // available.
      if (response === 'ready') {    
        // Subscribe to the pose topic and modify the models' poses.
        const poseTopic = new Topic(
          `/world/${this.transport.getWorld()}/dynamic_pose/info`,
          (msg) => {
            msg['pose'].forEach((pose: any) => {
              // Objects created by Gz3D have an unique name, which is the
              // name plus the id.
              const entity = this.scene.getByName(
                `${pose['name']}${pose['id']}`);

              if (entity) {
                this.scene.setPose(entity, pose.position, pose.orientation);
              }
            });
          }
        );
        this.transport.subscribe(poseTopic);

        // create a sun light
        this.sunLight = this.scene.createLight(3,
          new THREE.Color(0.8, 0.8, 0.8), 0.9,
          {position: {x: 0, y: 0, z: 10},
           orientation: {x: 0, y: 0, z: 0, w: 1}},
          null, true, 'sun', {x: 0.5, y: 0.1, z: -0.9});

        this.scene.add(this.sunLight);
        this.scene.ambient.color = new THREE.Color(0x666666);


        // Subscribe to the 'scene/info' topic which sends scene changes.
        const sceneTopic = new Topic(
          `/world/${this.transport.getWorld()}/scene/info`,
          (sceneInfo) => {
            if (!sceneInfo) {
              return;
            }

            // Process each model in the scene.
            sceneInfo['model'].forEach((model: any) => {

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
              }

              // If the model was not found, then add the new model. Otherwise
              // update the models ID and gz3dName.
              if (foundIndex < 0) {
                const entity = this.scene.getByName();
                const modelObj = this.sdfParser.spawnFromObj({ model }, { enableLights: false });
                model['gz3dName'] = modelObj.name;
                this.models.push(model);
                this.scene.add(modelObj);
              } else {
                // Make sure to update the exisiting models so that future pose
                // messages can update the model.
                this.models[foundIndex]['gz3dName'] = `${model['name']}${model['id']}`;
                this.models[foundIndex]['id'] = model['id'];
              }
            });
          }
        );
        this.transport.subscribe(sceneTopic);
      }
    });

    // Scene information.
    this.sceneInfoSubscription = this.transport.sceneInfo$.subscribe((sceneInfo) => {
      if (!sceneInfo) {
        return;
      }

      if ('sky' in sceneInfo && sceneInfo['sky']) {
        this.scene.addSky();
      }
      this.sceneInfo = sceneInfo;
      this.startVisualization();

      sceneInfo['model'].forEach((model: any) => {
        const modelObj = this.sdfParser.spawnFromObj(
          { model }, { enableLights: false });

        model['gz3dName'] = modelObj.name;
        this.models.push(model);
        this.scene.add(modelObj);
      });

      sceneInfo['light'].forEach((light: any) => {
        const lightObj = this.sdfParser.spawnLight(light);
        this.scene.add(lightObj);
      });

      // Set the ambient color, if present
      if (sceneInfo['ambient'] !== undefined &&
          sceneInfo['ambient'] !== null) {
        this.scene.ambient.color = new THREE.Color(
          sceneInfo['ambient']['r'],
          sceneInfo['ambient']['g'],
          sceneInfo['ambient']['b']);
      }
    });
  }

  /**
   * Setup the visualization scene.
   */
  public setupVisualization(): void {

    var that = this;

    // Create a find asset helper
    function findAsset(_uri: string, _cb: any) {
      that.transport.getAsset(_uri, _cb);
    }

    this.scene = new GZ3D.Scene(new GZ3D.Shaders(), undefined, undefined,
                                undefined, findAsset);
    this.sdfParser = new GZ3D.SdfParser(this.scene);
    this.sdfParser.usingFilesUrls = true;

    this.sceneElement = window.document.getElementById('gz-scene');
    this.sceneElement.appendChild(this.scene.renderer.domElement);

    this.scene.setSize(this.sceneElement.clientWidth, this.sceneElement.clientHeight);
  }

  /**
   * Start the visualization.
   */
  public startVisualization(): void {
    // Render loop.
    const animate = () => {
      this.scene.render();
      this.cancelAnimation = requestAnimationFrame(() => {
        animate();
      });
    };

    animate();
  }

  /**
   * Change the width and height of the visualization upon a resize event.
   */
  public resize(): void {
    if (this.scene) {
      console.log('REsize',this.sceneElement.clientWidth,
                         this.sceneElement.clientHeight);
      this.scene.setSize(this.sceneElement.clientWidth,
                         this.sceneElement.clientHeight);
    }
  }

  public snapshot(): void {
    if (this.scene) {
      this.scene.saveScreenshot(this.transport.getWorld());
    }
  }

  public resetView(): void {
    if (this.scene) {
      this.scene.resetView();
    }
  }

  public follow(entityName: String): void {
    if (this.scene) {
      this.scene.emitter.emit('follow_entity', entityName);
    }
  }

  public moveTo(entityName: String): void {
    if (this.scene) {
      this.scene.emitter.emit('move_to_entity', entityName);
    }
  }

  public select(entityName: String): void {
    if (this.scene) {
      this.scene.emitter.emit('select_entity', entityName);
    }
  }

  public getModels(): any[] {
    return this.models;
  } 
}
