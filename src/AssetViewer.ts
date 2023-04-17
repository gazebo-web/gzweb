import { Scene } from "./Scene";
import { Shaders } from "./Shaders";
import { SDFParser } from "./SDFParser";

import { Object3D, Box3, Vector3 } from "three";
import { BehaviorSubject } from "rxjs";

/**
 * Interface used to pass parameters into the AssetViewer's constructor.
 * These should override the default behavior of the AssetViewer.
 */
export interface AssetViewerConfig {
  /**
   * Custom ID of the HTML element that will hold the rendering context.
   */
  elementId?: string;

  /**
   * Whether or not to add model lightning.
   */
  addModelLightning?: boolean;

  /**
   * Whether or not to scale the model into view.
   */
  scaleModel?: boolean;

  /**
   * Whether or not to use PBR materials.
   */
  enablePBR?: boolean;

  /**
   * An optional Fuel Server Bearer Token in case the resource is private.
   */
  token?: string;
}

/**
 * The Asset Viewer class allows clients to render and view simulation resources, such as
 * models and worlds.
 *
 * This requires all of thhe resource's related URLs, and there is no websocket connection involved
 * in this process.
 */
export class AssetViewer {
  /**
   * Behavior subject used to communicate if a resource has been loaded or not.
   * Note: This will be true when the Object3D is created, not when it's meshes and textures
   * finish loading.
   */
  public resourceLoaded$: BehaviorSubject<boolean> = new BehaviorSubject(false);

  /**
   * ID of the HTML element that will hold the rendering context.
   */
  private elementId: string = 'gz-scene';

  /**
   * The Gzweb Scene.
   */
  private scene: Scene | undefined;

  /**
   * The Gzweb SDF Parser. Allows us to obtain an Object3D out of an SDF file.
   */
  private sdfParser: SDFParser | undefined;

  /**
   * The object being visualized.
   */
  private resource: Object3D | undefined;

  /**
   * For animation purposes. The timestamp of the previous render in milliseconds.
   */
  private previousRenderTimestampMs: number = 0;

  /**
   * For animation purposes. The frame used to cancel the animation.
   */
  private cancelAnimationFrame: number = 0;

  /**
   * The scaling basis used, if the model is scaled.
   */
  private scalingBasis: number = 1;

  /**
   * Whether or not the model should be scaled.
   */
  private shouldScaleModel: boolean = false;

  /**
   * Used to determine if the model is already scaled.
   */
  private isScaled: boolean = false;

  /**
   * Whether or not PBR materials should be used.
   */
  private shouldUsePBR: boolean = false;

  /**
   * Fuel Server Bearer Token used in case the resource is private.
   */
  private token: string | undefined;

  /**
   * The HTML element that holds the scene.
   */
  private sceneElement: HTMLElement | undefined;

  /**
   * Once the Asset Viewer is created, it will setup the scene and start the animation loop.
   *
   * @param config The Asset Viewer configuration options.
   */
  constructor(config: AssetViewerConfig) {
    this.elementId = config.elementId ?? 'gz-scene';
    this.token = config.token;

    this.setupVisualization();

    if (this.scene && config.addModelLightning) {
      this.scene.addModelLighting();
    }

    this.shouldScaleModel = !!config.scaleModel;
    this.shouldUsePBR = !!config.enablePBR;

    this.animate();
  }

  /**
   * Destroy the scene.
   */
  public destroy() {
    if (this.cancelAnimationFrame) {
      cancelAnimationFrame(this.cancelAnimationFrame);
    }

    this.previousRenderTimestampMs = 0;

    if (this.scene) {
      this.scene.cleanup();
    }
  }

  /**
   * Resize the scene, according to its container's size.
   */
  public resize(): void {
    if (this.scene && this.sceneElement) {
      this.scene.setSize(this.sceneElement.clientWidth, this.sceneElement.clientHeight);
    }
  }

  /**
   * Position the camera to start visualizing the asset.
  */
  public resetView() {
    const camera = this.scene?.camera;
    if (camera) {
      camera.position.x = this.scalingBasis * 1.1;
      camera.position.y = -this.scalingBasis * 1.4;
      camera.position.z = this.scalingBasis * 0.6;
      camera.rotation.x = 67 * Math.PI / 180;
      camera.rotation.y = 33 * Math.PI / 180;
      camera.rotation.z = 12 * Math.PI / 180;
    }
  }

  /**
   * Given all the resource URLs, look for its SDF file and render it.
   * The obtained Object3D will be added to the Scene.
   *
   * @param files All the resource's related URLs.
   */
  public renderFromFiles(files: string[]): void {
    if (!this.scene || !this.sdfParser) {
      return;
    }

    this.sdfParser.usingFilesUrls = true;
    this.sdfParser.enablePBR = this.shouldUsePBR;

    // Look for SDF file.
    const sdfFile = files.find((file) => file.endsWith(".sdf"));

    // Add files to the Parser.
    files.forEach((file) => this.sdfParser!.addUrl(file));

    if (sdfFile) {
      this.sdfParser.loadSDF(sdfFile, (obj: Object3D) => {
        // Object has finished loading.
        this.resource = obj;

        this.scene?.add(obj);

        this.resourceLoaded$.next(true);
      });
    }
  }

  /**
   * Auxiliar method to scale the model. We aim to have it's largest dimension
   * scaled to a power of 10 (scaling basis).
   */
  public scaleModel(): void {
    if (!this.resource) {
      return;
    }

    // Create a bounding box for the object and calculate its size and center.
    const boundingBox = new Box3().setFromObject(this.resource);
    if (boundingBox.isEmpty()) {
      return;
    }

    const size = new Vector3();
    const center = new Vector3();
    boundingBox.getSize(size);
    boundingBox.getCenter(center);
    const maxDimension = Math.max(size.x, size.y, size.z);

    // Translate and rescale.
    // The scaling basis is calculated using the maximum dimension. Allows us to scale large models.
    // It is a power of 10.
    this.scalingBasis = Math.pow(10, Math.trunc(maxDimension).toString().length - 1);
    const scale = this.scalingBasis / maxDimension;

    center.multiplyScalar(-scale);
    this.resource.position.x = center.x;
    this.resource.position.y = center.y;
    this.resource.position.z = center.z;

    this.resource.scale.x = scale;
    this.resource.scale.y = scale;
    this.resource.scale.z = scale;

    // Re-center camera and avoid subsequent calls to this method in the animation loop.
    this.isScaled = true;
    this.resetView();
  }

  /**
   * Prepare the Gzweb Scene and SDF Parser before anything is added.
   */
  private setupVisualization(): void {
    this.scene = new Scene({
      shaders: new Shaders(),
    });

    this.sdfParser = new SDFParser(this.scene);

    if (this.token) {
      const header = 'Authorization';
      const value = `Bearer ${this.token}`;

      this.scene.setRequestHeader(header, value);
      this.sdfParser.setRequestHeader(header, value);
    }

    if (window.document.getElementById(this.elementId)) {
      this.sceneElement = window.document.getElementById(this.elementId)!;
      this.sceneElement.appendChild(this.scene.getDomElement());
      this.resize();
    } else {
      console.error('Unable to find HTML element with an id of', this.elementId);
    }
  }

  /**
   * The animation loop.
   */
  private animate(): void {
    if (!this.scene) {
      return;
    }

    // Scale the model on the animation loop.
    // Loading meshes is an asynchronous process, so after loading the SDF file, its bounding box may be empty.
    // This is done only once, after a mesh is loaded and the model's bounding box is not empty.
    if (this.resource !== undefined && this.shouldScaleModel && !this.isScaled) {
      this.scaleModel();
    }

    this.cancelAnimationFrame = requestAnimationFrame((timestampMs: number) => {
      if (this.previousRenderTimestampMs === 0) {
        this.previousRenderTimestampMs = timestampMs;
      }

      this.animate();

      this.scene!.render(timestampMs - this.previousRenderTimestampMs);
      this.previousRenderTimestampMs = timestampMs;
    });
  }
}
