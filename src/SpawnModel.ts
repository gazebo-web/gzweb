import * as THREE from "three";
import { getDescendants } from "./Globals";
import { Scene } from "./Scene";
import { SDFParser } from "./SDFParser";

/**
 * Spawn a model into the scene
 * @constructor
 */
export class SpawnModel {
  public active: boolean = false;
  public sdfParser: SDFParser;
  public scene: Scene;
  public domElement: HTMLElement | Document;
  public obj: THREE.Object3D;
  public callback: any;
  public spawnedShapeMaterial: THREE.MeshPhongMaterial;
  public plane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  public ray: THREE.Ray = new THREE.Ray();
  public snapDist: number | undefined = undefined;

  constructor(scene: Scene, domElement: HTMLElement) {
    this.scene = scene;
    this.domElement = domElement !== undefined ? domElement : document;

    // Material for simple shapes being spawned (grey transparent)
    this.spawnedShapeMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      flatShading: false,
    });
    this.spawnedShapeMaterial.transparent = true;
    this.spawnedShapeMaterial.opacity = 0.5;
  }

  /**
   * Start spawning an entity. Only simple shapes supported so far.
   * Adds a temp object to the scene which is not registered on the server.
   * @param {string} entity
   * @param {function} callback
   */
  public start(entity: string, callback: any): void {
    if (this.active) {
      this.finish();
    }

    this.callback = callback;

    let that = this;

    function meshLoaded(mesh: THREE.Object3D, spawnedMat?: boolean) {
      if (spawnedMat) {
        (mesh as THREE.Mesh).material = that.spawnedShapeMaterial;
      }
      that.obj.name = that.generateUniqueName(entity);
      that.obj.add(mesh);
    }

    this.obj = new THREE.Object3D();
    if (entity === "box") {
      meshLoaded(this.scene.createBox(1, 1, 1), true);
    } else if (entity === "sphere") {
      meshLoaded(this.scene.createSphere(0.5), true);
    } else if (entity === "cylinder") {
      meshLoaded(this.scene.createCylinder(0.5, 1.0), true);
    } else if (entity === "capsule") {
      meshLoaded(this.scene.createCapsule(1, 1), true);
    } else if (entity === "pointlight") {
      meshLoaded(this.scene.createLight(1), false);
    } else if (entity === "spotlight") {
      meshLoaded(this.scene.createLight(2), false);
    } else if (entity === "directionallight") {
      meshLoaded(this.scene.createLight(3), false);
    } else {
      this.sdfParser.loadSDF(entity, meshLoaded);
      //TODO: add transparency to the object
    }

    // temp model appears within current view
    var pos = new THREE.Vector2(
      window.window.innerWidth / 2,
      window.innerHeight / 2,
    );
    var intersect = new THREE.Vector3();
    this.scene.getRayCastModel(pos, intersect);

    this.obj.position.x = intersect.x;
    this.obj.position.y = intersect.y;
    this.obj.position.z += 0.5;
    this.scene.add(this.obj);
    // For the inserted light to have effect
    var allObjects: THREE.Object3D[] = [];
    getDescendants(this.scene.scene, allObjects);
    for (var l = 0; l < allObjects.length; ++l) {
      if ((allObjects[l] as any).material) {
        (allObjects[l] as any).material.needsUpdate = true;
      }
    }

    /*this.mouseDown = function(event) {that.onMouseDown(event);};
    this.mouseUp = function(event) {that.onMouseUp(event);};
    this.mouseMove = function(event) {that.onMouseMove(event);};
    this.keyDown = function(event) {that.onKeyDown(event);};
    this.touchMove = function(event) {that.onTouchMove(event,true);};
    this.touchEnd = function(event) {that.onTouchEnd(event);};
  
    this.domElement.addEventListener('mousedown', that.mouseDown, false);
    this.domElement.addEventListener( 'mouseup', that.mouseUp, false);
    this.domElement.addEventListener( 'mousemove', that.mouseMove, false);
    document.addEventListener( 'keydown', that.keyDown, false);
  
    this.domElement.addEventListener( 'touchmove', that.touchMove, false);
    this.domElement.addEventListener( 'touchend', that.touchEnd, false);
   */

    this.active = true;
  }

  /**
   * Finish spawning an entity: re-enable camera controls,
   * remove listeners, remove temp object
   */
  public finish(): void {
    var that = this;

    /*this.domElement.removeEventListener( 'mousedown', that.mouseDown, false);
    this.domElement.removeEventListener( 'mouseup', that.mouseUp, false);
    this.domElement.removeEventListener( 'mousemove', that.mouseMove, false);
    document.removeEventListener( 'keydown', that.keyDown, false);
   */

    this.scene.remove(this.obj);
    this.active = false;
  }

  /**
   * Window event callback
   * @param {} event - not yet
   */
  /*public onMouseDown(event: MouseEvent): void {
    // Does this ever get called?
    // Change like this:
    // https://bitbucket.org/osrf/gzweb/pull-request/14
    event.preventDefault();
    event.stopImmediatePropagation();
  }*/

  /**
   * Window event callback
   * @param {} event - mousemove events
   */
  /*public onMouseMove(event: MouseEvent): void {
    if (!this.active) {
      return;
    }
  
    event.preventDefault();
  
    this.moveSpawnedModel(event.clientX,event.clientY);
  }*/

  /**
   * Window event callback
   * @param {} event - touchmove events
   */
  /*public onTouchMove(event: TouchEvent, originalEvent: any): void {
    if (!this.active) {
      return;
    }
  
    var e;
  
    if (originalEvent) {
      e = event;
    }
    else {
      e = event.originalEvent;
    }
    e.preventDefault();
  
    if (e.touches.length === 1) {
      this.moveSpawnedModel(e.touches[ 0 ].pageX,e.touches[ 0 ].pageY);
    }
  }*/

  /**
   * Window event callback
   * @param {} event - touchend events
   */
  /*public onTouchEnd = function(): void {
    if (!this.active) {
      return;
    }
  
    this.callback(this.obj);
    this.finish();
  }*/

  /**
   * Window event callback
   * @param {} event - mousedown events
   */
  /*public onMouseUp(event: MouseEvent): void {
    if (!this.active) {
      return;
    }
  
    this.callback(this.obj);
    this.finish();
  }*/

  /**
   * Window event callback
   * @param {} event - keydown events
   */
  /*public onKeyDown(event: KeyEvent): void {
    if ( event.keyCode === 27 ) // Esc
    {
      this.finish();
    }
  }*/

  /**
   * Move temp spawned model
   * @param {integer} positionX - Horizontal position on the canvas
   * @param {integer} positionY - Vertical position on the canvas
   */
  /*public moveSpawnedModel(positionX: number, positionY: number): void {
    var vector = new THREE.Vector3( (positionX / window.innerWidth) * 2 - 1,
          -(positionY / window.innerHeight) * 2 + 1, 0.5);
    vector.unproject(this.scene.camera);
    this.ray.set(this.scene.camera.position,
        vector.sub(this.scene.camera.position).normalize());
    var point = this.ray.intersectPlane(this.plane);
  
    if (!point)
    {
      return;
    }
  
    point.z = this.obj.position.z;
  
    if (this.snapDist) {
      point.x = Math.round(point.x / this.snapDist) * this.snapDist;
      point.y = Math.round(point.y / this.snapDist) * this.snapDist;
    }
  
    this.scene.setPose(this.obj, point, new THREE.Quaternion());
  
    if (this.obj.children[0].children[0] &&
       (this.obj.children[0].children[0] instanceof THREE.SpotLight ||
        this.obj.children[0].children[0] instanceof THREE.DirectionalLight))
    {
      var lightObj = this.obj.children[0].children[0];
      if (lightObj.direction)
      {
        if (lightObj.target)
        {
          lightObj.target.position.copy(lightObj.direction);
        }
      }
    }
  }*/

  /**
   * Generate unique name for spawned entity
   * @param {string} entity - entity type
   */
  public generateUniqueName(entity: string): string {
    let i: number = 0;
    while (i < 1000) {
      if (this.scene.getByName(entity + "_" + i)) {
        ++i;
      } else {
        return entity + "_" + i;
      }
    }
    return entity;
  }
}
