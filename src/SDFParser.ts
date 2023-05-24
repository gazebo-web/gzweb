import * as THREE from 'three';
import { EventEmitter2 } from 'eventemitter2';
import { X2jOptions, XMLParser, XMLValidator } from 'fast-xml-parser';

import { getDescendants } from './Globals';
import { FuelServer,
         createFuelUri } from './FuelServer';
import { Color } from './Color';
import { Inertia } from './Inertia';
import { Material } from './Material';
import { PBRMaterial } from './PBRMaterial';
import { Pose } from './Pose';
import { Scene } from './Scene';

import System, {
  Body,
  BoxZone,
  Emitter,
  Life,
  Position,
  Radius,
  Rate,
  Scale,
  Span,
  SpriteRenderer,
  VectorVelocity,
  // @ts-ignore
} from 'three-nebula';

import { Message } from 'protobufjs';

class PendingMesh {
  public meshUri: string = '';
  public submesh: string = '';
  public parent: THREE.Object3D;
  public material: Material;
  public centerSubmesh: boolean = false;
}

export class SDFParser {
  // true for using URLs to load files.
  // false for using the files loaded in the memory.
  public usingFilesUrls: boolean = false;

  // Flag to control the usage of PBR materials (enabled by default).
  public enablePBR: boolean = true;

  private scene: Scene;
  private SDF_VERSION: number = 1.5;
  private MATERIAL_ROOT: string = 'assets';
  private emitter: EventEmitter2 = new EventEmitter2({verboseMemoryLeak: true});
  // cache materials if more than one model needs them
  private materials = {};
  private entityMaterial = {};

  // store meshes when loading meshes from memory.
  private meshes = {};
  // Used to avoid loading meshes multiple times. An array that contains:
  // meshUri, submesh, material and the parent visual Object of the mesh.
  private pendingMeshes: PendingMesh[] = [];

  // This map is used to handle included models and avoid duplicated requests.
  // The key is the model's URI.
  // The value is an object that has a models array, which contains the pending models,
  // and it also contains the sdf, if it was read.
  // The value is an array of objects that contain the models that use the same uri and
  // their parents.
  // Models have a different name and pose that needs to be set once the model files resolve.
  // Map is not available in es5, so we need to suppress the linter warnings.
  private pendingModels = new Map();

  private mtls = {};
  private textures = {};

  // Should contain model files URLs if not using gzweb model files hierarchy.
  private customUrls: string[] = [];

  // Used for communication with Fuel Servers.
  private fuelServer: FuelServer;
  private requestHeaderKey: string
  private requestHeaderValue: string;

  /**
  * SDF parser constructor initializes SDF parser with the given parameters
  * and defines a DOM parser function to parse SDF XML files
  * @param {Scene} scene - the gz3d scene object
  **/
  constructor(scene: Scene) {
    this.scene = scene;
    this.scene.setSDFParser(this);
    this.scene.initScene();

    var that = this;
    this.emitter.on('material', function(mat) {
      that.materials = Object.assign(that.materials, mat);
    });

    this.fuelServer = new FuelServer();
  }

  /**
   * Pushes Urls into the customUrls array where the parser looks for assets.
   * If `usingFilesUrls` is true, resources will only be taken from this array.
   * TODO: Find a less intrusive way to support custom URLs (issue #147)
   */
  public addUrl(url: string): void {
    var trimmedUrl = url && url.trim();
    if (trimmedUrl === undefined || trimmedUrl.indexOf('http') !== 0)
    {
      console.warn('Trying to add invalid URL: ' + url);
      return;
    }

    // Avoid duplicated URLs.
    if (this.customUrls.indexOf(trimmedUrl) === -1) {
      this.customUrls.push(trimmedUrl);
    }
  }

  /**
   * Parses a color, which may come from an object or string.
   * @param {string|object} colorInput - A string which denotes the color where every value
   * should be separated with single white space, or an object containing rgba values
   * @returns {object} color - color object having r, g, b and alpha values
   */
  public parseColor(colorInput: string | object): Color {
    let color: Color = new Color();
    var values = [];
    if (typeof colorInput === 'string') {
      values = colorInput.split(/\s+/);
    } else {
      values = [
        colorInput['r'] || 0,
        colorInput['g'] || 0,
        colorInput['b'] || 0,
        colorInput['a'] || 1
      ];
    }

    color.r = parseFloat(values[0]);
    color.g = parseFloat(values[1]);
    color.b = parseFloat(values[2]);
    color.a = parseFloat(values[3]);

    return color;
  }

  /**
   * Parses string which is a 3D vector
   * @param {string|object} vectorInput - string which denotes the vector where every value
   * should be separated with single white space, or an object containing x, y, z values.
   * @returns {object} vector3D - vector having x, y, z values
   */
  public parse3DVector(vectorInput: string | object): THREE.Vector3 {
    let vector3D: THREE.Vector3 = new THREE.Vector3();
    var values = [];
    if (typeof vectorInput === 'string') {
      values = vectorInput.split(/\s+/);
    } else {
      values = [
        vectorInput['x'] || 0,
        vectorInput['y'] || 0,
        vectorInput['z'] || 0
      ];
    }
    vector3D.x = parseFloat(values[0]);
    vector3D.y = parseFloat(values[1]);
    vector3D.z = parseFloat(values[2]);
    return new THREE.Vector3(vector3D.x, vector3D.y, vector3D.z);
  }

  /**
   * Creates a light from either a protobuf object or SDF object.
   * @param {object} light - A light represented by a Protobuf or SDF object.
   * @returns {THREE.Light} lightObj - THREE light object created
   * according to given properties. The type of light object is determined
   * according to light type
   */
  public spawnLight(light: any): THREE.Object3D {
    if (light.type !== undefined && !(light.type instanceof String)) {
      return this.spawnLightFromProto(light);
    } else {
      return this.spawnLightFromSDF({light: light});
    }
  }

  /**
   * Creates THREE light object according to properties of sdf object
   * which is parsed from sdf model of the light
   * @param {object} sdfObj - object which is parsed from the sdf string
   * @returns {THREE.Object3D} lightObj - THREE.Object3D that holds the
   * THREE.Light created according to given properties. The type of light
   * object is determined according to light type
   */
  public spawnLightFromSDF(sdfObj: any): THREE.Object3D {
    let light = sdfObj.light;
    let name: string = light['@name'] || light['name'];
    let diffuse: Color = this.parseColor(light.diffuse);
    let specular: Color = this.parseColor(light.specular);
    let pose = this.parsePose(light.pose);
    let castShadows: boolean = this.parseBool(light.cast_shadows);
    let distance: number = 0.0;
    let attConst: number = 0.0;
    let attLin: number = 0.0;
    let attQuad: number = 0.0;
    let direction: THREE.Vector3 = new THREE.Vector3();
    let innerAngle: number = 0.0;
    let outerAngle: number = 0.0;
    let falloff: number = 0.0;
    let type: number = 1;

    if (light.attenuation)
    {
      if (light.attenuation.range)
      {
        distance = parseFloat(light.attenuation.range);
      }
      if (light.attenuation.constant)
      {
        attConst = parseFloat(light.attenuation.constant);
      }
      if (light.attenuation.linear)
      {
        attLin = parseFloat(light.attenuation.linear);
      }
      if (light.attenuation.quadratic)
      {
        attQuad = parseFloat(light.attenuation.quadratic);
      }
    }
    if (light.spot)
    {
      if (light.spot.inner_angle)
      {
        innerAngle = parseFloat(light.spot.inner_angle);
      }
      if (light.spot.outer_angle)
      {
        outerAngle = parseFloat(light.spot.outer_angle);
      }
      if (light.spot.falloff)
      {
        falloff = parseFloat(light.spot.falloff);
      }
    }
    // equation taken from
    // eslint-disable-next-line
    // https://docs.blender.org/manual/en/dev/render/blender_render/lighting/lights/light_attenuation.html
    var E = 1;
    var D = 1;
    var r = 1;
    var L = attLin;
    var Q = attQuad;
    var intensity = E*(D/(D+L*r))*(Math.pow(D,2)/(Math.pow(D,2)+Q*Math.pow(r,2)));

    if (light['@type'] === 'point')
    {
      type = 1;
    }
    if (light['@type'] === 'spot')
    {
      type = 2;
    }
    else if (light['@type'] === 'directional')
    {
      type = 3;
      direction = this.parse3DVector(light.direction);
    }
    let lightObj: THREE.Object3D = this.scene.createLight(type, diffuse, intensity, pose,
        distance, castShadows, name, direction, specular,
        attConst, attLin, attQuad, innerAngle, outerAngle, falloff);

    return lightObj;
  }

  /**
   * Creates THREE light object according to properties of protobuf object
   * @param {object} pbObj - object which is parsed from a Protobuf string
   * @returns {THREE.Light} lightObj - THREE.Object3d that holds the
   * THREE.Light object created according to given properties. The type of
   * light object is determined according to light type
   */
  public spawnLightFromProto(light: any): THREE.Object3D {
    // equation taken from
    // eslint-disable-next-line
    // https://docs.blender.org/manual/en/dev/render/blender_render/lighting/lights/light_attenuation.html
    let E = 1;
    let D = 1;
    let r = 1;
    let L = light.attenuation_linear;
    let Q = light.attenuation_quadratic;
    let intensity = E*(D/(D+L*r))*(Math.pow(D,2)/(Math.pow(D,2)+Q*Math.pow(r,2)));

    let lightObj: THREE.Object3D = this.scene.createLight(
      // Protobuf light type starts at zero.
      light.type + 1,
      light.diffuse,
      intensity,
      light.pose,
      light.range,
      light.cast_shadows,
      light.name,
      light.direction,
      light.specular,
      light.attenuation_constant,
      light.attenuation_linear,
      light.attenuation_quadratic,
      light.spot_inner_angle,
      light.spot_outer_angle,
      light.spot_falloff);

    return lightObj;
  }

  /**
   * Parses a string which is a 3D vector
   * @param {string|object} poseInput - string which denotes the pose of the object
   * where every value should be separated with single white space and
   * first three denotes x,y,z and values of the pose,
   * and following three denotes euler rotation around x,y,z, or an object
   * containing pose and orientation.
   * @returns {object} pose - pose object having position (x,y,z)(THREE.Vector3)
   * and orientation (THREE.Quaternion) properties
   */
  public parsePose(poseInput: string | object): Pose {
    const pose: Pose = new Pose();

    // Short circuit if poseInput is undefined
    if (poseInput === undefined) {
      return pose;
    }

    if (poseInput.hasOwnProperty('position') &&
        poseInput.hasOwnProperty('orientation')) {
      pose.position.x = poseInput['position']['x'];
      pose.position.y = poseInput['position']['y'];
      pose.position.z = poseInput['position']['z'];
      pose.orientation.x = poseInput['orientation']['x'];
      pose.orientation.y = poseInput['orientation']['y'];
      pose.orientation.z = poseInput['orientation']['z'];
      pose.orientation.w = poseInput['orientation']['w'];
      return pose;
    }

    let poseStr: string = '';
    if (typeof poseInput === 'object') {
      // Note: The pose might have an empty frame attribute. This is a valid XML
      // element though. In this case, the parser outputs
      // {@frame: "frame", #text: "pose value"}
      if (poseInput.hasOwnProperty('@frame')) {
        console.warn('SDFParser does not support frame semantics.');
      }
      poseStr = poseInput['#text'];
    } else {
      poseStr = poseInput;
    }

    const values = poseStr.trim().split(/\s+/);

    pose.position.x = parseFloat(values[0]);
    pose.position.y = parseFloat(values[1]);
    pose.position.z = parseFloat(values[2]);

    // get euler rotation and convert it to Quaternion
    var euler = new THREE.Euler(parseFloat(values[3]),
                                parseFloat(values[4]),
                                parseFloat(values[5]), 'ZYX');
    pose.orientation.setFromEuler(euler);

    return pose;
  }

  /**
   * Parses a string which is a 3D vector
   * @param {string|object} scaleInput - string which denotes scaling in x,y,z
   * where every value should be separated with single white space, or an object
   * containing x, y, z values.
   * @returns {THREE.Vector3} scale - THREE Vector3 object
   * which denotes scaling of an object in x,y,z
   */
  public parseScale(scaleInput: string | object): THREE.Vector3 {
    var values = [];
    if (typeof scaleInput === 'string') {
      values = scaleInput.split(/\s+/);
    } else {
      values = [
        scaleInput['x'] || 1,
        scaleInput['y'] || 1,
        scaleInput['z'] || 1
      ];
    }
    var scale = new THREE.Vector3(parseFloat(values[0]), parseFloat(values[1]),
            parseFloat(values[2]));
    return scale;
  }

  /**
   * Parses a string which is a boolean
   * @param {string} boolStr - string which denotes a boolean value
   * where the values can be true, false, 1, or 0.
   * @returns {bool} bool - bool value
   */
  public parseBool(boolStr: string): boolean {
    if (boolStr !== undefined) {
      return JSON.parse(boolStr);
    }

    return false;
  }

  /**
   * Parses SDF material element which is going to be used by THREE library
   * It matches material scripts with the material objects which are
   * already parsed by gzbridge and saved by SDFParser.
   * If `usingFilesUrls` is true, the texture URLs will be loaded from the
   * to the customUrls array.
   * @param {object} material - SDF or Protobuf material object
   * @returns {object} material - material object which has the followings:
   * texture, normalMap, ambient, diffuse, specular, opacity
   */
  public createMaterial(srcMaterial: any): Material {
    var texture, mat;
    let material: Material = new Material();

    if (!srcMaterial) {
      return material;
    }

    if (srcMaterial.ambient) {
      material.ambient = this.parseColor(srcMaterial.ambient);
    }

    if (srcMaterial.diffuse) {
      material.diffuse = this.parseColor(srcMaterial.diffuse);
    }

    if (srcMaterial.specular) {
      material.specular = this.parseColor(srcMaterial.specular);
    }

    material.opacity = srcMaterial.opacity;
    material.normalMap = srcMaterial.normalMap;
    material.scale = srcMaterial.scale;

    // normal map
    if (srcMaterial.normal_map)
    {
      let mapUri: string = '';
      if (srcMaterial.normal_map.indexOf('://') > 0)
      {
        mapUri = srcMaterial.normal_map.substring(
                srcMaterial.normal_map.indexOf('://') + 3,
                srcMaterial.normal_map.lastIndexOf('/'));
      }

      if (mapUri != '')
      {
        var startIndex = srcMaterial.normal_map.lastIndexOf('/') + 1;
        if (startIndex < 0) {
          startIndex = 0;
        }

        var normalMapName = srcMaterial.normal_map.substr(startIndex,
          srcMaterial.normal_map.lastIndexOf('.') - startIndex);
        // Map texture name to the corresponding texture.
        if (!this.usingFilesUrls) {
          material.normalMap = this.textures[normalMapName + '.png'];
        } else {
          if (this.customUrls.length !== 0) {
            for (var j = 0; j < this.customUrls.length; j++) {
              if (this.customUrls[j].indexOf(normalMapName + '.png') > -1) {
                material.normalMap = this.customUrls[j];
                break;
              }
            }
          } else {
            material.normalMap = this.MATERIAL_ROOT + '/' + mapUri + '/' +
              normalMapName + '.png';
          }
        }
      }
    }

    // Material properties received via a protobuf message are formatted
    // differently from SDF. This will map protobuf format onto sdf.
    if (srcMaterial.pbr && this.enablePBR) {
      material.pbr = new PBRMaterial();
      if (srcMaterial.pbr.metal) {
        // Must be SDF with metal properties.
        material.pbr.albedoMap = srcMaterial.pbr.metal.albedo_map;
        material.pbr.metalness = srcMaterial.pbr.metal.metalness;
        material.pbr.metalnessMap = srcMaterial.pbr.metal.metalness_map;
        material.pbr.normalMap = srcMaterial.pbr.metal.normal_map;
        material.pbr.roughness = srcMaterial.pbr.metal.roughness;
        material.pbr.roughnessMap = srcMaterial.pbr.metal.roughness_map;
        material.pbr.emissiveMap = srcMaterial.pbr.metal.emissive_map;
        material.pbr.lightMap = srcMaterial.pbr.metal.light_map;
        material.pbr.environmentMap = srcMaterial.pbr.metal.environment_map;
        material.pbr.ambientOcclusionMap = srcMaterial.pbr.metal.ambient_occlusion_map;
      } else if (srcMaterial.pbr.specular) {
        // Must be SDF with specular properties.
        material.pbr.albedoMap = srcMaterial.pbr.specular.albedo_map;
        material.pbr.specularMap = srcMaterial.pbr.specular.specular_map;
        material.pbr.glossinessMap = srcMaterial.pbr.specular.glossiness_map;
        material.pbr.glossiness = srcMaterial.pbr.specular.glossiness;
        material.pbr.environmentMap = srcMaterial.pbr.specular.environment_map;
        material.pbr.ambientOcclusionMap = srcMaterial.pbr.specular.ambient_occlusion_map;
        material.pbr.normalMap = srcMaterial.pbr.specular.normal_map;
        material.pbr.emissiveMap = srcMaterial.pbr.specular.emissive_map;
        material.pbr.lightMap = srcMaterial.pbr.specular.light_map;
      } else {
        // Must be a protobuf message.
        material.pbr.albedoMap = srcMaterial.pbr.albedo_map;
        material.pbr.normalMap = srcMaterial.pbr.normal_map;
        material.pbr.metalness = srcMaterial.pbr.metalness;
        material.pbr.metalnessMap = srcMaterial.pbr.metalness_map;
        material.pbr.roughness = srcMaterial.pbr.roughness;
        material.pbr.roughnessMap = srcMaterial.pbr.roughness_map;
        material.pbr.glossiness = srcMaterial.pbr.glossiness;
        material.pbr.glossinessMap = srcMaterial.pbr.glossiness_map;
        material.pbr.specularMap = srcMaterial.pbr.specular_map;
        material.pbr.environmentMap = srcMaterial.pbr.environment_map;
        material.pbr.emissiveMap = srcMaterial.pbr.emissive_map;
        material.pbr.lightMap = srcMaterial.pbr.light_map;
        material.pbr.ambientOcclusionMap = srcMaterial.pbr.ambient_occlusion_map;
      }
    }

    // Set the correct URLs of the PBR-related textures, if available.
    if (material.pbr && this.enablePBR) {
      // Iterator for the subsequent for loops. Used to avoid a linter warning.
      // Loops (and all variables in general) should use let/const when ported to ES6.
      var u;
      if (material.pbr.albedoMap) {
        let albedoMap: string = '';
        let albedoMapName: string = material.pbr.albedoMap.split('/').pop()!;

        if (material.pbr.albedoMap.startsWith('https://')) {
          this.addUrl(material.pbr.albedoMap);
        }

        if (this.usingFilesUrls && this.customUrls.length !== 0) {
          for (let u = 0; u < this.customUrls.length; u++) {
            if (this.customUrls[u].indexOf(albedoMapName) > -1) {
              albedoMap = this.customUrls[u];
              break;
            }
          }
          if (albedoMap) {
            material.pbr.albedoMap = albedoMap;
          } else {
            console.error('Missing Albedo Map file [' + material.pbr.albedoMap + ']');
            // Prevent the map from loading, as it hasn't been found.
            material.pbr.albedoMap = '';
          }
        }
      }

      if (material.pbr.emissiveMap) {
        let emissiveMap: string = '';
        let emissiveMapName: string =
          material.pbr.emissiveMap.split('/').pop()!;

        if (material.pbr.emissiveMap.startsWith('https://')) {
          this.addUrl(material.pbr.emissiveMap);
        }

        if (this.usingFilesUrls && this.customUrls.length !== 0) {
          for (u = 0; u < this.customUrls.length; u++) {
            if (this.customUrls[u].indexOf(emissiveMapName) > -1) {
              emissiveMap = this.customUrls[u];
              break;
            }
          }
          if (emissiveMap) {
            material.pbr.emissiveMap = emissiveMap;
          } else {
            console.error('Missing Emissive Map file [' + material.pbr.emissiveMap + ']');
            // Prevent the map from loading, as it hasn't been found.
            material.pbr.emissiveMap = '';
          }
        }
      }

      if (material.pbr.normalMap) {
        let pbrNormalMap: string = '';
        let pbrNormalMapName: string = material.pbr.normalMap.split('/').pop()!;

        if (material.pbr.normalMap.startsWith('https://')) {
          this.addUrl(material.pbr.normalMap);
        }

        if (this.usingFilesUrls && this.customUrls.length !== 0) {
          for (u = 0; u < this.customUrls.length; u++) {
            if (this.customUrls[u].indexOf(pbrNormalMapName) > -1) {
              pbrNormalMap = this.customUrls[u];
              break;
            }
          }
          if (pbrNormalMap) {
            material.pbr.normalMap = pbrNormalMap;
          } else {
            console.error('Missing Normal Map file [' + material.pbr.normalMap + ']');
            // Prevent the map from loading, as it hasn't been found.
            material.pbr.normalMap = '';
          }
        }
      }

      if (material.pbr.roughnessMap) {
        let roughnessMap: string = '';
        let roughnessMapName: string = material.pbr.roughnessMap.split('/').pop()!;

        if (material.pbr.roughnessMap.startsWith('https://')) {
          this.addUrl(material.pbr.roughnessMap);
        }

        if (this.usingFilesUrls && this.customUrls.length !== 0) {
          for (u = 0; u < this.customUrls.length; u++) {
            if (this.customUrls[u].indexOf(roughnessMapName) > -1) {
              roughnessMap = this.customUrls[u];
              break;
            }
          }
          if (roughnessMap) {
            material.pbr.roughnessMap = roughnessMap;
          } else {
            console.error('Missing Roughness Map file [' + material.pbr.roughnessMap + ']');
            // Prevent the map from loading, as it hasn't been found.
            material.pbr.roughnessMap = '';
          }
        }
      }

      if (material.pbr.metalnessMap) {
        let metalnessMap: string = '';
        let metalnessMapName: string =
          material.pbr.metalnessMap.split('/').pop()!;

        if (material.pbr.metalnessMap.startsWith('https://')) {
          this.addUrl(material.pbr.metalnessMap);
        }

        if (this.usingFilesUrls && this.customUrls.length !== 0) {
          for (u = 0; u < this.customUrls.length; u++) {
            if (this.customUrls[u].indexOf(metalnessMapName) > -1) {
              metalnessMap = this.customUrls[u];
              break;
            }
          }
          if (metalnessMap) {
            material.pbr.metalnessMap = metalnessMap;
          } else {
            console.error('Missing Metalness Map file [' + material.pbr.metalnessMap + ']');
            // Prevent the map from loading, as it hasn't been found.
            material.pbr.metalnessMap = '';
          }
        }
      }
    }

    return material;
  }

  /**
   * Parses a string which is a size of an object
   * @param {string|object} sizeInput - string which denotes size in x,y,z
   * where every value should be separated with single white space, or an object
   * containing x, y, z values.
   * @returns {object} size - size object which denotes
   * size of an object in x,y,z
   */
  public parseSize(sizeInput: string | THREE.Vector3): THREE.Vector3 {
    if (typeof sizeInput === 'string') {
      let values: string[] = sizeInput.split(/\s+/);
      return new THREE.Vector3(
        parseFloat(values[0]),
        parseFloat(values[1]),
        parseFloat(values[2]));
    }

    return new THREE.Vector3(sizeInput.x, sizeInput.y, sizeInput.z);
  }

  /**
   * Parses SDF geometry element and creates corresponding mesh,
   * when it creates the THREE.Mesh object it directly add it to the parent
   * object.
   * @param {object} geom - SDF geometry object which determines the geometry
   *  of the object and can have following properties: box, cylinder, sphere,
   *  plane, mesh.
   *  Note that in case of using custom Urls for the meshs, the URLS should be
   *  added to the array cistomUrls to be used instead of the default Url.
   * @param {object} mat - SDF material object which is going to be parsed
   * by createMaterial function
   * @param {object} parent - parent 3D object
   * @param {object} options - Options to send to the creation process. It can include:
   *                 - enableLights - True to have lights visible when the object is created.
   *                                  False to create the lights, but set them to invisible (off).
   *                 - fuelName - Name of the resource in Fuel. Helps to match URLs to the correct path. Requires 'fuelOwner'.
   *                 - fuelOwner - Name of the resource's owner in Fuel. Helps to match URLs to the correct path. Requires 'fuelName'.
   */
  public createGeom(geom: any, mat: any, parent: THREE.Object3D, options: any): void {
    let that = this;
    let obj: THREE.Mesh | undefined = undefined;
    let size;
    let normal: THREE.Vector3 = new THREE.Vector3(0, 0, 1);

    var material = this.createMaterial(mat);

    if (geom.box)
    {
      if (geom.box.size) {
        size = this.parseSize(geom.box.size);
      } else {
        size = {x: 1, y: 1, z: 1};
      }
      obj = this.scene.createBox(size.x, size.y, size.z);
    }
    else if (geom.cylinder)
    {
      var radius = parseFloat(geom.cylinder.radius);
      var length = parseFloat(geom.cylinder.length);
      obj = this.scene.createCylinder(radius, length);
    }
    else if (geom.sphere)
    {
      obj = this.scene.createSphere(parseFloat(geom.sphere.radius));
    }
    else if (geom.plane)
    {
      if (geom.plane.normal) {
        normal = this.parseSize(geom.plane.normal);
      }

      if (geom.plane.size) {
        size = this.parseSize(geom.plane.size);
      } else {
        size = {x: 1, y: 1};
      }
      obj = this.scene.createPlane(normal, size.x, size.y);
    }
    else if (geom.mesh)
    {
      let meshUri: string = geom.mesh.uri || geom.mesh.filename;
      let submesh: string = '';
      let centerSubmesh: boolean = false;
      let modelName: string = '';

      if (geom.mesh.submesh)
      {
        // Submesh information coming from protobuf messages is slightly
        // different than submesh information coming from an SDF file.
        //
        // * protobuf message has 'submesh' and 'center_submesh'
        // * SDF file has 'submesh.name' and 'submesh.center'
        if (geom.mesh.center_submesh !== undefined) {
          submesh = geom.mesh.submesh;
          centerSubmesh = this.parseBool(geom.mesh.center_submesh);
        } else {
          submesh = geom.mesh.submesh.name;
          centerSubmesh = this.parseBool(geom.mesh.submesh.center);
        }
      }

      var uriType = meshUri.substring(0, meshUri.indexOf('://'));
      if (uriType === 'file' || uriType === 'model') {
        modelName = meshUri.substring(meshUri.indexOf('://') + 3);
      } else {
        modelName = meshUri;
      }

      if (geom.mesh.scale) {
        var scale = this.parseScale(geom.mesh.scale);
        parent.scale.x = scale.x;
        parent.scale.y = scale.y;
        parent.scale.z = scale.z;
      }

      // Create a valid Fuel URI from the model name
      let modelUri: string = createFuelUri(modelName);

      let ext: string = modelUri.substr(-4).toLowerCase();
      let materialName: string = parent.name + '::' + modelUri;
      this.entityMaterial[materialName] = material;
      let meshFileName: string = meshUri.substring(meshUri.lastIndexOf('/'));

      if (!this.usingFilesUrls) {
        var meshFile = this.meshes[meshFileName];
        if (!meshFile) {
          console.error('Missing mesh file [' + meshFileName + ']');
          return;
        }

        if (ext === '.obj') {
          var mtlFileName = meshFileName.split('.')[0]+'.mtl';
          var mtlFile = this.mtls[mtlFileName];
          if (!mtlFile) {
            console.error('Missing MTL file [' + mtlFileName + ']');
            return;
          }

          that.scene.loadMeshFromString(modelUri, submesh, centerSubmesh,
            function(obj: any): void {
              if (!obj) {
                console.error('Failed to load mesh.');
                return;
              }

              parent.add(obj);
              loadGeom(parent);
            },

            // onError callback
            function(error: any): void {
              console.error(error);
            },
            [meshFile, mtlFile]);
        }
        else if (ext === '.dae') {
          that.scene.loadMeshFromString(modelUri, submesh, centerSubmesh,
            function(dae: THREE.Object3D): void {
              if (!dae) {
                console.error('Failed to load mesh.');
                return;
              }

              if (material) {
                let allChildren: THREE.Object3D[] = [];
                getDescendants(dae, allChildren);
                for (var c = 0; c < allChildren.length; ++c) {
                  if (allChildren[c] instanceof THREE.Mesh) {
                    that.scene.setMaterial(allChildren[c] as THREE.Mesh,
                                           material);
                    break;
                  }
                }
              }
              parent.add(dae);
              loadGeom(parent);
            },
            // onError callback
            function(error: any): void {
              console.error(error);
            },
            [meshFile]);
        }
      } else {
        if (this.customUrls.length !== 0) {
          for (var k = 0; k < this.customUrls.length; k++) {
            if (this.customUrls[k].indexOf(meshFileName) > -1) {
              // If we have Fuel name and owner information, make sure the
              // path includes them.
              if (options && options.fuelName && options.fuelOwner) {
                if (this.customUrls[k].indexOf(options.fuelName) > -1 &&
                    this.customUrls[k].indexOf(options.fuelOwner) > -1) {
                  modelUri = this.customUrls[k];
                  break;
                }
              } else {
                // No Fuel name and owner provided. Use the filename.
                modelUri = this.customUrls[k];
                break;
              }
            }
          }
        }

        // Avoid loading the mesh multiple times.
        for (var i = 0; i < this.pendingMeshes.length; i++) {
          if (this.pendingMeshes[i].meshUri === modelUri) {
            // The mesh is already pending, but submesh and the visual object
            // parent are different.
            this.pendingMeshes.push({
              meshUri: modelUri,
              submesh: submesh,
              parent: parent,
              material: material,
              centerSubmesh: centerSubmesh
            });

            // If the mesh exists, then create another version and add it to
            // the parent object.
            if (this.scene.meshes.has(modelUri)) {
              let mesh: THREE.Mesh = this.scene.meshes.get(modelUri)!;
              if (parent.getObjectByName(mesh.name) === undefined) {
                mesh = mesh.clone();
                this.scene.useSubMesh(mesh, submesh, centerSubmesh);
                parent.add(mesh);
                loadGeom(parent);
              }
            }
            return;
          }
        }
        this.pendingMeshes.push({
          meshUri: modelUri,
          submesh: submesh,
          parent: parent,
          material: material,
          centerSubmesh: centerSubmesh
        });

        // Load the mesh.
        // Once the mesh is loaded, it will be stored on Gz3D.Scene.
        this.scene.loadMeshFromUri(modelUri, submesh, centerSubmesh,
          // onLoad
          function (mesh: THREE.Mesh)
          {
            // Check for the pending meshes.
            for (var i = 0; i < that.pendingMeshes.length; i++) {
              if (that.pendingMeshes[i].meshUri === mesh.name) {

                // No submesh: Load the result.
                if (!that.pendingMeshes[i].submesh) {
                  loadMesh(mesh, that.pendingMeshes[i].material,
                           that.pendingMeshes[i].parent, ext);
                } else {
                  // Check if the mesh belongs to a submesh.
                  let allChildren: THREE.Object3D[] = [];
                  getDescendants(mesh, allChildren);
                  for (var c = 0; c < allChildren.length; ++c) {
                    if (allChildren[c] instanceof THREE.Mesh) {
                      if (allChildren[c].name === that.pendingMeshes[i].submesh) {
                        loadMesh(mesh, that.pendingMeshes[i].material,
                                 that.pendingMeshes[i].parent, ext);
                      } else {
                        // The mesh is already stored in Scene.
                        // The new submesh will be parsed.
                        that.scene.loadMeshFromUri(mesh.name,
                          that.pendingMeshes[i].submesh,
                          that.pendingMeshes[i].centerSubmesh,
                          // on load
                          function(mesh: THREE.Mesh): void {
                            loadMesh(mesh, that.pendingMeshes[i].material,
                              that.pendingMeshes[i].parent, ext);
                          },
                          // on error
                          function(error: any): void {
                            console.error('Mesh loading error', error);
                          });
                      }
                    }
                  }
                }
              }
            }
          },
          // onError
          function(error: any) {
            console.error('Mesh loading error', modelUri);
          });
      }
    }
    else if (geom.heightmap) {
      this.scene.loadHeightmap(geom.heightmap.heights,
                               geom.heightmap.size.x,
                               geom.heightmap.size.y,
                               geom.heightmap.width,
                               geom.heightmap.height,
                               new THREE.Vector3(geom.heightmap.origin.x,
                                                 geom.heightmap.origin.y,
                                                 geom.heightmap.origin.z),
                              geom.heightmap.texture,
                              geom.heightmap.blend,
                              parent);

    }

    if (obj) {
      if (material) {
        // texture mapping for simple shapes and planes only,
        // not used by mesh and terrain
        this.scene.setMaterial(obj, material);
      }
      obj.updateMatrix();
      parent.add(obj);
      loadGeom(parent);
    }

    // Callback function when the mesh is ready.
    function loadMesh(mesh: THREE.Mesh, material: Material,
                      parent: THREE.Object3D, ext: string) {
      if (!mesh) {
        console.error('Failed to load mesh.');
        return;
      }

      // Note: This material is the one created by the createMaterial method,
      // which is the material defined by the SDF file or the material script.
      if (material) {
        // Because the stl mesh doesn't have any children we cannot set
        // the materials like other mesh types.
        if (ext !== '.stl') {
          let allChildren: THREE.Object3D[] = [];
          getDescendants(mesh, allChildren);
          for (let c = 0; c < allChildren.length; ++c)
          {
            if (allChildren[c] instanceof THREE.Mesh)
            {
              // Some Collada files load their own textures.
              // If the mesh already has a material with
              // a texture, we skip this step (but only if there is no
              // PBR materials involved).
              let isColladaWithTexture: boolean = ext === '.dae' &&
                !!(<THREE.Mesh>allChildren[c]).material &&
                !!(<THREE.MeshBasicMaterial>(<THREE.Mesh>allChildren[c]).material).map;

              if (!isColladaWithTexture || material.pbr) {
                that.scene.setMaterial(allChildren[c] as THREE.Mesh, material);
                break;
              }
            }
          }
        }
        else
        {
          that.scene.setMaterial(mesh, material);
        }
      }
      else
      {
        // By default, the STL Loader creates meshes with a basic material with a random color.
        // If no material is set via the SDF file, provide a more appropriate one.
        if (ext === '.stl')
        {
          that.scene.setMaterial(mesh, {'ambient': [1,1,1,1]});
        }
      }

      parent.add(mesh.clone());
      loadGeom(parent);
    }

    function loadGeom(visualObj: THREE.Object3D) {
      let allChildren: THREE.Object3D[] = [];
      getDescendants(visualObj, allChildren);
      for (var c = 0; c < allChildren.length; ++c)
      {
        if (allChildren[c] instanceof THREE.Mesh)
        {
          allChildren[c].castShadow = true;
          allChildren[c].receiveShadow = true;

          if (visualObj.castShadow)
          {
            allChildren[c].castShadow = visualObj.castShadow;
          }
          if (visualObj.receiveShadow)
          {
            allChildren[c].receiveShadow = visualObj.receiveShadow;
          }

          if (visualObj.name.indexOf('COLLISION_VISUAL') >= 0)
          {
            allChildren[c].castShadow = false;
            allChildren[c].receiveShadow = false;

            allChildren[c].visible = that.scene.showCollisions;
          }
          break;
        }
      }
    }
  }

  /**
   * Parses SDF visual element and creates THREE 3D object by parsing
   * geometry element using createGeom function
   * @param {object} visual - SDF visual element
   * @param {object} options - Options to send to the creation process.
   * It can include:
   *   - enableLights - True to have lights visible when the object is created.
   *                    False to create the lights, but set them to invisible
   *                    (off).
   *   - fuelName - Name of the resource in Fuel. Helps to match URLs to the
   *                correct path. Requires 'fuelOwner'.
   *   - fuelOwner - Name of the resource's owner in Fuel. Helps to match URLs
   *                 to the correct path. Requires 'fuelName'.
   * @returns {THREE.Object3D} visualObj - 3D object which is created
   * according to SDF visual element.
   */
  public createVisual(visual: any, options: any): THREE.Object3D {
    let visualObj: THREE.Object3D = new THREE.Object3D();
    //TODO: handle these node values
    // cast_shadow, receive_shadows
    if (visual.geometry)
    {
      visualObj.name = visual['@name'] || visual['name'];

      if (visual.pose) {
        var visualPose = this.parsePose(visual.pose);
        this.scene.setPose(visualObj, visualPose.position,
                           visualPose.orientation);
      }

      this.createGeom(visual.geometry, visual.material, visualObj, options);
    }

    return visualObj;
  }

  /**
   * Parses SDF sensor element and creates THREE 3D object
   * @param {object} sensor - SDF sensor element
   * @param {object} options - Options to send to the creation process.
   * It can include:
   *  - fuelName - Name of the resource in Fuel. Helps to match URLs to the
   *               correct path. Requires 'fuelOwner'.
   *  - fuelOwner - Name of the resource's owner in Fuel. Helps to match URLs
   *                to the correct path. Requires 'fuelName'.
   * @returns {THREE.Object3D} sensorObj - 3D object which is created
   * according to SDF sensor element.
   */
  public createSensor(sensor: any, options: any): THREE.Object3D {
    let sensorObj: THREE.Object3D = new THREE.Object3D();
    sensorObj.name = sensor['name'] || sensor['@name'] || '';

    if (sensor.pose) {
      let sensorPose: Pose = this.parsePose(sensor.pose);
      this.scene.setPose(sensorObj, sensorPose.position, sensorPose.orientation);
    }

    return sensorObj;
  }

  /**
   * Parses an object and spawns the given 3D object.
   * @param {object} obj - The object, obtained after parsing the SDF or from
   * a world message.
   * @param {object} options - Options to send to the creation process.
   * It can include:
   *  - enableLights - True to have lights visible when the object is created.
   *                   False to create the lights, but set them to invisible
   *                   (off).
   *  - fuelName - Name of the resource in Fuel. Helps to match URLs to the
   *               correct path. Requires 'fuelOwner'.
   *  - fuelOwner - Name of the resource's owner in Fuel. Helps to match URLs
   *                to the correct path. Requires 'fuelName'.
   * @returns {THREE.Object3D} object - 3D object which is created from the
   * given object.
   */
  public spawnFromObj(obj: any, options: any): THREE.Object3D {
    if (obj.model) {
      return this.spawnModelFromSDF(obj, options);
    }
    else if (obj.light) {
      return this.spawnLight(obj);
    }
    else if (obj.world) {
      return this.spawnWorldFromSDF(obj, options);
    }
    console.error('Unable to spawn from obj', obj);
    return new THREE.Object3D();
  }

  /**
   * Parses SDF XML string or SDF XML DOM object and return the created Object3D
   * @param {object} sdf - It is either SDF XML string or SDF XML DOM object
   * @returns {THREE.Object3D} object - 3D object which is created from the
   * given SDF.
   */
  public spawnFromSDF(sdf: any): THREE.Object3D {
    let sdfObj: any = this.parseSDF(sdf);
    return this.spawnFromObj(sdfObj, {
      enableLights: true
    });
  }

  /**
   * Parses SDF XML string or SDF XML DOM object
   * @param {object} sdf - It is either SDF XML string or SDF XML DOM object
   * @returns {object} object - The parsed SDF object.
   */
  public parseSDF(sdf: any): any {
    // SDF as a string.
    let sdfString;
    if ((typeof sdf) === 'string') {
      sdfString = sdf;
    } else {
      const serializer = new XMLSerializer();
      sdfString = serializer.serializeToString(sdf);
    }

    const options: Partial<X2jOptions> = {
      ignoreAttributes: false,
      attributeNamePrefix: '@',
      htmlEntities: true,
    }

    let sdfObj;
    const parser = new XMLParser(options);
    const validation = XMLValidator.validate(sdfString, options);

    // Validator returns true or an error object.
    if (validation === true) {
      sdfObj = parser.parse(sdfString).sdf;
    } else {
      console.error('Failed to parse SDF: ', validation.err);
      return;
    }

    return sdfObj;
  }

  /**
   * Loads SDF file according to given name.
   * @param {string} sdfName - Either name of model / world or the filename
   * @param {function} callback - The callback to use once the SDF file is ready.
   */
  public loadSDF(sdfName: string, callback: any): void {
    if (!sdfName) {
      let m: string = 'Must provide either a model/world name or the URL of an SDF file';
      console.error(m);
      return;
    }
    let lowerCaseName: string = sdfName.toLowerCase();
    let filename: string = '';

    // In case it is a full URL
    if (lowerCaseName.indexOf('http') === 0) {
      filename = sdfName;
    }
    // In case it is just the model/world name, look for it on the default URL
    else {
      if (lowerCaseName.endsWith('.world') || lowerCaseName.endsWith('.sdf')) {
        filename = this.MATERIAL_ROOT + '/worlds/' + sdfName;
      } else {
        filename = this.MATERIAL_ROOT + '/' + sdfName + '/model.sdf';
      }
    }

    if (!filename) {
      console.error('Error: unable to load ' + sdfName + ' - file not found');
      return;
    }

    let that = this;
    this.fileFromUrl(filename, function(sdf: any) {
      if (!sdf) {
        console.error('Error: Failed to get the SDF file (' + filename +
                      '). The XML is likely invalid.');
        return;
      }
      callback(that.spawnFromSDF(sdf));
    });
  }

  /**
   * Creates 3D object from parsed model SDF
   * @param {object} sdfObj - parsed SDF object
   * @param {object} options - Options to send to the creation process.
   * It can include:
   *  - enableLights - True to have lights visible when the object is created.
   *                   False to create the lights, but set them to invisible (off).
   *  - fuelName - Name of the resource in Fuel. Helps to match URLs to the correct path. Requires 'fuelOwner'.
   *  - fuelOwner - Name of the resource's owner in Fuel. Helps to match URLs to the correct path. Requires 'fuelName'.
   * @returns {THREE.Object3D} modelObject - 3D object which is created
   * according to SDF model object.
   */
  public spawnModelFromSDF(sdfObj: any, options: any): THREE.Object3D {
    // create the model
    let modelObj: THREE.Object3D = new THREE.Object3D();
    modelObj.name = sdfObj.model['name'] || sdfObj.model['@name'];

    let pose: Pose;
    let i, j, k: number;
    let visualObj: THREE.Object3D;
    let linkObj: THREE.Object3D;
    let linkPose: Pose;

    if (sdfObj.model.pose)
    {
      pose = this.parsePose(sdfObj.model.pose);
      this.scene.setPose(modelObj, pose.position, pose.orientation);
    }

    //convert link object to link array
    if (sdfObj.model.link) {
        if (!(sdfObj.model.link instanceof Array))
        {
          sdfObj.model.link = [sdfObj.model.link];
        }

        for (i = 0; i < sdfObj.model.link.length; ++i)
        {
          linkObj = this.createLink(sdfObj.model.link[i], options);
          if (linkObj)
          {
            modelObj.add(linkObj);
          }
        }
    }

    //convert nested model objects to model array
    if (sdfObj.model.model)
    {
      if (!(sdfObj.model.model instanceof Array))
      {
        sdfObj.model.model = [sdfObj.model.model];
      }
      for (i = 0; i < sdfObj.model.model.length; ++i)
      {
        var tmpModelObj = {model:sdfObj.model.model[i]};
        var nestedModelObj = this.spawnModelFromSDF(tmpModelObj, options);
        if (nestedModelObj)
        {
          modelObj.add(nestedModelObj);
        }
      }
    }

    // Parse included models.
    if (sdfObj.model.include) {
      // Convert to array.
      if (!(sdfObj.model.include instanceof Array)) {
        sdfObj.model.include = [sdfObj.model.include];
      }

      // Ignore linter warnings. We use arrow functions to avoid binding 'this'.
      sdfObj.model.include.forEach((includedModel: any) => {
        this.includeModel(includedModel, modelObj);
      });
    }

    return modelObj;
  }

  /**
   * Creates 3D object from parsed world SDF
   * @param {object} sdfObj - parsed SDF object
   * @param {object} options - Options to send to the creation process.
   * It can include:
   *   - enableLights - True to have lights visible when the object is created.
   *                    False to create the lights, but set them to invisible (off).
   *   - fuelName - Name of the resource in Fuel. Helps to match URLs to the correct path. Requires 'fuelOwner'.
   *   - fuelOwner - Name of the resource's owner in Fuel. Helps to match URLs to the correct path. Requires 'fuelName'.
   * @returns {THREE.Object3D} worldObject - 3D object which is created
   * according to SDF world object.
   */
  public spawnWorldFromSDF(sdfObj: any, options: any): THREE.Object3D
  {
    var worldObj = new THREE.Object3D();
    worldObj.name = this.createUniqueName(sdfObj.world);

    // remove default sun before adding objects
    // we will let the world file create its own light
    var sun = this.scene.getByName('sun');
    if (sun)
    {
      this.scene.remove(sun);
    }

    // parse models
    if (sdfObj.world.model)
    {
      // convert object to array
      if (!(sdfObj.world.model instanceof Array))
      {
        sdfObj.world.model = [sdfObj.world.model];
      }

      for (var j = 0; j < sdfObj.world.model.length; ++j)
      {
        var tmpModelObj = {model: sdfObj.world.model[j]};
        var modelObj = this.spawnModelFromSDF(tmpModelObj, options);
        worldObj.add(modelObj);
      }
    }

    // parse lights
    if (sdfObj.world.light)
    {
      // convert object to array
      if (!(sdfObj.world.light instanceof Array))
      {
        sdfObj.world.light = [sdfObj.world.light];
      }

      for (var k = 0; k < sdfObj.world.light.length; ++k)
      {
        var lightObj = this.spawnLight(sdfObj.world.light[k]);
        if (lightObj !== null && lightObj !== undefined) {
          if (options && options.enableLights) {
            lightObj.visible = options.enableLights;
          }
          worldObj.add(lightObj);
        }
      }
    }

    // Parse included models.
    if (sdfObj.world.include) {
      // Convert to array.
      if (!(sdfObj.world.include instanceof Array)) {
        sdfObj.world.include = [sdfObj.world.include];
      }

      // Ignore linter warnings. We use arrow functions to avoid binding 'this'.
      sdfObj.world.include.forEach((includedModel: any) => {
        this.includeModel(includedModel, worldObj);
      });
    }

    return worldObj;
  }

  /**
   * Auxiliary function to get and parse an included model.
   * To render an included model, we need to request its files to the Server.
   * A cache map is used to avoid making duplicated requests and reuse the obtained SDF.
   * @param {object} includedModel - The included model.
   * @param {THREE.Object3D} parent - The parent that is including the given model.
   */
  public includeModel(includedModel: any, parent: THREE.Object3D): void {
    // Suppress linter warnings. This shouldn't be necessary after
    // switching to es6 or more.

    // The included model is copied. This allows the SDF to be reused
    // without modifications. The parent is stored in the model, so we
    // don't lose their context once the model's Object3D is created.
    const model = {...includedModel, parent: parent};

    // We need to request the files of the model to the Server.
    // In order to avoid duplicated requests, we store the model in an
    // array until their files are available.
    if (!this.pendingModels.has(model.uri)) {
      // The URI is not in the cache map. We have to make the request to
      // the Server. Add the model to the models array of the map, to use
      // them once the request resolves.
      this.pendingModels.set(model.uri, { models: [model] });

      // Request the files from the server, and create the pending
      // models on it's callback.
      if (this.requestHeaderKey && this.requestHeaderValue) {
        this.fuelServer.setRequestHeader(this.requestHeaderKey,
                                         this.requestHeaderValue);
      }
      this.fuelServer.getFiles(model.uri, (files: string[]) => {
        // The files were obtained.
        let sdfUrl: string = '';
        files.forEach((file) => {
          if (file.endsWith('model.sdf')) {
            sdfUrl = file;
            return;
          }
          this.addUrl(file);
        });

        // Read and parse the SDF.
        this.fileFromUrl(sdfUrl, (sdf: any) => {
          if (!sdf) {
            console.error('Error: Failed to get the SDF file (' + sdfUrl +
                          '). The XML is likely invalid.');
            return;
          }
          const sdfObj = this.parseSDF(sdf);

          const entry = this.pendingModels.get(model.uri);
          entry.sdf = sdfObj;

          // Extract Fuel owner and name. Used to match the correct URL.
          let options: any;
          if (model.uri.startsWith('https://') ||
              model.uri.startsWith('file://')) {
            const uriSplit = model.uri.split('/');
            const modelsIndex = uriSplit.indexOf('models');
            options = {
              fuelOwner: uriSplit[modelsIndex - 1],
              fuelName: uriSplit[modelsIndex + 1],
            }
          }

          entry.models.forEach((pendingModel: any) => {
            // Create the Object3D.
            const modelObj = this.spawnFromObj(sdfObj, options);

            // Set name.
            if (pendingModel.name) {
              modelObj.name = pendingModel.name;
            }

            // Set pose.
            if (pendingModel.pose) {
              const pose = this.parsePose(pendingModel.pose);
              this.scene.setPose(modelObj, pose.position, pose.orientation);
            }

            // Add to parent.
            pendingModel.parent.add(modelObj);
          });

          // Cleanup: Remove the list of models.
          entry.models = [];
        });
      });
    } else {
      // The URI was received already. Push the model into the pending models array.
      const entry = this.pendingModels.get(model.uri);
      entry.models.push(model);

      // If the SDF was already obtained, apply it to this model.
      if (entry.sdf) {
        // Extract Fuel owner and name. Used to match the correct URL.
        let options: any;
        if (model.uri.startsWith('https://') || model.uri.startsWith('file://')) {
          const uriSplit = model.uri.split('/');
          const modelsIndex = uriSplit.indexOf('models');
          options = {
            fuelOwner: uriSplit[modelsIndex - 1],
            fuelName: uriSplit[modelsIndex + 1],
          }
        }

        entry.models.forEach((pendingModel: any) => {
          const sdfObj = entry.sdf;
          const modelObj = this.spawnFromObj(sdfObj, options);

          // Set name.
          if (pendingModel.name) {
            modelObj.name = pendingModel.name;
          }

          // Set pose.
          if (pendingModel.pose) {
            const pose = this.parsePose(pendingModel.pose);
            this.scene.setPose(modelObj, pose.position, pose.orientation);
          }

          // Add to parent.
          pendingModel.parent.add(modelObj);
        });

        // Cleanup: Remove the list of models.
        entry.models = [];
      }
    }
  }

  /**
   * Creates a link 3D object of the model. A model consists of links
   * these links are 3D objects. The function creates only visual elements
   * of the link by createLink function
   * @param {object} link - parsed SDF link object
   * @param {object} options - Options to send to the creation process. It can include:
   *                 - enableLights - True to have lights visible when the object is created.
   *                                  False to create the lights, but set them to invisible (off).
   *                 - fuelName - Name of the resource in Fuel. Helps to match URLs to the correct path. Requires 'fuelOwner'.
   *                 - fuelOwner - Name of the resource's owner in Fuel. Helps to match URLs to the correct path. Requires 'fuelName'.
   * @returns {THREE.Object3D} linkObject - 3D link object
   */
  public createLink(link: any, options: any): THREE.Object3D {
    let linkPose: Pose;
    let visualObj: THREE.Object3D;
    let sensorObj: THREE.Object3D;
    let linkObj: THREE.Object3D = new THREE.Object3D();

    linkObj.name = link['name'] || link['@name'] || '';

    if (link.inertial) {
      let inertialPose: Pose;
      let inertialMass: number
      let inertia: Inertia = new Inertia();
      linkObj.userData.inertial = {};
      inertialPose = link.inertial.pose;
      inertialMass = link.inertial.mass;
      inertia.ixx = link.inertial.ixx;
      inertia.ixy = link.inertial.ixy;
      inertia.ixz = link.inertial.ixz;
      inertia.iyy = link.inertial.iyy;
      inertia.iyz = link.inertial.iyz;
      inertia.izz = link.inertial.izz;
      linkObj.userData.inertial.inertia = inertia;
      if (inertialMass) {
        linkObj.userData.inertial.mass = inertialMass;
      }
      if (inertialPose) {
        linkObj.userData.inertial.pose = inertialPose;
      }
    }

    if (link.pose) {
      linkPose = this.parsePose(link.pose);
      this.scene.setPose(linkObj, linkPose.position, linkPose.orientation);
    }

    if (link.visual) {
      if (!(link.visual instanceof Array)) {
        link.visual = [link.visual];
      }

      for (var i = 0; i < link.visual.length; ++i) {
        visualObj = this.createVisual(link.visual[i], options);
        if (visualObj && !visualObj.parent) {
          linkObj.add(visualObj);
        }
      }
    }

    if (link.collision) {
      if (!(link.collision instanceof Array)) {
        link.collision = [link.collision];
      }

      for (var j = 0; j < link.collision.length; ++j) {
        visualObj = this.createVisual(link.collision[j], options);
        if (visualObj && !visualObj.parent)
        {
          visualObj.castShadow = false;
          visualObj.receiveShadow = false;
          visualObj.visible = this.scene.showCollisions;
          linkObj.add(visualObj);
        }
      }
    }

    if (link.light) {
      if (!(link.light instanceof Array)) {
        link.light = [link.light];
      }

      for (var k = 0; k < link.light.length; ++k) {
        var light = this.spawnLight(link.light[k]);
        if (light !== null && light !== undefined) {
          if (options && options.enableLights !== undefined) {
            light.visible = options.enableLights;
          }
          light.userData = {type: 'light'};
          linkObj.add(light);
        }
      }
    }

    if (link.particle_emitter) {
      if (!(link.particle_emitter instanceof Array)) {
        link.particle_emitter = [link.particle_emitter];
      }
      for (var em = 0; em < link.particle_emitter.length; ++em) {
        const emitter = this.createParticleEmitter(link.particle_emitter[em], linkObj);
        if (emitter !== null && emitter !== undefined) {
          linkObj.userData = {
            emitter: emitter
          };
          linkObj.add(emitter);
        }
      }
    }

    if (link.sensor) {
      if (!(link.sensor instanceof Array)) {
        link.sensor = [link.sensor];
      }

      for (var sidx = 0; sidx < link.sensor.length; ++sidx) {
        sensorObj = this.createSensor(link.sensor[sidx], options);
        if (sensorObj && !sensorObj.parent) {
          linkObj.add(sensorObj);
        }
      }
    }

    return linkObj;
  }

  /**
   * Creates the Particle Emitter.
   *
   * @param {object} Emitter. The emitter element from SDF or protobuf object.
   * @param {THREE.Object3D} Parent. The link that contains the emitter.
   * @return {THREE.Object3D} A THREE.Object3D that contains the particle emitter.
   */
  public createParticleEmitter(emitter: {[key: string]: any | Message;}, parent: THREE.Object3D): THREE.Object3D {
    // Particle Emitter is handled with Three Nebula, a third-party library.
    // More information at https://github.com/creativelifeform/three-nebula

    // Auxliar function to extract the value of an emitter property from
    // either SDF or protobuf object (stored in a data property).
    function extractValue(property: string): any | undefined {
      if (emitter && emitter[property] !== undefined) {
        if (emitter[property].data !== undefined) {
          // The Message Prototype has data, but if not specified, it uses a default
          // value (like 0 or false). We want only explicitly set data, which we get by converting
          // the message to JSON.
          const value = emitter[property] as Message;
          const valueJson = value.toJSON();
          return valueJson.data;
        } else {
          return emitter[property];
        }
      }
      return undefined;
    }

    const particleEmitterObj = new THREE.Object3D();

    // Given name of the emitter.
    const emitterName: string = this.createUniqueName(emitter);

    // Whether the emitter is generating particles or not.
    const emitting: boolean = this.parseBool(extractValue('emitting')) || false;

    // Duration of the particle emitter. Infinite if null.
    const extractedDuration = extractValue('duration');
    const duration = extractedDuration !== undefined ? parseFloat(extractedDuration) : null;

    // Emitter type.
    const type = extractValue('type') || extractValue('@type') || 'point';

    // Lifetime of the individual particles, in seconds.
    const extractedLifetime = extractValue('lifetime');
    const lifetime = extractedLifetime !== undefined ? parseFloat(extractedLifetime) : 5;

    // Velocity range.
    const extractedMinVelocity = extractValue('min_velocity');
    const minVelocity = extractedMinVelocity !== undefined ? parseFloat(extractedMinVelocity) : 1;

    const extractedMaxVelocity = extractValue('max_velocity');
    const maxVelocity = extractedMaxVelocity !== undefined ? parseFloat(extractedMaxVelocity) : 1;

    // Size of the particle emitter.
    // The SDF particle emitter spec lists size as
    // [x: width, y: height, z: depth].
    const extractedSize = extractValue('size');
    const size = this.parse3DVector(extractedSize) || new THREE.Vector3(1, 1, 1);

    // Size of the individual particles.
    const extractedParticleSize = extractValue('particle_size');
    const particleSize = this.parse3DVector(extractedParticleSize) || new THREE.Vector3(1, 1, 1);

    // Pose of the particle emitter
    const extractedPose = extractValue('pose');
    const pose = this.parsePose(extractedPose);

    // Particles per second emitted.
    const extractedRate = extractValue('rate');
    const rate = extractedRate !== undefined ? parseFloat(extractedRate) : 10;

    // Scale modifier for each particle. Modifies their size per second.
    const extractedScaleRate = extractValue('scale_rate');
    const scaleRate = extractedScaleRate !== undefined ? parseFloat(extractedScaleRate) : 1;

    // Material
    const particleMaterial = extractValue('material');
    const particleTextureUrl = particleMaterial.pbr.albedo_map;
    const particleTexture = this.scene.loadTexture(particleTextureUrl);

    // Create a Nebula Emitter.
    const nebulaEmitter = new Emitter();

    // Create the Nebula System, if needed.
    // We need only one system regardless of the amount of emitter we have.
    let nebulaSystem = this.scene.getParticleSystem();
    let nebulaRenderer = this.scene.getParticleRenderer();

    if (!nebulaSystem) {
      nebulaSystem = new System();
      // Note: We pass the global THREE object here, but we could pass an object with just the
      // THREE methods it uses.
      // See https://github.com/creativelifeform/three-nebula/tree/master/src/renderer
      nebulaRenderer = new SpriteRenderer(this.scene.scene, THREE);
      nebulaSystem.addRenderer(nebulaRenderer)

      this.scene.setupParticleSystem(nebulaSystem, nebulaRenderer);
    }

    // Initializers

    // Create the particle sprite and body.
    const createSprite = () => {
      const map = particleTexture;
      const material = new THREE.SpriteMaterial({
        map,
        transparent: true,
      });
      return new THREE.Sprite(material);
    };
    const bodyInitializer = new Body(createSprite());

    // Emitter's size
    // Note: Only Box type supported for now.
    const positionInitializer = new Position();

    const boxZone = new BoxZone(size.x, size.y, size.z);
    positionInitializer.addZone(boxZone);

    const particleLifetimeInitializer = new Life(lifetime);

    // Since rate is particles per second, we emit 1 particle per (1 / rate) seconds.
    const particleRate = new Rate(
      1,
      1 / rate
    );

    const particleSizeInitializer = new Radius(particleSize.x, particleSize.y);
    const particleVelocityInitializer = new VectorVelocity(new THREE.Vector3(1, 0, 0), 0);
    particleVelocityInitializer.radiusPan = new Span(minVelocity, maxVelocity);

    const scaleBehaviour = new Scale(
      // Starting scale factor.
      1,
      // Ending scale factor. Since Scale Rate is scale change per second,
      //we roughly calculate the scale factor at the end of the particle's life.
      Math.pow(scaleRate, lifetime),
    );

    // Explicity avoid damping, otherwise particles will be slowed down.
    nebulaEmitter.damping = 0;

    nebulaEmitter
      .setRate(particleRate)
      .addInitializers([
        positionInitializer,
        particleLifetimeInitializer,
        bodyInitializer,
        particleVelocityInitializer,
        particleSizeInitializer,
      ])
      .setPosition(parent.position)
      .setRotation(parent.rotation);

    if (scaleRate !== 1) {
      nebulaEmitter.addBehaviour(scaleBehaviour);
    }

    if (emitting) {
      nebulaEmitter.emit();
    }

    nebulaSystem
      .addEmitter(nebulaEmitter)
      .emit({ onStart: () => {}, onUpdate: () => {}, onEnd: () => {}});

    return particleEmitterObj;
  }

  /**
   * Creates 3D object according to model name and type of the model and add
   * the created object to the scene.
   * @param {THREE.Object3D} model - model object which will be added to scene
   * @param {string} type - type of the model which can be followings: box,
   * sphere, cylinder, spotlight, directionallight, pointlight
   */
  public addModelByType(model: THREE.Object3D, type: string): void {
    let sdf: any;
    let translation: THREE.Vector3 = new THREE.Vector3();
    let quaternion = new THREE.Quaternion();
    let modelObj: THREE.Object3D;
    let that = this;

    if (model.matrixWorld) {
      let matrix: THREE.Matrix4 = model.matrixWorld;
      let scale: THREE.Vector3 = new THREE.Vector3();
      matrix.decompose(translation, quaternion, scale);
    }

    let euler: THREE.Euler = new THREE.Euler();
    euler.setFromQuaternion(quaternion);

    if (type === 'box') {
      sdf = this.createBoxSDF(translation, euler);
      modelObj = this.spawnFromSDF(sdf);
    } else if (type === 'sphere') {
      sdf = this.createSphereSDF(translation, euler);
      modelObj = this.spawnFromSDF(sdf);
    } else if (type === 'cylinder') {
      sdf = this.createCylinderSDF(translation, euler);
      modelObj = this.spawnFromSDF(sdf);
    } else if (type === 'spotlight') {
      modelObj = this.scene.createLight(2);
      this.scene.setPose(modelObj, translation, quaternion);
    } else if (type === 'directionallight') {
      modelObj = this.scene.createLight(3);
      this.scene.setPose(modelObj, translation, quaternion);
    } else if (type === 'pointlight') {
      modelObj = this.scene.createLight(1);
      this.scene.setPose(modelObj, translation, quaternion);
    } else {
      this.loadSDF(type, function(sdfObj: any) {
        modelObj = new THREE.Object3D();
        modelObj.add(sdfObj);
        modelObj.name = model.name;
        that.scene.setPose(modelObj, translation, quaternion);
      });
    }

    let addModelFunc = function()
    {
      // check whether object is removed
      var obj = that.scene.getByName(modelObj.name);
      if (obj === undefined)
      {
        that.scene.add(modelObj);
      }
      else
      {
        setTimeout(addModelFunc, 100);
      }
    };

    setTimeout(addModelFunc , 100);
  }

  /**
   * Creates SDF string for simple shapes: box, cylinder, sphere.
   * @param {string} type - type of the model which can be followings: box,
   * sphere, cylinder
   * @param {THREE.Vector3} translation - denotes the x,y,z position
   * of the object
   * @param {THREE.Euler} euler - denotes the euler rotation of the object
   * @param {string} geomSDF - geometry element string of 3D object which is
   * already created according to type of the object
   * @returns {string} sdf - SDF string of the simple shape
   */
  public createSimpleShapeSDF(type: string, translation: THREE.Vector3,
          euler: THREE.Euler, geomSDF: string): string {
    var sdf;

    sdf = '<sdf version="' + this.SDF_VERSION + '">' + '<model name="' + type
            + '">' + '<pose>' + translation.x + ' ' + translation.y + ' '
            + translation.z + ' ' + euler.x + ' ' + euler.y + ' ' + euler.z
            + '</pose>' + '<link name="link">'
            + '<inertial><mass>1.0</mass></inertial>'
            + '<collision name="collision">' + '<geometry>' + geomSDF
            + '</geometry>' + '</collision>' + '<visual name="visual">'
            + '<geometry>' + geomSDF + '</geometry>' + '<material>' + '<script>'
            + '<uri>file://media/materials/scripts/gazebo.material' + '</uri>'
            + '<name>Gazebo/Grey</name>' + '</script>' + '</material>'
            + '</visual>' + '</link>' + '</model>' + '</sdf>';

    return sdf;
  }

  /**
   * Creates SDF string of box geometry element
   * @param {THREE.Vector3} translation - the x,y,z position of
   * the box object
   * @param {THREE.Euler} euler - the euler rotation of the box object
   * @returns {string} geomSDF - geometry SDF string of the box
   */
  public createBoxSDF(translation: THREE.Vector3, euler: THREE.Euler): string {
    var geomSDF = '<box>' + '<size>1.0 1.0 1.0</size>' + '</box>';

    return this.createSimpleShapeSDF('box', translation, euler, geomSDF);
  }

  /**
   * Creates SDF string of sphere geometry element
   * @param {THREE.Vector3} translation - the x,y,z position of
   * the box object
   * @param {THREE.Euler} euler - the euler rotation of the box object
   * @returns {string} geomSDF - geometry SDF string of the sphere
   */
  public createSphereSDF(translation: THREE.Vector3, euler: THREE.Euler): string {
    var geomSDF = '<sphere>' + '<radius>0.5</radius>' + '</sphere>';

    return this.createSimpleShapeSDF('sphere', translation, euler, geomSDF);
  }

  /**
   * Creates SDF string of cylinder geometry element
   * @param {THREE.Vector3} translation - the x,y,z position of
   * the box object
   * @param {THREE.Euler} euler - the euler rotation of the cylinder object
   * @returns {string} geomSDF - geometry SDF string of the cylinder
   */
  public createCylinderSDF(translation: THREE.Vector3, euler: THREE.Euler): string {
    var geomSDF = '<cylinder>' + '<radius>0.5</radius>' + '<length>1.0</length>'
            + '</cylinder>';

    return this.createSimpleShapeSDF('cylinder', translation, euler, geomSDF);
  }

  /**
   * Set a request header for internal requests.
   * Parser uses XMLHttpRequest, which handle headers with key-value pairs instead of an object (like THREE uses).
   *
   * @param {string} header - The header to send in the request.
   * @param {string} value - The value to set to the header.
   */
  public setRequestHeader(header: string, value: string): void {
    this.requestHeaderKey = header;
    this.requestHeaderValue = value;
  }


  /**
   * Download a file from url.
   * @param {string} url - full URL to an SDF file.
   * @param {function} callback - The callback to use once the file is ready.
   */
  public fileFromUrl(url: string, callback: any): void {
    // The request is asynchronous. To avoid disrupting the current workflow too much, we use a callback.
    // TODO(germanmas): We should update and use async/await instead throughout the library.
    var xhttp = new XMLHttpRequest();
    xhttp.overrideMimeType('text/xml');
    xhttp.open('GET', url, true);

    if (this.requestHeaderKey && this.requestHeaderValue) {
      xhttp.setRequestHeader(this.requestHeaderKey, this.requestHeaderValue);
    }

    xhttp.onload = function() {
      if (xhttp.readyState === 4) {
        if (xhttp.status !== 200) {
          console.error('Failed to get URL [' + url + ']');
          return;
        }
        callback(xhttp.responseXML);
      }
    };

    xhttp.onerror = function (e) {
      console.error(xhttp.statusText);
    };

    try {
      xhttp.send();
    } catch(err: any) {
      console.error('Failed to get URL [' + url + ']: ' + err.message);
      return;
    }
  }

  private createUniqueName(obj: any): string {
    let objectName: string = obj['name'] || obj['@name'] || '';
    let objectId: string = obj['id'] || obj['@id'] || '';
    return objectName + objectId;
  }
}
