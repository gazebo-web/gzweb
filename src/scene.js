import {
  AmbientLight,
  Box3,
  BoxGeometry,
  BufferGeometry,
  Clock,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DirectionalLightHelper,
  Euler,
  FileLoader,
  GridHelper,
  Group,
  Light,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  MOUSE,
  Object3D,
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Raycaster,
  RepeatWrapping,
  RGBAFormat,
  Scene as ThreeScene,
  SmoothShading,
  SphereGeometry,
  SpotLight,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EventEmitter2 } from 'eventemitter2';
import { JSZip } from 'jszip';

import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { ColladaLoader } from './loaders/ColladaLoader';
import { OBJLoader } from './loaders/OBJLoader';
import { BoxHelper } from 'three';

/**
 * The scene is where everything is placed, from objects, to lights and cameras.
 */
export class Scene {
  constructor(shaders) {
    this.emitter = new EventEmitter2({verboseMemoryLeak: true});
    this.shaders = shaders;

    // Set the default camera position value.
    this.defaultCameraPosition = new Vector3(0, -5, 5);

    // Set the default camera look at value.
    this.defaultCameraLookAt = new Vector3(0, 0, 0);

    // Setting the default value of background color.
    this.backgroundColor = new Color(0xb2b2b2);

    this.simpleShapesMaterial = new MeshPhongMaterial({color:0xffffff, flatShading: SmoothShading});

    // Listens on select_entity, follow_entity and move_to_entity events.
    this.handleSignals();

    this.init();
  }

  /**
   * Listens on events and handle their signals.
   * 
   */
  handleSignals = () => {

    // Events
    this.selectEntityEvent = 'select_entity';
    this.followEntityEvent = 'follow_entity';
    this.moveToEntityEvent = 'move_to_entity';

    /**
     * Handle entity selection signal ('select_entity').
     * @param {string} entityName The name of the entity to select.
     */
    this.emitter.on(this.selectEntityEvent, (entityName) => {
      const object = this.scene.getObjectByName(entityName);
      if (object !== undefined && object !== null) {
        this.selectEntity(object);
      }
    });

    /**
     * Handle the follow entity follow signal ('follow_entity').
     * @param {string} entityName Name of the entity. Pass in null or an empty
     * string to stop following.
     */
    this.emitter.on(this.followEntityEvent, (entityName) => {
      // Turn off following if `entity` is null.
      if (entityName === undefined || entityName === null) {
        this.cameraMode = '';
        return;
      }

      const object = this.scene.getObjectByName(entityName);

      if (object !== undefined && object !== null) {
        // Set the object to track.
        this.cameraTrackObject = object;

        // Set the camera mode.
        this.cameraMode = this.followEntityEvent;
      }
    });

    /**
     * Handle move to entity signal ('move_to_entity').
     * @param {string} entityName: Name of the entity.
     */
    this.emitter.on(this.moveToEntityEvent, (entityName) => {
      const obj = this.scene.getObjectByName(entityName);
      if (obj === undefined || obj === null) {
        return;
      }

      // Starting position of the camera.
      const startPos = new Vector3();
      this.camera.getWorldPosition(startPos);

      // Center of the target to move to.
      const targetCenter = new Vector3();
      obj.getWorldPosition(targetCenter);

      // Calculate direction from start to target
      const dir = new Vector3();
      dir.subVectors(targetCenter, startPos);
      dir.normalize();

      // Distance from start to target.
      const dist = startPos.distanceTo(targetCenter);

      // Get the bounding box size of the target object.
      const bboxSize = new Vector3();
      const bbox = getObjectBoundingBox(obj);
      bbox.getSize(bboxSize);
      const max = Math.max(bboxSize.x, bboxSize.y, bboxSize.z);

      // Compute an offset such that the object's bounding box will fix in the
      // view. I've padded this out a bit by multiplying `max` by 0.75 instead
      // of 0.5
      const offset = (max * 0.75) / Math.tan((this.camera.fov * Math.PI/180.0) / 2.0);
      const endPos = dir.clone().multiplyScalar(dist-offset);
      endPos.add(startPos);

      // Make sure that the end position is above the object so that the
      // camera will look down at it.
      if (endPos.z <= (targetCenter.z + max)) {
        endPos.z += max;
      }

      // Compute the end orientation.
      const endRotMat = new Matrix4();
      endRotMat.lookAt(endPos, targetCenter, new Vector3(0, 0, 1));

      // Start the camera moving.
      this.cameraMode = this.moveToEntityEvent;
      this.cameraMoveToClock.start();
      this.cameraLerpStart.copy(startPos);
      this.cameraLerpEnd.copy(endPos);
      this.camera.getWorldQuaternion(this.cameraSlerpStart);
      this.cameraSlerpEnd.setFromRotationMatrix(endRotMat);
    });
  }

  /**
  * Initialize scene.
  */
  init = () => {
    this.name = 'default';
    this.scene = new ThreeScene();
    this.meshes = {};
    this.selectedEntity = null;
    this.showCollisions = false;

    // Renderer
    this.renderer = new WebGLRenderer({antialias: true});
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(this.backgroundColor);
    this.renderer.autoClear = false;

    // Camera
    const width = this.getDomElement().width;
    const height = this.getDomElement().height;
    this.camera = new PerspectiveCamera(60, width / height, 0.01, 1000);
    this.resetView();

    // move_to_entity event related camera variables.
    // Clock used to time the camera 'move_to' motion.
    this.cameraMoveToClock = new Clock(false);

    // Start position of the camera's 'move_to'
    this.cameraLerpStart = new Vector3();

    // End position of the camera's 'move_to'
    this.cameraLerpEnd = new Vector3();

    // Start orientation of the camera's 'move_to'
    this.cameraSlerpStart = new Quaternion();

    // End orientation of the camera's 'move_to'
    this.cameraSlerpEnd = new Quaternion();

    // Object the camera should track.
    this.cameraTrackObject = null;

    // Current camera mode. Empty indicates standard orbit camera.
    // Can be an empty string or the values of followEntityEvent or moveToEntityEvent.
    this.cameraMode = '';

    // Add a default ambient value. This is equivalent to
    // {r: 0.1, g: 0.1, b: 0.1}.
    this.ambient = new AmbientLight(0x191919);
    this.scene.add(this.ambient);

    // Particle group to render.
    this.particleGroup = null;

    // Grid
    this.grid = new GridHelper(20, 20, 0xCCCCCC, 0x4D4D4D);
    this.grid.name = 'grid';
    this.grid.position.z = 0.05;
    this.grid.rotation.x = Math.PI * 0.5;
    this.grid.castShadow = false;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.5;
    this.grid.visible = false;
    this.scene.add(this.grid);

    // Create a ray caster
    this.ray = new Raycaster();

    // Bounding Box
    this.boundingBox = new BoxHelper();
    this.boundingBox.visible = false;

    // Controls
    this.orbitControls = new OrbitControls(this.camera, this.getDomElement());
    this.orbitControls.enableDamping = false;
    this.orbitControls.screenSpacePanning = true;
    this.orbitControls.mouseButtons = {
      LEFT: MOUSE.PAN,
      MIDDLE: MOUSE.ROTATE,
      RIGHT: MOUSE.DOLLY
    };

    /**
     * Loaders and related events.
     */

    // Loaders
    this.textureLoader = new TextureLoader();
    this.textureLoader.crossOrigin = '';
    this.colladaLoader = new ColladaLoader();
    this.stlLoader = new STLLoader();
    this.objLoader = new OBJLoader();

    // Loader events
    const progress = (url, items, total) => {
      this.emitter.emit('load_progress', url, items, total);
    };
    this.textureLoader.manager.onProgress = progress;
    this.colladaLoader.manager.onProgress = progress;
    this.stlLoader.manager.onProgress = progress;

    const load = () => {
      this.emitter.emit('load_finished');
    };
    this.textureLoader.manager.onLoad = load;
    this.colladaLoader.manager.onLoad = load;
    this.stlLoader.manager.onLoad = load;

    // Mouse-related events.
    this.getDomElement().addEventListener(
      'mousedown',
      (event) => {
        this.onPointerDown(event);
      },
      false
    );

    this.getDomElement().addEventListener(
      'touchstart',
      (event) => {
        this.onPointerDown(event);
      },
      false
    );
  };

  /**
   * Render scene
   */
  render = () => {
    this.orbitControls.update();

    // If 'follow_entity' mode, then track the specifiec object.
    if (this.cameraMode === this.followEntityEvent) {
      // Using a hard-coded offset for now.
      const relativeCameraOffset = new Vector3(-5,0,2);
      this.cameraTrackObject.updateMatrixWorld();
      const cameraOffset = relativeCameraOffset.applyMatrix4(this.cameraTrackObject.matrixWorld);
      this.camera.position.lerp(cameraOffset, 0.1);
      this.camera.lookAt(this.cameraTrackObject.position);
    } else if (this.cameraMode === this.moveToEntityEvent) {
      // Move the camera if 'lerping' to an object.
      // Compute the lerp factor.
      const lerp = this.cameraMoveToClock.getElapsedTime() / 2.0;

      // Stop the clock if the camera has reached it's target
      //if (Math.abs(1.0 - lerp) <= 0.005) {
      if (lerp >= 1.0) {
        this.cameraMoveToClock.stop();
        this.cameraMode = '';
      } else {
        // Move the camera's position.
        this.camera.position.lerpVectors(this.cameraLerpStart, this.cameraLerpEnd, lerp);

        // Move the camera's orientation.
        Quaternion.slerp(this.cameraSlerpStart, this.cameraSlerpEnd, this.camera.quaternion, lerp);
      }
    }

    if (this.particleGroup) {
      const clock = new Clock();
      this.particleGroup.tick( clock.getDelta() );
    }

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    this.renderer.clearDepth();
  };

  /**
   * Set the background color.
   * @param {Color} backgroundColor
   */
  setBackgroundColor = (backgroundColor) => {
    this.backgroundColor.copy(backgroundColor);
  };
  
  /**
   * Set the camera position.
   * @param {Vector3} cameraPosition
   */
  setCameraPosition = (cameraPosition) => {
    this.camera.position.copy(cameraPosition);
  };

  /**
   * Set the camera Look At.
   * @param {Vector3} cameraLookAt
   */
  setCameraLookAt = (cameraLookAt) => {
    this.camera.lookAt(cameraLookAt);
  };

  /**
   * Get the renderer's DOM element
   * @returns {domElement}
   */
  getDomElement = () => {
    return this.renderer.domElement;
  };

  /**
   * Set scene size.
   * @param {double} width
   * @param {double} height
   */
  setSize = (width, height) => {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.render();
  };

  /**
   * Toggle light visibility for the given entity. This will turn on/off
   * all lights that are children of the provided entity.
   * @param {string} Name of a THREE.Object3D.
   */
  toggleLights = (entityName) => {
    /* Helper function to enable all child lights */
    function enableLightsHelper(obj) {
      if (obj === null || obj === undefined) {
        return;
      }

      if (obj.userData.hasOwnProperty('type') && obj.userData.type === 'light') {
        obj.visible = !obj.visible;
      }
    }

    if (entityName === undefined || entityName === null) {
      return;
    }

    // Find the object and set the lights.
    const object = this.scene.getObjectByName(entityName);
    if (object !== null && object !== undefined) {
      object.traverse(enableLightsHelper);
    }
  };

  /**
   * Reset view
   */
  resetView = () => {
    this.camera.position.copy(this.defaultCameraPosition);
    this.camera.up = new Vector3(0, 0, 1);
    this.camera.lookAt(this.defaultCameraLookAt);
    this.camera.updateMatrix();
  };

  /**
   * Dispose all the resources used by the scene.
   * This should be called whenever the visualization stops, in order to free resources.
   * See: https://threejs.org/docs/index.html#manual/en/introduction/How-to-dispose-of-objects
   */
  cleanup = () => {
    const objects = [];
    this.scene.traverse((obj) => {
      if (obj !== this.scene) {
        objects.push(obj);
      }
    });

    objects.forEach((obj) => {
      this.scene.remove(obj);

      // Dispose geometries.
      if (obj.geometry) {
        obj.geometry.dispose();
      }

      // Dispose materials and their textures.
      if (obj.material) {
        // Materials can be an array. If there is only one, convert it to an array for easier
        // handling.
        if (!(obj.material instanceof Array)) {
          obj.material = [obj.material];
        }

        // Materials can have different texture maps, depending on their type.
        // We check each property of the Material and dispose them if they are Textures.
        obj.material.forEach((material) => {
          Object.keys(material).forEach((property) => {
            if (material[property] instanceof Texture) {
              material[property].dispose();
            }
          });
          material.dispose();
        });
      }
    });

    // Clean scene and renderer.
    this.scene = null;
    this.camera = null;

    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer = null;
  };

  /**
   * Add a Particle Group to render. It is required to calculate the values of
   * particles during each cycle.
   *
   * @param {SPE.Group} particleGroup - A SPE Particle Group to render.
   */
  addParticleGroup = (particleGroup) => {
    this.particleGroup = particleGroup;
  };

  /**
   * Add object to the scene
   * @param {THREE.Object3D} model
   */
  add = (model) => {
    model.viewAs = 'normal';
    this.scene.add(model);
  };

  /**
   * Remove object from the scene
   * @param {THREE.Object3D} model
   */
  remove = (model) => {
    this.scene.remove(model);
  };

  /**
   * Returns the object which has the given name
   * @param {string} name
   * @returns {THREE.Object3D} model
   */
  getByName = (name) => {
    return this.scene.getObjectByName(name);
  };

  /**
   * Returns the object which has the given property value
   * @param {string} property name to search for
   * @param {string} value of the given property
   * @returns {THREE.Object3D} model
   */
  getByProperty = (property, value) => {
    return this.scene.getObjectByProperty(property, value);
  };

  /**
   * Set a model's pose
   * @param {THREE.Object3D} model
   * @param {} position
   * @param {} orientation
   */
  setPose = (model, position, orientation) => {
    model.position.x = position.x;
    model.position.y = position.y;
    model.position.z = position.z;
    model.quaternion.w = orientation.w;
    model.quaternion.x = orientation.x;
    model.quaternion.y = orientation.y;
    model.quaternion.z = orientation.z;
  };

  /**
   * Sets the bounding box of an object while ignoring the addtional visuals.
   *
   * @param {THREE.Object3D} - object
   * @returns {THREE.Box3}
   */
  getObjectBoundingBox = (object) => {
    const boundingBox = new Box3();
    boundingBox.min = new Vector3().addScalar(+Infinity);
    boundingBox.max = new Vector3().addScalar(-Infinity);
    object.updateMatrixWorld( true );

    const expandByPoint = (point) => {
      boundingBox.min.min( point );
      boundingBox.max.max( point );
    };

    const v = new Vector3();
    object.traverse((node) => {
      let geometry = node.geometry;
      if (geometry !== undefined && node.name !== 'INERTIA_VISUAL' && node.name !== 'COM_VISUAL') {
        if (geometry.isGeometry) {
          const vertices = geometry.vertices;
          for (let i = 0; i < vertices.length; i++) {
            v.copy(vertices[i]);
            v.applyMatrix4(node.matrixWorld);
            expandByPoint(v);
          }
        } else if (geometry.isBufferGeometry) {
          const attr = geometry.attributes.position;
          if (attr !== undefined) {
            for (let i = 0; i < attr.count; i++) {
              v.fromBufferAttribute(attr, i).applyMatrix4(node.matrixWorld);
              expandByPoint(v);
            }
          }
        }
      }
    });
    return boundingBox;
  };

  /**
   * Adds a lighting setup that is great for single model visualization. This
   * will not alter existing lights.
   */
  addModelLighting = () => {
    this.ambient.color = new Color(0x666666);

    // And light1. Upper back fill light.
    const light1 = this.createLight(3,
      // Diffuse
      new Color(0.2, 0.2, 0.2),
      // Intensity
      0.5,
      // Pose
      {position: {x: 0, y: 10, z: 10}, orientation: {x: 0, y: 0, z: 0, w: 1}},
      // Distance
      null,
      // Cast shadows
      true,
      // Name
      '__model_light1__',
      // Direction
      {x: 0, y: -0.707, z: -0.707},
      // Specular
      new Color(0.3, 0.3, 0.3)
    );
    this.add(light1);

    // And light2. Lower back fill light
    const light2 = this.createLight(3,
      // Diffuse
      new Color(0.4, 0.4, 0.4),
      // Intensity
      0.5,
      // Pose
      {position: {x: 0, y: 10, z: -10}, orientation: {x: 0, y: 0, z: 0, w: -1}},
      // Distance
      null,
      // Cast shadows
      true,
      // Name
      '__model_light2__',
      // Direction
      {x: 0, y: -0.707, z: 0.707},
      // Specular
      new Color(0.3, 0.3, 0.3)
    );
    this.add(light2);

    // And light3. Front fill light.
    var light3 = this.createLight(3,
      // Diffuse
      new Color(0.5, 0.5, 0.5),
      // Intensity
      0.4,
      // Pose
      {position: {x: -10, y: -10, z: 10}, orientation: {x: 0, y: 0, z: 0, w: 1}},
      // Distance
      null,
      // Cast shadows
      true,
      // Name
      '__model_light2__',
      // Direction
      {x: 0.707, y: 0.707, z: 0},
      // Specular
      new Color(0.3, 0.3, 0.3)
    );
    this.add(light3);

    // And light4. Front key light.
    var light4 = this.createLight(3,
      // Diffuse
      new Color(1, 1, 1),
      // Intensity
      0.8,
      // Pose
      {position: {x: 10, y: -10, z: 10}, orientation: {x: 0, y: 0, z: 0, w: 1}},
      // Distance
      null,
      // Cast shadows
      true,
      // Name
      '__model_light2__',
      // Direction
      {x: -0.707, y: 0.707, z: 0},
      // Specular
      new Color(0.8, 0.8, 0.8)
    );
    this.add(light4);
  };

  /**
   * Set material for an object
   * @param {} obj
   * @param {} material
   */
  setMaterial = (obj, material) => {
    if (obj) {
      if (material) {
        // Change the texture loader, if the requestHeader is present.
        // Texture Loaders use an Image Loader internally, instead of a File Loader.
        // Image Loader uses an img tag, and their src request doesn't accept custom headers.
        // See https://github.com/mrdoob/three.js/issues/10439
        if (this.requestHeader) {
          this.textureLoader.load = function(url, onLoad, onProgress, onError) {
            const fileLoader = new FileLoader();
            fileLoader.setResponseType('blob');
            fileLoader.setRequestHeader(this.requestHeader);
            const texture = new Texture();
            const image = document.createElementNS( 'http://www.w3.org/1999/xhtml', 'img' );

            // Once the image is loaded, we need to revoke the ObjectURL.
            image.onload = function() {
              image.onload = null;
              URL.revokeObjectURL( image.src );
              if (onLoad) {
                onLoad( image );
              }
              texture.image = image;
              texture.needsUpdate = true;
            };

            image.onerror = onError;

            // Once the image is loaded, we need to revoke the ObjectURL.
            fileLoader.load(
              url,
              function(blob) {
                image.src = URL.createObjectURL(blob);
              },
              onProgress,
              onError
            );

            return texture;
          };
        }

        // If the material has a PBR tag, use a MeshStandardMaterial, which can have albedo, normal,
        // emissive, roughness and metalness maps. Otherwise use a Phong material.
        if (material.pbr) {
          obj.material = new MeshStandardMaterial();
          // Array of maps in order to facilitate the repetition and scaling process.
          const maps = [];

          if (material.pbr.metal.albedo_map) {
            const albedoMap = this.textureLoader.load(material.pbr.metal.albedo_map);
            obj.material.map = albedoMap;
            maps.push(albedoMap);

            // enable alpha test for textures with alpha transparency
            if (albedoMap.format === RGBAFormat) {
              obj.material.alphaTest = 0.5;
            }
          }

          if (material.pbr.metal.normal_map) {
            const normalMap = this.textureLoader.load(material.pbr.metal.normal_map);
            obj.material.normalMap = normalMap;
            maps.push(normalMap);
          }

          if (material.pbr.metal.emissive_map) {
            const emissiveMap = this.textureLoader.load(material.pbr.metal.emissive_map);
            obj.material.emissiveMap = emissiveMap;
            maps.push(emissiveMap);
          }

          if (material.pbr.metal.roughness_map) {
            const roughnessMap = this.textureLoader.load(material.pbr.metal.roughness_map);
            obj.material.roughnessMap = roughnessMap;
            maps.push(roughnessMap);
          }

          if (material.pbr.metal.metalness_map) {
            const metalnessMap = this.textureLoader.load(material.pbr.metal.metalness_map);
            obj.material.metalnessMap = metalnessMap;
            maps.push(metalnessMap);
          }

          maps.forEach(function(map) {
            map.wrapS = map.wrapT = RepeatWrapping;
            map.repeat.x = 1.0;
            map.repeat.y = 1.0;
            if (material.scale) {
              map.repeat.x = 1.0 / material.scale[0];
              map.repeat.y = 1.0 / material.scale[1];
            }
          });
        } else {
          obj.material = new MeshPhongMaterial();

          const specular = material.specular;
          if (specular) {
            obj.material.specular.copy(specular);
          }

          if (material.texture) {
            const texture = this.textureLoader.load(material.texture);
            texture.wrapS = texture.wrapT = RepeatWrapping;
            texture.repeat.x = 1.0;
            texture.repeat.y = 1.0;
            if (material.scale) {
              texture.repeat.x = 1.0 / material.scale[0];
              texture.repeat.y = 1.0 / material.scale[1];
            }
            obj.material.map = texture;

            // enable alpha test for textures with alpha transparency
            if (texture.format === RGBAFormat) {
              obj.material.alphaTest = 0.5;
            }
          }

          if (material.normalMap) {
            obj.material.normalMap = this.textureLoader.load(material.normalMap);
          }
        }

        const ambient = material.ambient;
        const diffuse = material.diffuse;
        if (diffuse) {
          // threejs removed ambient from phong and lambert materials so
          // aproximate the resulting color by mixing ambient and diffuse
          const dc = [];
          dc[0] = diffuse.r;
          dc[1] = diffuse.g;
          dc[2] = diffuse.b;
          if (ambient) {
            const a = 0.4;
            const d = 0.6;
            dc[0] = ambient.r*a + diffuse.r*d;
            dc[1] = ambient.g*a + diffuse.g*d;
            dc[2] = ambient.b*a + diffuse.b*d;
          }
          obj.material.color.setRGB(dc[0], dc[1], dc[2]);
        }
        const opacity = material.opacity;
        if (opacity) {
          if (opacity < 1) {
            obj.material.transparent = true;
            obj.material.opacity = opacity;
          }
        }
      }
    }
  };

  /**
   * Set a request header for internal requests.
   *
   * @param {string} header - The header to send in the request.
   * @param {string} value - The value to set to the header.
   */
  setRequestHeader = (header, value) => {
    const headerObject = { [header]: value };

    this.textureLoader.requestHeader = headerObject;
    this.colladaLoader.requestHeader = headerObject;
    this.stlLoader.requestHeader = headerObject;
    this.objLoader.requestHeader = headerObject;

    this.requestHeader = headerObject;
  };

  /**
   * Event for the mouse click. Allows model selection.
   * @param {} event - mousedown or touchdown events
   */
  onPointerDown = (event) => {
    event.preventDefault();

    let pos;
    if (event.touches) {
      if (event.touches.length === 1) {
        pos = new Vector2(
          event.touches[0].clientX,
          event.touches[0].clientY
        );
      } else if (event.touches.length === 2) {
        pos = new Vector2(
          (event.touches[0].clientX + event.touches[1].clientX)/2,
          (event.touches[0].clientY + event.touches[1].clientY)/2
        );
      } else {
        return;
      }
    } else {
      pos = new Vector2(
        event.clientX,
        event.clientY
      );
    }

    let intersect = new Vector3();
    const model = this.getRayCastModel(pos, intersect);

    this.selectEntity(model);
  };

  /**
   * Check if there's a model immediately under canvas coordinate 'pos'
   * @param {THREE.Vector2} pos - Canvas coordinates
   * @param {THREE.Vector3} intersect - Empty at input,
   * contains point of intersection in 3D world coordinates at output
   * @returns {THREE.Object3D} model - Intercepted model closest to the camera
   */
  getRayCastModel = (pos, intersect) => {
    const rect = this.getDomElement().getBoundingClientRect();
    const vector = new Vector2(
      ((pos.x - rect.x) / rect.width) * 2 - 1,
      -((pos.y - rect.y) / rect.height) * 2 + 1
    );

    this.ray.setFromCamera(vector, this.camera);

    const allObjects = [];
    this.scene.traverse((child) => {
      if (child !== this.scene) {
        allObjects.push(child);
      }
    });

    const objects = this.ray.intersectObjects(allObjects);

    let point;
    let obj;
    let model;

    if (objects.length > 0) {
      for (let i = 0; i < objects.length; ++i) {
        obj = objects[i].object;

        // Parent of a light helper.
        if (obj.name.includes('_lightHelper')) {
          model = obj.parent;
          break;
        }

        // Skip Collision Visuals
        if (obj.name.includes('COLLISION_VISUAL')) {
          continue;
        }

        // Skip other visuals and objects.
        if (obj.name === 'grid' ||
            obj.name === 'boundingBox' ||
            obj.name === 'JOINT_VISUAL' ||
            obj.name === 'INERTIA_VISUAL' ||
            obj.name === 'COM_VISUAL') {
          point = objects[i].point;
          continue;
        }

        // Obtain the parent up until the scene.
        while (obj.parent !== this.scene) {
          obj = obj.parent;
        }
        model = obj;
        point = objects[i].point;
      }
    }

    if (point) {
      intersect.x = point.x;
      intersect.y = point.y;
      intersect.z = point.z;
    }

    return model;
  };

  /**
   * Select entity
   * @param {} object The entity to select.
   */
  selectEntity = (object) => {
    if (object && object !== this.selectEntity) {
      this.showBoundingBox(object);
      this.selectedEntity = object;
    } else {
      this.hideBoundingBox();
      this.selectedEntity = null;
    }
  };

  /**
   * Show bounding box for a model. The box is aligned with the world.
   * @param {THREE.Object3D} model
   */
  showBoundingBox = (model) => {
    if (typeof model === 'string') {
      model = this.scene.getObjectByName(model);
    }

    if (this.boundingBox.visible) {
      if (this.boundingBox.parent === model) {
        return;
      } else {
        this.hideBoundingBox();
      }
    }

    const box = new BoxHelper(model, 0xFFFFFF);

    box.scale.x = 1.0 / model.scale.x;
    box.scale.y = 1.0 / model.scale.y;
    box.scale.z = 1.0 / model.scale.z;

    box.position.x = -model.position.x * box.scale.x;
    box.position.y = -model.position.y * box.scale.y;
    box.position.z = -model.position.z * box.scale.z;

    box.updateMatrix();

    this.boundingBox = box;
    this.boundingBox.name = 'boundingBox';
    this.boundingBox.visible = true;

    model.add(this.boundingBox);
  };

  /**
   * Hides the bounding box.
   */
  hideBoundingBox = () => {
    if (this.boundingBox.parent) {
      this.boundingBox.parent.remove(this.boundingBox);
    }
    this.boundingBox.visible = false;
  };

  /**
   * Load mesh
   * @example loadMeshFromUri('assets/house_1/meshes/house_1.dae',
   *            undefined,
   *            undefined,
   *            function(mesh) {
   *              // use the mesh
   *            }
   *          );
   * @param {string} uri
   * @param {} submesh
   * @param {} centerSubmesh
   * @param {function} callback
   */
  loadMeshFromUri = (uri, submesh, centerSubmesh, callback) => {
    const uriFile = uri.substring(uri.lastIndexOf('/') + 1);

    // Check if the mesh has already been loaded.
    // Use it in that case.
    if (this.meshes[uri]) {
      let mesh = this.meshes[uri];
      mesh = mesh.clone();
      this.useSubMesh(mesh, submesh, centerSubmesh);
      callback(mesh);
      return;
    }

    // load meshes
    if (uriFile.substring(uriFile.length - 4).toLowerCase() === '.dae') {
      return this.loadCollada(uri, submesh, centerSubmesh, callback);
    } else if (uriFile.substring(uriFile.length - 4).toLowerCase() === '.obj') {
      return this.loadOBJ(uri, submesh, centerSubmesh, callback);
    }
    else if (uriFile.substring(uriFile.length - 4).toLowerCase() === '.stl') {
      return this.loadSTL(uri, submesh, centerSubmesh, callback);
    } else if (uriFile.substring(uriFile.length - 5).toLowerCase() === '.urdf') {
      console.error('Attempting to load URDF file, but it\'s not supported.');
    }
  };

  /**
   * Load mesh
   * @example loadMeshFromString('assets/house_1/meshes/house_1.dae',
   *            undefined,
   *            undefined,
   *            function(mesh) {
   *              // use the mesh
   *            },
   *            ['<?xml version="1.0" encoding="utf-8"?>
   *              <COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
   *                <asset>
   *                  <contributor>
   *                    <author>Cole</author>
   *                    <authoring_tool>OpenCOLLADA for 3ds Max;  Ver.....']
   *          );
   * @param {string} uri
   * @param {} submesh
   * @param {} centerSubmesh
   * @param {function} callback
   * @param {array} files - files needed by the loaders[dae] in case of a collada mesh, [obj, mtl] in case of object mesh, all as strings
   */
  loadMeshFromString = (uri, submesh, centerSubmesh, callback, files) => {
    const uriFile = uri.substring(uri.lastIndexOf('/') + 1);

    if (this.meshes[uri]) {
      let mesh = this.meshes[uri];
      mesh = mesh.clone();
      this.useSubMesh(mesh, submesh, centerSubmesh);
      callback(mesh);
      return;
    }

    // load mesh
    if (uriFile.substring(uriFile.length - 4).toLowerCase() === '.dae') {
      // loadCollada just accepts one file, which is the dae file as string
      if (files.length < 1 || !files[0]) {
        console.error('Missing DAE file');
        return;
      }
      return this.loadCollada(uri, submesh, centerSubmesh, callback, files[0]);
    } else if (uriFile.substring(uriFile.length - 4).toLowerCase() === '.obj') {
      if (files.length < 2 || !files[0] || !files[1]) {
        console.error('Missing either OBJ or MTL file');
        return;
      }
      return this.loadOBJ(uri, submesh, centerSubmesh, callback);
    }
  };

  /**
   * Load collada file
   * @param {string} uri - mesh uri which is used by colldaloader to load
   * the mesh file using an XMLHttpRequest.
   * @param {} submesh
   * @param {} centerSubmesh
   * @param {function} callback
   * @param {string} filestring -optional- the mesh file as a string to be parsed
   * if provided the uri will not be used just as a url, no XMLHttpRequest will
   * be made.
   */
  loadCollada = (uri, submesh, centerSubmesh, callback, filestring) => {
    let dae;

    const meshReady = (collada) => {
      dae = collada.scene;
      dae.updateMatrix();
      this.prepareColladaMesh(dae);
      this.meshes[uri] = dae;
      dae = dae.clone();
      this.useSubMesh(dae, submesh, centerSubmesh);

      dae.name = uri;
      callback(dae);
    };

    if (!filestring) {
      this.colladaLoader.load(
        uri,
        function(collada) {
          meshReady(collada);
        }
      );
    } else {
      this.colladaLoader.parse(
        filestring,
        function(collada) {
          meshReady(collada);
        },
        undefined
      );
    }
  };

  /**
   * Prepare collada by removing other non-mesh entities such as lights
   * @param {} dae
   */
  prepareColladaMesh = (dae) => {
    const children = [];
    dae.traverse((child) => {
      if (child !== dae) {
        children.push(child);
      }
    });

    children.forEach(child => {
      if (child instanceof Light) {
        child.parent.remove(child);
      }
    });
  };

  /**
   * Prepare mesh by handling submesh-only loading
   * @param {} mesh
   * @param {} submesh
   * @param {} centerSubmesh
   * @returns {THREE.Mesh} mesh
   */
  useSubMesh = (mesh, submesh, centerSubmesh) => {
    if (!submesh) {
      return null;
    }

    // The mesh has children for every submesh. Those children are either meshes or groups that contain meshes.
    // We need to modify the mesh, so only the required submesh is contained in it.
    // Note: If a submesh is contained in a group, we need to preserve that group, as it may apply matrix transformations
    // required by the submesh.
    let result;

    // Auxiliary function used to look for the required submesh.
    // Checks if the given submesh is the one we look for. If it's a Group, look for it within its children.
    // It returns the submesh, if found.
    function lookForSubmesh(obj, parent) {
      if (obj instanceof Mesh && obj.name === submesh && obj.hasOwnProperty('geometry')) {
        // Found the submesh.

        // Center the submesh.
        if (centerSubmesh) {
          // obj file
          if (obj.geometry instanceof BufferGeometry) {
            const geomPosition = obj.geometry.attributes.position;
            const dim = geomPosition.itemSize;
            const minPos = [];
            const maxPos = [];
            const centerPos = [];
            for (let m = 0; m < dim; ++m) {
              minPos[m] = geomPosition.array[m];
              maxPos[m] = minPos[m];
            }
            for (let kk = dim; kk < geomPosition.count * dim; kk+=dim) {
              for (let m = 0; m < dim; ++m) {
                minPos[m] = Math.min(minPos[m], geomPosition.array[kk + m]);
                maxPos[m] = Math.max(maxPos[m], geomPosition.array[kk + m]);
              }
            }

            for (let m = 0; m < dim; ++m) {
              centerPos[m] = minPos[m] + (0.5 * (maxPos[m] - minPos[m]));
            }

            for (let kk = 0; kk < geomPosition.count * dim; kk+=dim) {
              for (let m = 0; m < dim; ++m) {
                geomPosition.array[kk + m] -= centerPos[m];
              }
            }
            obj.geometry.attributes.position.needsUpdate = true;

            // Center the position.
            obj.position.set(0, 0, 0);
            let childParent = obj.parent;
            while (childParent) {
              childParent.position.set(0, 0, 0);
              childParent = childParent.parent;
            }
          } else {
            // dae file
            const vertices = obj.geometry.vertices;
            const vMin = new Vector3();
            const vMax = new Vector3();
            vMin.x = vertices[0].x;
            vMin.y = vertices[0].y;
            vMin.z = vertices[0].z;
            vMax.x = vMin.x;
            vMax.y = vMin.y;
            vMax.z = vMin.z;

            for (let j = 1; j < vertices.length; ++j) {
              vMin.x = Math.min(vMin.x, vertices[j].x);
              vMin.y = Math.min(vMin.y, vertices[j].y);
              vMin.z = Math.min(vMin.z, vertices[j].z);
              vMax.x = Math.max(vMax.x, vertices[j].x);
              vMax.y = Math.max(vMax.y, vertices[j].y);
              vMax.z = Math.max(vMax.z, vertices[j].z);
            }

            const center  = new Vector3();
            center.x = vMin.x + (0.5 * (vMax.x - vMin.x));
            center.y = vMin.y + (0.5 * (vMax.y - vMin.y));
            center.z = vMin.z + (0.5 * (vMax.z - vMin.z));

            for (let k = 0; k < vertices.length; ++k) {
              vertices[k].x -= center.x;
              vertices[k].y -= center.y;
              vertices[k].z -= center.z;
            }

            obj.geometry.verticesNeedUpdate = true;
            let p = obj.parent;
            while (p) {
              p.position.set(0, 0, 0);
              p = p.parent;
            }
          }
        }

        // Filter the children of the parent. Only the required submesh needs to be there.
        parent.children = [obj];
        return obj;
      } else {
        if (obj instanceof Group) {
          for (let i = 0; i < obj.children.length; i++) {
            result = lookForSubmesh(obj.children[i], obj);
            if (result) {
              // This keeps the Group (obj), and modifies it's children to contain only the submesh.
              obj.children = [result];
              return obj;
            }
          }
        }
      }
    }

    // Look for the submesh in the children of the mesh.
    for (let i = 0; i < mesh.children.length; i++) {
      result = lookForSubmesh(mesh.children[i], mesh);
      if (result) {
        mesh.children = [ result ];
        break;
      }
    }

    result = mesh.children;

    return result;
  };

  /**
   * Load stl file.
   * Loads stl mesh given using it's uri
   * @param {string} uri
   * @param {} submesh
   * @param {} centerSubmesh
   * @param {function} callback
   */
  loadSTL = (uri, submesh, centerSubmesh, callback) => {
    this.stlLoader.load(
      uri,
      (geometry) => {
        let mesh = new Mesh( geometry );
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        this.meshes[uri] = mesh;
        mesh = mesh.clone();
        this.useSubMesh(mesh, submesh, centerSubmesh);

        mesh.name = uri;
        callback(mesh);
      }
    );
  };

  /**
   * Load obj and mtl files.
   * Loads obj mesh given using it's uri
   * @param {string} uri
   * @param {} submesh
   * @param {} centerSubmesh
   * @param {function} callback
   */
  loadOBJ = (uri, submesh, centerSubmesh, callback) => {
    this.objLoader.load(uri, (obj) => {
      this.meshes[uri] = obj;
      obj = obj.clone();
      this.useSubMesh(obj, submesh, centerSubmesh);
      obj.name = uri;
      callback(obj);
    });
  };

  /**
   * Create light
   * @param {} type - 1: point, 2: spot, 3: directional
   * @param {} diffuse
   * @param {} intensity
   * @param {} pose
   * @param {} distance
   * @param {} cast_shadows
   * @param {} name
   * @param {} direction
   * @param {} specular
   * @param {} attenuation_constant
   * @param {} attenuation_linear
   * @param {} attenuation_quadratic
   * @returns {THREE.Object3D}
   */
  createLight = (type, diffuse, intensity, pose, distance, cast_shadows, name, direction, specular, attenuation_constant, attenuation_linear, attenuation_quadratic, inner_angle, outer_angle, falloff) => {
    const obj = new Object3D();
    const color = new Color();

    if (typeof(diffuse) === 'undefined') {
      diffuse = 0xffffff;
    } else if (typeof(diffuse) !== Color) {
      color.r = diffuse.r;
      color.g = diffuse.g;
      color.b = diffuse.b;
      diffuse = color.clone();
    } else if (typeof(specular) !== Color) {
      color.r = specular.r;
      color.g = specular.g;
      color.b = specular.b;
      specular = color.clone();
    }

    if (pose) {
      this.setPose(obj, pose.position, pose.orientation);
      obj.matrixWorldNeedsUpdate = true;
    }

    const dir = new Vector3(0, 0, -1);
    let elements;

    if (type === 1) {
      elements = this.createPointLight(obj, diffuse, intensity, distance, cast_shadows);
    } else if (type === 2) {
      elements = this.createSpotLight(obj, diffuse, intensity, distance, cast_shadows, inner_angle, outer_angle, falloff);
    } else if (type === 3) {
      elements = this.createDirectionalLight(obj, diffuse, intensity, cast_shadows);
      if (direction) {
        dir.x = direction.x;
        dir.y = direction.y;
        dir.z = direction.z;
      }
    }

    const lightObj = elements[0];
    const helper = elements[1];

    if (name) {
      lightObj.name = name;
      obj.name = name;
      helper.name = name + '_lightHelper';
    }

    obj.direction = new Vector3(dir.x, dir.y, dir.z);
    const targetObj = new Object3D();
    lightObj.add(targetObj);

    targetObj.position.copy(dir);
    targetObj.matrixWorldNeedsUpdate = true;
    lightObj.target = targetObj;

    // Add properties which exist on the server but have no meaning on THREE.js
    obj.serverProperties = {};
    obj.serverProperties.specular = specular;
    obj.serverProperties.attenuation_constant = attenuation_constant;
    obj.serverProperties.attenuation_linear = attenuation_linear;
    obj.serverProperties.attenuation_quadratic = attenuation_quadratic;

    obj.add(lightObj);

    // Suppress light shape visualization. Renable this when visualization controls are in place
    // obj.add(helper);
    return obj;
  };

  /**
   * Create point light - called by createLight
   * @param {} obj - light object
   * @param {} color
   * @param {} intensity
   * @param {} distance
   * @param {} cast_shadows
   * @returns {Object.<THREE.Light, THREE.Mesh>}
   */
  createPointLight = (obj, color, intensity, distance, cast_shadows) => {
    if (typeof(intensity) === 'undefined') {
      intensity = 0.5;
    }

    const lightObj = new PointLight(color, intensity);

    if (distance) {
      lightObj.distance = distance;
    }

    if (cast_shadows) {
      lightObj.castShadow = cast_shadows;
    }

    const helperGeometry = new OctahedronGeometry(0.25, 0);
    helperGeometry.applyMatrix(new Matrix4().makeRotationX(Math.PI/2));

    const helperMaterial = new MeshBasicMaterial({wireframe: true, color: 0x00ff00});
    const helper = new Mesh(helperGeometry, helperMaterial);

    return [lightObj, helper];
  };

  /**
   * Create spot light - called by createLight
   * @param {} obj - light object
   * @param {} color
   * @param {} intensity
   * @param {} distance
   * @param {} cast_shadows
   * @returns {Object.<THREE.Light, THREE.Mesh>}
   */
  createSpotLight = (obj, color, intensity, distance, cast_shadows, inner_angle, outer_angle, falloff) => {
    if (typeof(intensity) === 'undefined') {
      intensity = 1;
    }

    if (typeof(distance) === 'undefined') {
      distance = 20;
    }

    const lightObj = new SpotLight(color, intensity, distance);
    lightObj.position.set(0,0,0);

    if (inner_angle !== null && outer_angle !== null) {
      lightObj.angle = outer_angle;
      lightObj.penumbra = Math.max(1, (outer_angle - inner_angle) / ((inner_angle + outer_angle) / 2.0));
    }

    if (falloff !== null) {
      lightObj.decay = falloff;
    }

    if (cast_shadows) {
      lightObj.castShadow = cast_shadows;
    }

    const helperGeometry = new CylinderGeometry(0, 0.3, 0.2, 4, 1, true);
    helperGeometry.applyMatrix(new Matrix4().makeRotationX(Math.PI/2));
    helperGeometry.applyMatrix(new Matrix4().makeRotationZ(Math.PI/4));

    // Offset the helper so that the frustum vertex is at the spot light source. This is half the height of the THREE.CylinderGeometry.
    helperGeometry.applyMatrix(new Matrix4().makeTranslation(0, 0, -0.1));
    const helperMaterial = new MeshBasicMaterial({wireframe: true, color: 0x00ff00});
    const helper = new Mesh(helperGeometry, helperMaterial);

    return [lightObj, helper];
  };

  /**
   * Create directional light - called by createLight
   * @param {} obj - light object
   * @param {} color
   * @param {} intensity
   * @param {} cast_shadows
   * @returns {Object.<THREE.Light, THREE.Mesh>}
   */
  createDirectionalLight = (obj, color, intensity, cast_shadows) => {
    if (typeof(intensity) === 'undefined') {
      intensity = 1;
    }

    const lightObj = new DirectionalLight(color, intensity);
    lightObj.shadow.camera.near = 1;
    lightObj.shadow.camera.far = 50;
    lightObj.shadow.mapSize.width = 4094;
    lightObj.shadow.mapSize.height = 4094;
    lightObj.shadow.camera.bottom = -100;
    lightObj.shadow.camera.feft = -100;
    lightObj.shadow.camera.right = 100;
    lightObj.shadow.camera.top = 100;
    lightObj.shadow.bias = 0.0001;
    lightObj.position.set(0,0,0);

    if (cast_shadows) {
      lightObj.castShadow = cast_shadows;
    }

    const light = new DirectionalLight( 0xFFFFFF );

    // const helperGeometry = new Geometry();
    // helperGeometry.vertices.push(new Vector3(-0.5, -0.5, 0));
    // helperGeometry.vertices.push(new Vector3(-0.5,  0.5, 0));
    // helperGeometry.vertices.push(new Vector3(-0.5,  0.5, 0));
    // helperGeometry.vertices.push(new Vector3( 0.5,  0.5, 0));
    // helperGeometry.vertices.push(new Vector3( 0.5,  0.5, 0));
    // helperGeometry.vertices.push(new Vector3( 0.5, -0.5, 0));
    // helperGeometry.vertices.push(new Vector3( 0.5, -0.5, 0));
    // helperGeometry.vertices.push(new Vector3(-0.5, -0.5, 0));
    // helperGeometry.vertices.push(new Vector3(   0,    0, 0));
    // helperGeometry.vertices.push(new Vector3(   0,    0, -0.5));
    // const helperMaterial = new LineBasicMaterial({color: 0x00ff00});
    const helper = new DirectionalLightHelper( light, 5 );
    // const helper = new Line(helperGeometry, helperMaterial, LineSegments);
    // this.scene.add( helper );

    return [lightObj, helper];
  };

  /**
   * Create plane
   * @param {double} normalX
   * @param {double} normalY
   * @param {double} normalZ
   * @param {double} width
   * @param {double} height
   * @returns {THREE.Mesh}
   */
  createPlane = (normalX, normalY, normalZ, width, height) => {
    const geometry = new PlaneGeometry(width, height, 1, 1);
    const material = new MeshPhongMaterial();
    const mesh = new Mesh(geometry, material);
    const normal = new Vector3(normalX, normalY, normalZ);
    const cross = normal.crossVectors(normal, mesh.up);
    mesh.rotation = normal.applyAxisAngle(cross, -(normal.angleTo(mesh.up)));
    mesh.name = 'plane';
    mesh.receiveShadow = true;
    return mesh;
  };

  /**
   * Create sphere
   * @param {double} radius
   * @returns {THREE.Mesh}
   */
  createSphere = (radius) => {
    const geometry = new SphereGeometry(radius, 32, 32);
    const mesh = new Mesh(geometry, this.simpleShapesMaterial);
    return mesh;
  };

  /**
   * Create cylinder
   * @param {double} radius
   * @param {double} length
   * @returns {THREE.Mesh}
   */
  createCylinder = (radius, length) => {
    const geometry = new CylinderGeometry(radius, radius, length, 32, 1, false);
    const mesh = new Mesh(geometry, this.simpleShapesMaterial);
    mesh.rotation.x = Math.PI * 0.5;
    return mesh;
  };

  /**
   * Create box
   * @param {double} width
   * @param {double} height
   * @param {double} depth
   * @returns {THREE.Mesh}
   */
  createBox = (width, height, depth) => {
    const geometry = new BoxGeometry(width, height, depth, 1, 1, 1);

    // Fix UVs so textures are mapped in a way that is consistent to gazebo
    // Some face uvs need to be rotated clockwise, while others anticlockwise
    // After updating to threejs rev 62, geometries changed from quads (6 faces)
    // to triangles (12 faces).
    // geometry.dynamic = true;
    // const faceUVFixA = [1, 4, 5];
    // const faceUVFixB = [0];
    // for (let i = 0; i < faceUVFixA.length; ++i) {
    //   const idx = faceUVFixA[i] * 2;
    //   // Make sure that the index is valid. A threejs box geometry may not
    //   // have all of the faces if a dimension is sufficiently small.
    //   if (idx + 1 < geometry.faceVertexUvs.length) {
    //     const uva = geometry.faceVertexUvs[0][idx][0];
    //     geometry.faceVertexUvs[0][idx][0] = geometry.faceVertexUvs[0][idx][1];
    //     geometry.faceVertexUvs[0][idx][1] = geometry.faceVertexUvs[0][idx+1][1];
    //     geometry.faceVertexUvs[0][idx][2] = uva;

    //     geometry.faceVertexUvs[0][idx+1][0] = geometry.faceVertexUvs[0][idx+1][1];
    //     geometry.faceVertexUvs[0][idx+1][1] = geometry.faceVertexUvs[0][idx+1][2];
    //     geometry.faceVertexUvs[0][idx+1][2] = geometry.faceVertexUvs[0][idx][2];
    //   }
    // }

    // for (let ii = 0; ii < faceUVFixB.length; ++ii) {
    //   const idxB = faceUVFixB[ii] * 2;

    //   // Make sure that the index is valid. A threejs box geometry may not
    //   // have all of the faces if a dimension is sufficiently small.
    //   if (idxB + 1 < geometry.faceVertexUvs.length) {
    //     const uvc = geometry.faceVertexUvs[0][idxB][0];
    //     geometry.faceVertexUvs[0][idxB][0] = geometry.faceVertexUvs[0][idxB][2];
    //     geometry.faceVertexUvs[0][idxB][1] = uvc;
    //     geometry.faceVertexUvs[0][idxB][2] = geometry.faceVertexUvs[0][idxB+1][1];

    //     geometry.faceVertexUvs[0][idxB+1][2] = geometry.faceVertexUvs[0][idxB][2];
    //     geometry.faceVertexUvs[0][idxB+1][1] = geometry.faceVertexUvs[0][idxB+1][0];
    //     geometry.faceVertexUvs[0][idxB+1][0] = geometry.faceVertexUvs[0][idxB][1];
    //   }
    // }
    // geometry.uvsNeedUpdate = true;

    const mesh = new Mesh(geometry, this.simpleShapesMaterial);
    mesh.castShadow = true;

    return mesh;
  };

  /**
   * Take a screenshot of the canvas and save it.
   *
   * @param {string} filename - The filename of the screenshot. PNG extension is appended to it.
   */
  saveScreenshot = (filename) => {
    // An explicit call to render is required. Otherwise the obtained image will be black.
    // See https://threejsfundamentals.org/threejs/lessons/threejs-tips.html, "Taking A Screenshot of the Canvas"
    this.render();

    this.getDomElement().toBlob(function(blob) {
      const url = URL.createObjectURL(blob);
      const linkElement = document.createElement('a');
      linkElement.href = url;
      linkElement.download = filename + '.png';
      document.body.appendChild(linkElement);
      linkElement.dispatchEvent(new MouseEvent('click'));
      document.body.removeChild(linkElement);
      URL.revokeObjectURL(url);
    });
  };

  /**
   * Generate thumbnails of the scene.
   *
   * The models on the scene should be previously scaled so that their maximum dimension equals 1.
   *
   * @param {string} filename - The filename of the generated zip file.
   * @param {THREE.Vector3} center - The point where the camera will point to.
   */
  createThumbnails = (filename, center) => {
    // Auxiliary method to return the canvas as a Promise.
    // This allows us to download all the images when they are ready.
    function getCanvasBlob(canvas) {
      return new Promise(function(resolve) {
        canvas.toBlob(function(blob) {
          resolve(blob);
        });
      });
    }

    const zip = new JSZip();
    const canvas = this.getDomElement();
    const promises = [];

    // Directional light and target.
    const lightTarget = new Object3D();
    lightTarget.name = 'thumbnails_light_target';
    lightTarget.position.copy(center);
    this.scene.add(lightTarget);

    const light = new DirectionalLight( 0xffffff, 1.0 );
    light.name = 'thumbnails_light';
    this.scene.add(light);
    light.target = lightTarget;

    // Note: An explicit call to render is required for each image. Otherwise the obtained image will be black.
    // See https://threejsfundamentals.org/threejs/lessons/threejs-tips.html, "Taking A Screenshot of the Canvas"

    // Perspective
    this.camera.position.copy(center);
    this.camera.position.add(new Vector3(1.6, -1.6, 1.2));
    this.camera.lookAt(center);
    light.position.copy(this.camera.position);
    this.render();
    const perspective = getCanvasBlob(canvas);
    perspective.then(function(blob) {
      zip.file('thumbnails/1.png', blob);
    });
    promises.push(perspective);

    // Top
    this.camera.position.copy(center);
    this.camera.position.add(new Vector3(0, 0, 2.2));
    this.camera.rotation.copy(new Euler(0, 0, -90 * Math.PI / 180));
    light.position.copy(this.camera.position);
    this.render();
    const top = getCanvasBlob(canvas);
    top.then(function(blob) {
      zip.file('thumbnails/2.png', blob);
    });
    promises.push(top);

    // Front
    this.camera.position.copy(center);
    this.camera.position.add(new Vector3(2.2, 0, 0));
    this.camera.rotation.copy(new Euler(0, 90 * Math.PI / 180, 90 * Math.PI / 180));
    light.position.copy(this.camera.position);
    this.render();
    const front = getCanvasBlob(canvas);
    front.then(function(blob) {
      zip.file('thumbnails/3.png', blob);
    });
    promises.push(front);

    // Side
    this.camera.position.copy(center);
    this.camera.position.add(new Vector3(0, 2.2, 0));
    this.camera.rotation.copy(new Euler(-90 * Math.PI / 180, 0, 180 * Math.PI / 180));
    light.position.copy(this.camera.position);
    this.render();
    const side = getCanvasBlob(canvas);
    side.then(function(blob) {
      zip.file('thumbnails/4.png', blob);
    });
    promises.push(side);

    // Back
    this.camera.position.copy(center);
    this.camera.position.add(new Vector3(-2.2, 0, 0));
    this.camera.rotation.copy(new Euler(90 * Math.PI / 180, -90 * Math.PI / 180, 0));
    light.position.copy(this.camera.position);
    light.position.add(new Vector3(-2000, 0, 0));
    this.render();
    const back = getCanvasBlob(canvas);
    back.then(function(blob) {
      zip.file('thumbnails/5.png', blob);
    });
    promises.push(back);

    Promise.all(promises).then(() => {
      zip.generateAsync({type: 'blob'}).then(function(content) {
        const url = URL.createObjectURL(content);
        const linkElement = document.createElement('a');
        linkElement.href = url;
        linkElement.download = filename + '.zip';
        document.body.appendChild(linkElement);
        linkElement.dispatchEvent(new MouseEvent('click'));
        document.body.removeChild(linkElement);
        URL.revokeObjectURL(url);
      });

      this.scene.remove(light);
      this.scene.remove(lightTarget);
    });
  };
}
