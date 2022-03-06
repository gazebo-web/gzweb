import {
  Color,
  Euler,
  Mesh,
  NormalBlending,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { FuelServer } from './fuel-server';

/**
 * SDF Parser is used to translate a SDF file or protobuf messages into a ThreeJS Object3D to be
 * used in a scene.
 */
export class SdfParser {

  SDF_VERSION = 1.5;
  FUEL_HOST = 'fuel.ignitionrobotics.org';
  FUEL_VERSION = '1.0';
  MATERIAL_ROOT = 'assets';

  usingFilesUrls = false;
  materials = {};
  entityMaterial = {};
  meshes = {};
  pendingMeshes = [];
  pendingModels = new Map();
  mtls = {};
  textures = {};
  enablePBR = true;
  customUrls = [];

  /**
   * Initializes the parser with the given parameters.
   *
   * @param {GZ3D.Scene} scene A Gz3D Scene.
   */
  constructor(scene) {
    this.fuelServer = new FuelServer(this.FUEL_HOST, this.FUEL_VERSION);
    this.scene = scene;
  }

  /**
   * Pushes Urls into the customUrls array where the parser looks for assets.
   * If `usingFilesUrls` is true, resources will only be taken from this array.
   * TODO: Find a less intrusive way to support custom URLs (issue #147)
   *
   * @param {string} url - The URL to add.
   */
  addUrl = (url) => {
    const trimmedUrl = url && url.trim();
    if (trimmedUrl === undefined || trimmedUrl.indexOf('http') !== 0) {
      console.log('Trying to add invalid URL: ' + url);
      return;
    }

    // Avoid duplicated URLs.
    if (this.customUrls.indexOf(trimmedUrl) === -1) {
      this.customUrls.push(trimmedUrl);
    }
  };

  /**
   * Parses a color, which may come from an object or string.
   *
   * @param {string|object} colorInput - A string which denotes the color where every value
   * should be separated with single white space, or an object containing rgba values
   * @returns {object} color - color object having r, g, b and alpha values
   */
  parseColor = (colorInput) => {
    const color = {};
    let values = [];
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
  };

  /**
   * Parses string which is a 3D vector
   *
   * @param {string|object} vectorInput - string which denotes the vector where every value
   * should be separated with single white space, or an object containing x, y, z values.
   * @returns {object} vector3D - vector having x, y, z values
   */
  parse3DVector = (vectorInput) => {
    const vector3D = {};
    let values = [];
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
    return vector3D;
  };

  /**
   * Parses a string which is a 3D vector
   *
   * @param {string|object} poseInput - string which denotes the pose of the object
   * where every value should be separated with single white space and
   * first three denotes x,y,z and values of the pose,
   * and following three denotes euler rotation around x,y,z, or an object
   * containing pose and orientation.
   * @returns {object} pose - pose object having position (x,y,z)(THREE.Vector3)
   * and orientation (THREE.Quaternion) properties
   */
  parsePose = (poseInput) => {
    let pose = {
      position: new Vector3(),
      orientation: new Quaternion()
    };

    // Short circuit if poseInput is undefined
    if (poseInput === undefined) {
      return pose;
    }

    if (poseInput.hasOwnProperty('position') && poseInput.hasOwnProperty('orientation')) {
      pose = {
        position: new Vector3(
          poseInput['position']['x'],
          poseInput['position']['y'],
          poseInput['position']['z']
        ),
        orientation: new Quaternion(
          poseInput['orientation']['x'],
          poseInput['orientation']['y'],
          poseInput['orientation']['z'],
          poseInput['orientation']['w']
        )
      };
      return pose;
    }

    // Note: The pose might have an empty frame attribute. This is a valid XML element though.
    // In this case, the parser outputs {@frame: "frame", #text: "pose value"}
    if (poseInput.hasOwnProperty('@frame')) {
      if (poseInput['@frame'] !== '') {
        console.warn('SDFParser does not support frame semantics.');
      }
      poseInput = poseInput['#text'];
    }

    const values = poseInput.trim().split(/\s+/);
    const position = new Vector3(
      parseFloat(values[0]),
      parseFloat(values[1]),
      parseFloat(values[2])
    );

    // get euler rotation and convert it to Quaternion
    const quaternion = new Quaternion();
    const euler = new Euler(
      parseFloat(values[3]),
      parseFloat(values[4]),
      parseFloat(values[5]),
      'ZYX'
    );

    quaternion.setFromEuler(euler);
    pose.position =  position;
    pose.orientation = quaternion;
    return pose;
  };

  /**
   * Parses a string which is a 3D vector
   * @param {string|object} scaleInput - string which denotes scaling in x,y,z
   * where every value should be separated with single white space, or an object
   * containing x, y, z values.
   * @returns {THREE.Vector3} scale - THREE Vector3 object
   * which denotes scaling of an object in x,y,z
   */
  parseScale = (scaleInput) => {
    let values = [];
    if (typeof scaleInput === 'string') {
      values = scaleInput.split(/\s+/);
    } else {
      values = [
        scaleInput['x'] || 1,
        scaleInput['y'] || 1,
        scaleInput['z'] || 1
      ];
    }
    const scale = new Vector3(
      parseFloat(values[0]),
      parseFloat(values[1]),
      parseFloat(values[2])
    );
    return scale;
  };

  /**
   * Parses a string which is a boolean
   * @param {string} boolStr - string which denotes a boolean value
   * where the values can be true, false, 1, or 0.
   * @returns {bool} bool - bool value
   */
  parseBool = (boolStr) => {
    if (boolStr !== undefined) {
      return JSON.parse(boolStr);
    }

    return false;
  };

  /**
   * Parses a string which is a size of an object
   * @param {string|object} sizeInput - string which denotes size in x,y,z
   * where every value should be separated with single white space, or an object
   * containing x, y, z values.
   * @returns {object} size - size object which denotes
   * size of an object in x,y,z
   */
  parseSize = (sizeInput) => {
    let sizeObj;
    let values = [];
    if (typeof sizeInput === 'string') {
      values = sizeInput.split(/\s+/);
    } else {
      values = [sizeInput.x, sizeInput.y, sizeInput.z];
    }

    const x = parseFloat(values[0]);
    const y = parseFloat(values[1]);
    const z = parseFloat(values[2]);
    sizeObj = { x, y, z };

    return sizeObj;
  };

  /**
   * Parses SDF XML string
   * @param {object} sdf - SDF XML string
   * @returns {object} object - The parsed SDF object.
   */
  parseSDF = (sdf) => {
    const options = {
      ignoreAttributes: false,
      attributeNamePrefix : '@',
    };

    const parser = new XMLParser(options);
    const validation = XMLValidator.validate(sdf, options);

    // Validator returns true or an error object.
    if (validation === true) {
      return parser.parse(sdf).sdf;
    } else {
      console.error('Failed to parse SDF: ', validation.err);
      return;
    }
  };

  /**
   * Loads SDF file according to given name.
   * @param {string} sdfName - Either name of model / world or the filename
   * @param {function} callback - The callback to use once the SDF file is ready.
   */
  loadSDF = (sdfName, callback) => {
    if (!sdfName) {
      console.error('Must provide either a model/world name or the URL of an SDF file');
      return;
    }
    const lowerCaseName = sdfName.toLowerCase();
    let filename = null;

    // In case it is a full URL
    if (lowerCaseName.indexOf('http') === 0) {
      filename = sdfName;
    } else {
      // In case it is just the model/world name, look for it on the default URL
      if (lowerCaseName.endsWith('.world') || lowerCaseName.endsWith('.sdf')) {
        filename = this.MATERIAL_ROOT + '/worlds/' + sdfName;
      } else {
        filename = this.MATERIAL_ROOT + '/' + sdfName + '/model.sdf';
      }
    }

    if (!filename) {
      console.log('Error: unable to load ' + sdfName + ' - file not found');
      return;
    }

    this.fuelServer.getSDF(filename, (sdf) => {
      if (!sdf) {
        console.log('Error: Failed to get the SDF file (' + filename + '). The XML is likely invalid.');
        return;
      }
      callback(this.spawnFromSDF(sdf));
    });
  };

  /**
   * Creates an unique name for the resource, which is the name plus it's ID
   * @param {object} object - the object that contains the name and ID.
   * @returns {string} uniqueName - A concatenation of the name and ID of the object.
   */
  createUniqueName = (obj) => {
    const objectName = obj['name'] || obj['@name'] || '';
    const objectId = obj['id'] || obj['@id'] || '';

    return objectName + objectId;
  };

  /**
   * Creates a scoped name for the resource.
   * @param {object} object - the object that contains the name.
   * @param {string} parentScopedName - the scoped name of the parents.
   * @returns {string} scoped name - A concatenation of the name and parents name sepparated with double colons.
   */
  createScopedName = (obj, parentScopedName) => {
    const objectName = obj['name'] || obj['@name'] || '';

    if (parentScopedName && parentScopedName.length > 0) {
      return parentScopedName + '::' + objectName;
    }

    return objectName;
  };

  /**
   * Create a valid URI that points to the Fuel Server given a local filesystem
   * path.
   * TODO(germanmas): This should be on Fuel Server.
   *
   * A local filesystem path, such as
   * `/home/developer/.ignition/fuel/.../model/1/model.sdf` is typically found
   * when parsing object sent from a websocket server.
   *
   * The provided URI is returned if it does not point to the Fuel Server
   * directly.
   *
   * @param {string} uri - A string to convert to a Fuel Server URI, if able.
   * @return The transformed URI, or the same URI if it couldn't be transformed.
   */
  createFuelUri = (uri) => {
    // Check to see if the modelName points to the Fuel server.
    if (uri.indexOf('https://' + this.FUEL_HOST) !== 0) {
      // Check to see if the uri has the form similar to
      // `/home/.../fuel.ignitionrobotics.org/...`
      // If so, then we assume that the parts following
      // `fuel.ignitionrobotics.org` can be directly mapped to a valid URL on
      // Fuel server
      if (uri.indexOf(this.FUEL_HOST) > 0) {
        const uriArray = uri.split('/').filter(function(element) {
          return element !== '';
        });
        uriArray.splice(0, uriArray.indexOf(this.FUEL_HOST));
        uriArray.splice(1, 0, this.FUEL_VERSION);
        uriArray.splice(6, 0, 'files');
        return 'https://' + uriArray.join('/');
      }
    }
    return uri;
  };

  /**
   * Parses SDF material element which is going to be used by THREE library
   * It matches material scripts with the material objects which are
   * already parsed by gzbridge and saved by SDFParser.
   * If `usingFilesUrls` is true, the texture URLs will be loaded from the
   * to the customUrls array.
   * @param {object} material - SDF material object
   * @returns {object} material - material object which has the followings:
   * texture, normalMap, ambient, diffuse, specular, opacity
   */
  createMaterial = (material) => {
    let textureUri, texture, mat;
    let ambient, diffuse, specular, opacity, normalMap, scale, pbr;

    if (!material) {
      return null;
    }

    if (material.ambient) {
      ambient = this.parseColor(material.ambient);
    }

    if (material.diffuse) {
      diffuse = this.parseColor(material.diffuse);
    }

    if (material.specular) {
      specular = this.parseColor(material.specular);
    }

    opacity = material.opacity;
    normalMap = material.normalMap;
    scale = material.scale;

    const script = material.script;

    if (script) {
      // if there is just one uri convert it to array
      if (!script.uri) {
        // TODO(germanmas): Include material file.
        script.uri = ['file://media/materials/scripts/gazebo.material'];
      }

      if (!(script.uri instanceof Array)) {
        script.uri = [script.uri];
      }

      if (script.name) {
        mat = this.materials[script.name];
        // if we already cached the materials

        // If the material script is not handled and their materials are not cached, the model will
        // rely on the materials from its SDF and/or its Collada mesh (if available).
        if (mat) {
          ambient = mat.ambient;
          diffuse = mat.diffuse;
          specular = mat.specular;
          opacity = mat.opacity;
          scale = mat.scale;

          if (mat.texture) {
            for (let i = 0; i < script.uri.length; ++i) {
              const uriType = script.uri[i].substring(0, script.uri[i].indexOf('://'));
              if (uriType === 'model') {
                // if texture uri
                if (script.uri[i].indexOf('textures') > 0) {
                  textureUri = script.uri[i].substring(script.uri[i].indexOf('://') + 3);
                  break;
                }
              } else if (uriType === 'file') {
                if (script.uri[i].indexOf('materials') > 0) {
                  textureUri = script.uri[i].substring(script.uri[i]
                    .indexOf('://') + 3, script.uri[i]
                    .indexOf('materials') + 9) + '/textures';
                  break;
                }
              }
            }

            // Map texture name to the corresponding texture.
            if (!this.usingFilesUrls) {
              texture = this.textures[mat.texture];
            } else {
              if (this.customUrls.length !== 0) {
                for (let k = 0; k < this.customUrls.length; k++) {
                  if (this.customUrls[k].indexOf(mat.texture) > -1) {
                    texture = this.customUrls[k];
                    break;
                  }
                }
              } else {
                texture = this.MATERIAL_ROOT + '/' + textureUri + '/' + mat.texture;
              }
            }
          }
        }
      }
    }

    // normal map
    if (material.normal_map) {
      let mapUri;
      if (material.normal_map.indexOf('://') > 0) {
        mapUri = material.normal_map.substring(
          material.normal_map.indexOf('://') + 3, material.normal_map.lastIndexOf('/')
        );
      } else {
        mapUri = textureUri;
      }
      if (mapUri) {
        let startIndex = material.normal_map.lastIndexOf('/') + 1;
        if (startIndex < 0) {
          startIndex = 0;
        }
        const normalMapName = material.normal_map.substr(
          startIndex, material.normal_map.lastIndexOf('.') - startIndex
        );
        // Map texture name to the corresponding texture.
        if (!this.usingFilesUrls) {
          normalMap = this.textures[normalMapName + '.png'];
        } else {
          if (this.customUrls.length !== 0) {
            for (let j = 0; j < this.customUrls.length; j++) {
              if (this.customUrls[j].indexOf(normalMapName + '.png') > -1) {
                normalMap = this.customUrls[j];
                break;
              }
            }
          } else {
            normalMap = this.MATERIAL_ROOT + '/' + mapUri + '/' + normalMapName + '.png';
          }
        }
      }
    }

    // Set the correct URLs of the PBR-related textures, if available.
    if (material.pbr && material.pbr.metal && this.enablePBR) {
      if (material.pbr.metal.albedo_map) {
        let albedoMap;
        const albedoMapName = material.pbr.metal.albedo_map.split('/').pop();

        if (material.pbr.metal.albedo_map.startsWith('https://')) {
          this.addUrl(material.pbr.metal.albedo_map);
        }

        if (this.usingFilesUrls && this.customUrls.length !== 0) {
          for (let u = 0; u < this.customUrls.length; u++) {
            if (this.customUrls[u].indexOf(albedoMapName) > -1) {
              albedoMap = this.customUrls[u];
              break;
            }
          }
          if (albedoMap) {
            material.pbr.metal.albedo_map = albedoMap;
          } else {
            console.error('Missing Albedo Map file [' + material.pbr.metal.albedo_map + ']');
            // Prevent the map from loading, as it hasn't been found.
            material.pbr.metal.albedo_map = null;
          }
        }
      }

      if (material.pbr.metal.emissive_map) {
        let emissiveMap;
        const emissiveMapName = material.pbr.metal.emissive_map.split('/').pop();

        if (material.pbr.metal.emissive_map.startsWith('https://')) {
          this.addUrl(material.pbr.metal.emissive_map);
        }

        if (this.usingFilesUrls && this.customUrls.length !== 0) {
          for (let u = 0; u < this.customUrls.length; u++) {
            if (this.customUrls[u].indexOf(emissiveMapName) > -1) {
              emissiveMap = this.customUrls[u];
              break;
            }
          }
          if (emissiveMap) {
            material.pbr.metal.emissive_map = emissiveMap;
          } else {
            console.error('Missing Emissive Map file [' + material.pbr.metal.emissive_map + ']');
            // Prevent the map from loading, as it hasn't been found.
            material.pbr.metal.emissive_map = null;
          }
        }
      }

      if (material.pbr.metal.normal_map) {
        let pbrNormalMap;
        const pbrNormalMapName = material.pbr.metal.normal_map.split('/').pop();

        if (material.pbr.metal.normal_map.startsWith('https://')) {
          this.addUrl(material.pbr.metal.normal_map);
        }

        if (this.usingFilesUrls && this.customUrls.length !== 0) {
          for (let u = 0; u < this.customUrls.length; u++) {
            if (this.customUrls[u].indexOf(pbrNormalMapName) > -1) {
              pbrNormalMap = this.customUrls[u];
              break;
            }
          }
          if (pbrNormalMap) {
            material.pbr.metal.normal_map = pbrNormalMap;
          } else {
            console.error('Missing Normal Map file [' + material.pbr.metal.normal_map + ']');
            // Prevent the map from loading, as it hasn't been found.
            material.pbr.metal.normal_map = null;
          }
        }
      }

      if (material.pbr.metal.roughness_map) {
        let roughnessMap;
        const roughnessMapName = material.pbr.metal.roughness_map.split('/').pop();

        if (material.pbr.metal.roughness_map.startsWith('https://')) {
          this.addUrl(material.pbr.metal.roughness_map);
        }

        if (this.usingFilesUrls && this.customUrls.length !== 0) {
          for (let u = 0; u < this.customUrls.length; u++) {
            if (this.customUrls[u].indexOf(roughnessMapName) > -1) {
              roughnessMap = this.customUrls[u];
              break;
            }
          }
          if (roughnessMap) {
            material.pbr.metal.roughness_map = roughnessMap;
          } else {
            console.error('Missing Roughness Map file [' + material.pbr.metal.roughness_map + ']');
            // Prevent the map from loading, as it hasn't been found.
            material.pbr.metal.roughness_map = null;
          }
        }
      }

      if (material.pbr.metal.metalness_map) {
        let metalnessMap;
        const metalnessMapName = material.pbr.metal.metalness_map.split('/').pop();

        if (material.pbr.metal.metalness_map.startsWith('https://')) {
          this.addUrl(material.pbr.metal.metalness_map);
        }

        if (this.usingFilesUrls && this.customUrls.length !== 0) {
          for (let u = 0; u < this.customUrls.length; u++) {
            if (this.customUrls[u].indexOf(metalnessMapName) > -1) {
              metalnessMap = this.customUrls[u];
              break;
            }
          }
          if (metalnessMap) {
            material.pbr.metal.metalness_map = metalnessMap;
          } else {
            console.error('Missing Metalness Map file [' + material.pbr.metal.metalness_map + ']');
            // Prevent the map from loading, as it hasn't been found.
            material.pbr.metal.metalness_map = null;
          }
        }
      }

      pbr = material.pbr;
    }

    return {
      texture: texture,
      normalMap: normalMap,
      ambient: ambient,
      diffuse: diffuse,
      specular: specular,
      opacity: opacity,
      scale: scale,
      pbr: pbr
    };
  };

  /**
   * Creates SDF string for simple shapes: box, cylinder, sphere.
   * @param {string} type - type of the model which can be followings: box, sphere, cylinder
   * @param {THREE.Vector3} translation - denotes the x,y,z position of the object
   * @param {THREE.Euler} euler - denotes the euler rotation of the object
   * @param {string} geomSDF - geometry element string of 3D object which is already created
   * according to type of the object
   * @returns {string} sdf - SDF string of the simple shape
   */
  createSimpleShapeSDF = (type, translation, euler, geomSDF) => {
    const sdf = '<sdf version="' + this.SDF_VERSION + '">' + '<model name="' + type
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
  };

  /**
  * Creates SDF string of box geometry element
  * @param {THREE.Vector3} translation - the x,y,z position of the box object
  * @param {THREE.Euler} euler - the euler rotation of the box object
  * @returns {string} geomSDF - geometry SDF string of the box
  */
  createBoxSDF = (translation, euler) => {
    const geomSDF = '<box>' + '<size>1.0 1.0 1.0</size>' + '</box>';
    return this.createSimpleShapeSDF('box', translation, euler, geomSDF);
  };

  /**
  * Creates SDF string of sphere geometry element
  * @param {THREE.Vector3} translation - the x,y,z position of the box object
  * @param {THREE.Euler} euler - the euler rotation of the box object
  * @returns {string} geomSDF - geometry SDF string of the sphere
  */
  createSphereSDF = (translation, euler) => {
    const geomSDF = '<sphere>' + '<radius>0.5</radius>' + '</sphere>';
    return this.createSimpleShapeSDF('sphere', translation, euler, geomSDF);
  };

  /**
  * Creates SDF string of cylinder geometry element
  * @param {THREE.Vector3} translation - the x,y,z position of the box object
  * @param {THREE.Euler} euler - the euler rotation of the cylinder object
  * @returns {string} geomSDF - geometry SDF string of the cylinder
  */
  createCylinderSDF = (translation, euler) => {
    const geomSDF = '<cylinder>' + '<radius>0.5</radius>' + '<length>1.0</length>' + '</cylinder>';
    return this.createSimpleShapeSDF('cylinder', translation, euler, geomSDF);
  };

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
  createGeom = async (geom, mat, parent, options) => {
    let obj;
    let size, normal;
    let material = this.createMaterial(mat);

    // TODO(germanmas) Split this into two functions: One for simple geometry and one for a mesh.
    if (geom.box) {
      if (geom.box.size) {
        size = this.parseSize(geom.box.size);
      } else {
        size = {x: 1, y: 1, z: 1};
      }
      obj = this.scene.createBox(size.x, size.y, size.z);
    } else if (geom.cylinder) {
      const radius = parseFloat(geom.cylinder.radius);
      const length = parseFloat(geom.cylinder.length);
      obj = this.scene.createCylinder(radius, length);
    } else if (geom.sphere) {
      obj = this.scene.createSphere(parseFloat(geom.sphere.radius));
    } else if (geom.plane) {
      if (geom.plane.normal) {
        normal = this.parseSize(geom.plane.normal);
      } else {
        normal = {x: 0, y: 0, z: 1};
      }
      if (geom.plane.size) {
        size = this.parseSize(geom.plane.size);
      } else {
        size = {x: 1, y: 1};
      }
      obj = this.scene.createPlane(normal.x, normal.y, normal.z, size.x, size.y);
    } else if (geom.mesh) {
      const meshUri = geom.mesh.uri || geom.mesh.filename;
      let submesh;
      let centerSubmesh;
      let modelName;

      // Callback function when the mesh is ready.
      const loadMesh = (mesh, material, parent, ext) => {
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
            mesh.traverse((child) => {
              if (child !== mesh && child instanceof Mesh) {
                // Some Collada files load their own textures. If the mesh already has a material with
                // a texture, we skip this step (but only if there is no PBR materials involved).
                const isColladaWithTexture = ext === '.dae' && child.material && child.material.map;

                if (!isColladaWithTexture || material.pbr) {
                  this.scene.setMaterial(child, material);
                }
              }
            });
          } else {
            this.scene.setMaterial(mesh, material);
          }
        } else {
          // By default, the STL Loader creates meshes with a basic material with a random color.
          // If no material is set via the SDF file, provide a more appropriate one.
          if (ext === '.stl') {
            this.scene.setMaterial(mesh, {'ambient': [1,1,1,1]});
          }
        }

        parent.add(mesh.clone());
        loadGeom(parent);
      };

      if (geom.mesh.submesh) {
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

      const uriType = meshUri.substring(0, meshUri.indexOf('://'));
      if (uriType === 'file' || uriType === 'model') {
        modelName = meshUri.substring(meshUri.indexOf('://') + 3);
      } else {
        modelName = meshUri;
      }

      if (geom.mesh.scale) {
        const scale = this.parseScale(geom.mesh.scale);
        parent.scale.x = scale.x;
        parent.scale.y = scale.y;
        parent.scale.z = scale.z;
      }

      // Create a valid Fuel URI from the model name
      let modelUri = this.createFuelUri(modelName);
      const ext = modelUri.substr(-4).toLowerCase();
      const materialName = parent.name + '::' + modelUri;
      this.entityMaterial[materialName] = material;
      const meshFileName = meshUri.substring(meshUri.lastIndexOf('/'));

      if (!this.usingFilesUrls) {
        const meshFile = this.meshes[meshFileName];
        if (!meshFile) {
          console.error('Missing mesh file [' + meshFileName + ']');
          return;
        }

        if (ext === '.obj') {
          const mtlFileName = meshFileName.split('.')[0]+'.mtl';
          const mtlFile = this.mtls[mtlFileName];
          if (!mtlFile) {
            console.error('Missing MTL file [' + mtlFileName + ']');
            return;
          }

          this.scene.loadMeshFromString(modelUri, submesh, centerSubmesh, (obj) => {
            if (!obj) {
              console.error('Failed to load mesh.');
              return;
            }

            parent.add(obj);
            loadGeom(parent);
          }, [meshFile, mtlFile]);
        } else if (ext === '.dae') {
          this.scene.loadMeshFromString(modelUri, submesh, centerSubmesh, (dae) => {
            if (!dae) {
              console.error('Failed to load mesh.');
              return;
            }

            if (material) {
              dae.traverse((child) => {
                if (child !== dae && child instanceof Mesh) {
                  this.scene.setMaterial(child, material);
                }
              });
            }
            parent.add(dae);
            loadGeom(parent);
          }, [meshFile]);
        }
      } else {
        if (this.customUrls.length !== 0) {
          for (let k = 0; k < this.customUrls.length; k++) {
            if (this.customUrls[k].indexOf(meshFileName) > -1) {
              // If we have Fuel name and owner information, make sure the path includes them.
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
        for (let i = 0; i < this.pendingMeshes.length; i++) {
          if (this.pendingMeshes[i].meshUri === modelUri) {
            // The mesh is already pending, but submesh and the visual object parent are different.
            this.pendingMeshes.push({
              meshUri: modelUri,
              submesh: submesh,
              parent: parent,
              material: material,
              centerSubmesh: centerSubmesh
            });

            // Attempt to get the mesh.
            let mesh = this.scene.meshes[modelUri];

            // If the mesh exists, then create another version and add it to
            // the parent object.
            if (mesh !== null && mesh !== undefined) {
              if (parent.getObjectByName(mesh['name']) === undefined) {
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

        // this.scene.loadMeshFromUri(modelUri, submesh, centerSubmesh, (mesh) => {
        //   // Check for the pending meshes.
        //   for (let i = 0; i < this.pendingMeshes.length; i++) {
        //     if (this.pendingMeshes[i].meshUri === mesh.name) {
        //       // No submesh: Load the result.
        //       if (!this.pendingMeshes[i].submesh) {
        //         loadMesh(mesh, this.pendingMeshes[i].material, this.pendingMeshes[i].parent, ext);
        //       } else {
        //         // Check if the mesh belongs to a submesh.
        //         mesh.traverse((child) => {
        //           if (child !== mesh && child instanceof Mesh) {
        //             if (child.name === this.pendingMeshes[i].submesh) {
        //               loadMesh(mesh, this.pendingMeshes[i].material, this.pendingMeshes[i].parent, ext);
        //             } else {
        //               // The mesh is already stored in Gz3D.Scene. The new submesh will be parsed.
        //               // Suppress linter warning.
        //               this.scene.loadMeshFromUri(mesh.name, this.pendingMeshes[i].submesh, this.pendingMeshes[i].centerSubmesh, (mesh) => {
        //                 loadMesh(mesh, this.pendingMeshes[i].material, this.pendingMeshes[i].parent, ext);
        //               });
        //             }
        //           }
        //         });
        //       }
        //     }
        //   }
        // });

        let mesh = await this.scene.loadMeshFromUriAsync(modelUri, submesh, centerSubmesh);
        // Check for the pending meshes.
        for (let i = 0; i < this.pendingMeshes.length; i++) {
          if (this.pendingMeshes[i].meshUri === mesh.name) {
            // No submesh: Load the result.
            if (!this.pendingMeshes[i].submesh) {
              loadMesh(mesh, this.pendingMeshes[i].material, this.pendingMeshes[i].parent, ext);
            } else {
              // Check if the mesh belongs to a submesh.
              mesh.traverse((child) => {
                if (child !== mesh && child instanceof Mesh) {
                  if (child.name === this.pendingMeshes[i].submesh) {
                    loadMesh(mesh, this.pendingMeshes[i].material, this.pendingMeshes[i].parent, ext);
                  } else {
                    // The mesh is already stored in Gz3D.Scene. The new submesh will be parsed.
                    // Suppress linter warning.

                    // This doesn't work yet
                    // mesh = await this.scene.loadMeshFromUriAsync(mesh.name, this.pendingMeshes[i].submesh, this.pendingMeshes[i].centerSubmesh); 
                    loadMesh(mesh, this.pendingMeshes[i].material, this.pendingMeshes[i].parent, ext);
                  }
                }
              });
            }
          }
        }
      }
    }

    if (obj) {
      if (material) {
        // texture mapping for simple shapes and planes only, not used by mesh and terrain
        this.scene.setMaterial(obj, material);
      }
      obj.updateMatrix();
      parent.add(obj);
      loadGeom(parent);
    }

    // Callback function when the mesh is ready.
    function loadGeom(visualObj) {
      visualObj.traverse((child) => {
        if (child !== visualObj && child instanceof Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          if (visualObj.castShadows) {
            child.castShadow = visualObj.castShadows;
          }

          if (visualObj.receiveShadows) {
            child.receiveShadow = visualObj.receiveShadows;
          }

          if (visualObj.name.indexOf('COLLISION_VISUAL') >= 0) {
            child.castShadow = false;
            child.receiveShadow = false;

            child.visible = this.scene.showCollisions;
          }
        }
      });
    }
  };

  /**
   * Parses SDF visual element and creates THREE 3D object by parsing
   * geometry element using createGeom function
   * @param {object} visual - SDF visual element
   * @param {object} options - Options to send to the creation process. It can include:
   *                 - enableLights - True to have lights visible when the object is created.
   *                                  False to create the lights, but set them to invisible (off).
   *                 - fuelName - Name of the resource in Fuel. Helps to match URLs to the correct path. Requires 'fuelOwner'.
   *                 - fuelOwner - Name of the resource's owner in Fuel. Helps to match URLs to the correct path. Requires 'fuelName'.
   *                 - scopedName - Scoped name of the element's parent. Used to create the element's scoped name.
   * @returns {THREE.Object3D} visualObj - 3D object which is created
   * according to SDF visual element.
   */
  createVisual = (visual, options) => {
    //TODO: handle these node values
    // cast_shadow, receive_shadows
    if (visual.geometry) {
      const visualObj = new Object3D();
      visualObj.name = visual['@name'] || visual['name'];
      visualObj.scopedName = this.createScopedName(visual, options['scopedName']);

      // Create an unique name to disambiguate from topic messages.
      if (visual['id'] !== undefined) {
        visualObj.uniqueName = this.createUniqueName(visual);
      }

      if (visual.pose) {
        const visualPose = this.parsePose(visual.pose);
        this.scene.setPose(visualObj, visualPose.position, visualPose.orientation);
      }

      this.createGeom(visual.geometry, visual.material, visualObj, options);
      return visualObj;
    }

    return null;
  };

  /**
   * Parses SDF sensor element and creates THREE 3D object
   * @param {object} sensor - SDF sensor element
   * @param {object} options - Options to send to the creation process. It can include:
   *                 - fuelName - Name of the resource in Fuel. Helps to match URLs to the correct path. Requires 'fuelOwner'.
   *                 - fuelOwner - Name of the resource's owner in Fuel. Helps to match URLs to the correct path. Requires 'fuelName'.
   *                 - scopedName - Scoped name of the element's parent. Used to create the element's scoped name.
   * @returns {THREE.Object3D} sensorObj - 3D object which is created
   * according to SDF sensor element.
   */
  createSensor = (sensor, options) => {
    const sensorObj = new Object3D();
    sensorObj.name = sensor['name'] || sensor['@name'] || '';
    sensorObj.scopedName = this.createScopedName(sensor, options['scopedName']);

    // Create an unique name to disambiguate from topic messages.
    if (sensor['id'] !== undefined) {
      sensorObj.uniqueName = this.createUniqueName(sensor);
    }

    if (sensor.pose) {
      const sensorPose = this.parsePose(sensor.pose);
      this.scene.setPose(sensorObj, sensorPose.position, sensorPose.orientation);
    }

    return sensorObj;
  };

  /**
   * Auxiliary function to get and parse an included model.
   * To render an included model, we need to request its files to the Server.
   * A cache map is used to avoid making duplicated requests and reuse the obtained SDF.
   * @param {object} includedModel - The included model.
   * @param {THREE.Object3D} parent - The parent that is including the given model.
   */
  includeModel = (includedModel, parent) => {
    // The included model is copied. This allows the SDF to be reused without modifications.
    // The parent is stored in the model, so we don't lose their context once the model's
    // Object3D is created.
    const model = {...includedModel, parent};

    // We need to request the files of the model to the Server.
    // In order to avoid duplicated requests, we store the model in an array until their files
    // are available.
    if (!this.pendingModels.has(model.uri)) {
      // The URI is not in the cache map. We have to make the request to the Server.
      // Add the model to the models array of the map, to use them once the request resolves.
      this.pendingModels.set(model.uri, { models: [model] });

      // Request the files from the server, and create the pending models on it's callback.
      if (this.requestHeaderKey && this.requestHeaderValue) {
        this.fuelServer.setRequestHeader(this.requestHeaderKey, this.requestHeaderValue);
      }
      this.fuelServer.getFiles(model.uri, (files) => {
        // The files were obtained.
        let sdfUrl;
        files.forEach((file) => {
          if (file.endsWith('model.sdf')) {
            sdfUrl = file;
            return;
          }
          this.addUrl(file);
        });

        // Read and parse the SDF.
        this.fuelServer.getSDF(sdfUrl, (sdf) => {
          if (!sdf) {
            console.log('Error: Failed to get the SDF file (' + sdfUrl + '). The XML is likely invalid.');
            return;
          }
          const sdfObj = this.parseSDF(sdf);

          const entry = this.pendingModels.get(model.uri);
          entry.sdf = sdfObj;

          // Extract Fuel owner and name. Used to match the correct URL.
          let options;
          if (model.uri.startsWith('https://') || model.uri.startsWith('file://')) {
            const uriSplit = model.uri.split('/');
            const modelsIndex = uriSplit.indexOf('models');
            options = {
              fuelOwner: uriSplit[modelsIndex - 1],
              fuelName: uriSplit[modelsIndex + 1],
              scopedName: parent.scopedName
            };
          }

          entry.models.forEach((pendingModel) => {
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
        let options;
        if (model.uri.startsWith('https://') || model.uri.startsWith('file://')) {
          const uriSplit = model.uri.split('/');
          const modelsIndex = uriSplit.indexOf('models');
          options = {
            fuelOwner: uriSplit[modelsIndex - 1],
            fuelName: uriSplit[modelsIndex + 1],
            scopedName: parent.scopedName
          };
        }

        entry.models.forEach((pendingModel) => {
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
  };

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
   *                 - scopedName - Scoped name of the element's parent. Used to create the element's scoped name.
   * @returns {THREE.Object3D} linkObject - 3D link object
   */
  createLink = (link, options) => {
    let linkPose, visualObj, sensorObj;
    const linkObj = new Object3D();

    linkObj.name = link['name'] || link['@name'] || '';
    linkObj.scopedName = this.createScopedName(link, options['scopedName']);

    // Create an unique name to disambiguate from topic messages.
    if (link['id'] !== undefined) {
      linkObj.uniqueName = this.createUniqueName(link);
    }

    options['scopedName'] = linkObj.scopedName;

    if (link.inertial) {
      let inertialPose, inertialMass, inertia = {};
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

      for (let i = 0; i < link.visual.length; ++i) {
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

      for (let j = 0; j < link.collision.length; ++j) {
        visualObj = this.createVisual(link.collision[j], options);
        if (visualObj && !visualObj.parent) {
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
      for (let k = 0; k < link.light.length; ++k) {
        const light = this.spawnLight(link.light[k]);
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
      for (let em = 0; em < link.particle_emitter.length; ++em) {
        const emitter = this.createParticleEmitter(link.particle_emitter[em]);
        if (emitter !== null && emitter !== undefined) {
          linkObj.userData = {
            emitter: emitter
          };
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
  };

  /**
   * Creates the Particle Emitter.
   * Particle Emitter is handled with ShaderParticleEngine, a third-party library.
   * More information at https://github.com/squarefeet/ShaderParticleEngine
   *
   * @param {object} The emitter element from SDF or protobuf object.
   * @return {object} The particle emitter object.
   */
  createParticleEmitter = (emitter) => {
    // Auxliar function to extract the value of an emitter property from
    // either SDF or protobuf object (stored in a data property).
    function extractValue(property) {
      if (emitter && emitter[property] !== undefined) {
        if (emitter[property]['data'] !== undefined) {
          return emitter[property].data;
        } else {
          return emitter[property];
        }
      }
      return undefined;
    }

    // Given name of the emitter.
    const emitterName = this.createUniqueName(emitter);

    // Whether the emitter is generating particles or not.
    const emitting = this.parseBool(extractValue('emitting')) || false;

    // Duration of the particle emitter. Infinite if null.
    let duration = extractValue('duration');
    duration = duration !== undefined ? parseFloat(duration) : null;

    // Emitter type.
    // TODO(german) Support Point, Sphere and Cylinder (No direct relation with SPE)
    // let type = extractValue('type') || extractValue('@type');
    // type = type || 'point';

    // Lifetime of the individual particles, in seconds.
    let lifetime = extractValue('lifetime');
    lifetime = lifetime !== undefined ? parseFloat(lifetime) : 5;

    // Velocity range.
    let minVelocity = extractValue('min_velocity');
    minVelocity = minVelocity !== undefined ? parseFloat(minVelocity) : 1;

    let maxVelocity = extractValue('max_velocity');
    maxVelocity = maxVelocity !== undefined ? parseFloat(maxVelocity) : 1;

    // Size of the particle emitter.
    const size = this.parse3DVector(emitter['size']) || new Vector3(1, 1, 1);

    // Size of the individual particles.
    const particleSize = this.parse3DVector(emitter['particle_size']) || new Vector3(1, 1, 1);

    // Pose of the particle emitter
    const pose = this.parsePose(emitter['pose']);

    // Particles per second emitted.
    let rate = extractValue('rate');
    rate = rate !== undefined ? parseFloat(rate) : 10;

    // Scale modifier for each particle. Modifies their size per second.
    let scaleRate = extractValue('scale_rate');
    scaleRate = scaleRate !== undefined ? parseFloat(scaleRate) : 1;

    // Image that determines the color range. This image should be 1px in height.
    // NOTE: SPE can have up to four different values, and internally it interpolates between these
    // values for the lifetime of the particle.
    let colorRangeImage = emitter['color_range_image'] || '';
    // Handle the case where the emitter information is from a protobuf
    // message.
    if (typeof colorRangeImage === 'object' && colorRangeImage !== null &&
        'data' in colorRangeImage) {
      colorRangeImage = colorRangeImage.data;
    }

    // Texture image of the particles.
    let particleTexture;
    if ('material' in emitter && 'pbr' in emitter['material']) {
      // SDF has a nested metal tag, while protobuf does not. Need to handle
      // both.
      if ('metal' in emitter['material']['pbr']) {
        particleTexture = emitter['material']['pbr']['metal']['albedo_map'];
      } else {
        particleTexture = emitter['material']['pbr']['albedo_map'];
      }
    }

    // Get the URL of the images used.
    let particleTextureUrl;
    let colorRangeImageUrl;
    if (this.usingFilesUrls) {
      for (let u = 0; u < this.customUrls.length; u++) {
        if (this.customUrls[u].indexOf(colorRangeImage) > -1) {
          colorRangeImageUrl = this.customUrls[u];
        }

        if (this.customUrls[u].indexOf(particleTexture) > -1) {
          particleTextureUrl = this.customUrls[u];
        }

        if (colorRangeImageUrl && particleTextureUrl) {
          break;
        }
      }

      if (colorRangeImage && !colorRangeImageUrl) {
        colorRangeImageUrl = this.createFuelUri(colorRangeImage);
      }
      if (particleTexture && !particleTextureUrl) {
        particleTextureUrl = this.createFuelUri(particleTexture);
      }
    }

    if (!colorRangeImageUrl) {
      console.error('color_range_image is missing, the particle emitter will not work');
      return;
    }

    if (!particleTextureUrl) {
      console.error('albedo_map is missing, the particle emitter will not work');
      return;
    }

    let particleEmitter;

    // Lazy-load SPE. This allows us to decrease the size of the bundle. SPE will only be downloaded if a particle
    // emitter needs to be parsed.
    import(/* webpackChunkName: "SPE" */ '../lib/SPE.min.js').then((SPE) => {
      // Create the Particle Group.
      // This is the container for the Particle Emitter.
      // For more information, check http://squarefeet.github.io/ShaderParticleEngine/docs/api/SPE.Group.html
      const particleGroup = new SPE.Group({
        // TODO(german) SPE requires just a texture, leaving the SDF Material related information out.
        // We might want to change the engine or write our if this proves to be an issue in the future.
        texture: {
          value: this.scene.textureLoader.load(particleTextureUrl),
        },
        transparent: true,
        blending: NormalBlending,
      });
      particleGroup['name'] = emitterName;

      // Particle Emitter.
      // For more information, check http://squarefeet.github.io/ShaderParticleEngine/docs/api/SPE.Emitter.html
      particleEmitter = new SPE.Emitter({
        // How many particles this emitter will hold.
        // The rate of particles emitted per second is roughly the particleCount/lifetime.
        particleCount: rate * lifetime,

        // Type of emitter. Box by default.
        // TODO(german) Support Point, Sphere and Cylinder (No direct relation with SPE)
        type: SPE.distributions.BOX,

        // Duration of the particle emitter. Infinite if null.
        duration: duration > 0? duration : null,

        // Position of the emitter. The value is the current position, and spread is related to the size.
        position: {
          value: new Vector3().copy(pose.position),
          spread: new Vector3().copy(size),
        },

        // Particle velocity. Value is the base, and uses spread to randomize each particle.
        velocity: {
          value: new Vector3(0, 0, minVelocity),
          spread: new Vector3(0, 0, maxVelocity - minVelocity),
        },

        // Particle size at the start and finish of their lifetime.
        // SPE interpolates these values.
        size: {
          value: [particleSize.x, particleSize.x + scaleRate * lifetime],
        },

        // Lifetime of the individual particles, in seconds.
        maxAge: {
          value: lifetime
        },
      });

      // The emitter is disabled until the the color and opacity information is read.
      particleEmitter.disable();

      particleGroup.addEmitter(particleEmitter);

      let addedToObj = false;
      if ('header' in emitter) {
        for (let i = 0; i < emitter['header'].data.length; ++i)  {
          if (emitter['header'].data[i].key === 'frame') {
            const frame = emitter['header'].data[i].value[0];
            const parentObj = this.scene.getByProperty('scopedName', frame);

            // Attach the Particle Group to a parent object.
            if (parentObj !== undefined) {
              parentObj.add(particleGroup.mesh);
              addedToObj = true;
            }
          }
        }
      }

      // Add the Particle Group to the scene, if it was not attached to a parent
      // object.
      if (!addedToObj) {
        this.scene.add(particleGroup.mesh);
      }

      // This is required by the rendering loop.
      this.scene.addParticleGroup(particleGroup);

      // Determine Color and Opacity information from the Color Range Image.
      // Note: SPE supports 4 values of opacity and color in an array. The engine automatically interpolates between them.
      // This means we cannot have all the colors from the image, instead, we pick only 4.
      this.scene.textureLoader.load(colorRangeImageUrl, (texture) => {
        // Load the Color Range Image and read the color information from its pixels.
        // A canvas is required to do so.
        const width = texture.image.width;
        const height = texture.image.height;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.drawImage(texture.image, 0, 0);
        const imageData = context.getImageData(0, 0, width, height);

        const colorImgData = [];
        const opacityData = [];
        for (let i = 0; i < width; i += Math.floor(width/3)) {
          // The data array contains rgba values for each pixel.
          const color = new Color(
            imageData.data[i * 4 + 0] / 255,
            imageData.data[i * 4 + 1] / 255,
            imageData.data[i * 4 + 2] / 255
          );
          const opacity = imageData.data[i * 4 + 3] / 255;

          colorImgData.push(color);
          opacityData.push(opacity);
        }

        // Set the color and opacity of the particle emitter.
        for (let i = 0; i < 4; i++) {
          particleEmitter.color.value[i] = colorImgData[i];

          particleEmitter.opacity.value[i] = opacityData[i];
        }

        // Finally, enable the emission.
        if (emitting) {
          particleEmitter.enable();
        } else {
          particleEmitter.disable();
        }
      });
      return particleEmitter;
    });

    return particleEmitter;
  };

  /**
   * Creates a light from either a protobuf object or SDF object.
   * @param {object} light - A light represented by a Protobuf or SDF object.
   * @returns {THREE.Light} lightObj - THREE light object created
   * according to given properties. The type of light object is determined
   * according to light type
   */
  spawnLight = (light) => {
    if (light.type !== undefined && !(light.type instanceof String)) {
      return this.spawnLightFromProto(light);
    } else {
      return this.spawnLightFromSDF({light: light});
    }
  };

  /**
   * Creates THREE light object according to properties of sdf object
   * which is parsed from sdf model of the light
   * @param {object} sdfObj - object which is parsed from the sdf string
   * @returns {THREE.Light} lightObj - THREE light object created
   * according to given properties. The type of light object is determined
   * according to light type
   */
  spawnLightFromSDF = (sdfObj) => {
    let light = sdfObj.light;
    let name = light['@name'] || light['name'];
    let diffuse = this.parseColor(light.diffuse);
    let specular = this.parseColor(light.specular);
    let pose = this.parsePose(light.pose);
    let castShadows = this.parseBool(light.cast_shadows);
    let distance = null;
    let attConst = null;
    let attLin = null;
    let attQuad= null;
    let direction = null;
    let innerAngle = null;
    let outerAngle = null;
    let falloff = null;
    let type = 1;

    if (light.attenuation) {
      if (light.attenuation.range) {
        distance = parseFloat(light.attenuation.range);
      }
      if (light.attenuation.constant) {
        attConst = parseFloat(light.attenuation.constant);
      }
      if (light.attenuation.linear) {
        attLin = parseFloat(light.attenuation.linear);
      }
      if (light.attenuation.quadratic) {
        attQuad = parseFloat(light.attenuation.quadratic);
      }
    }

    if (light.spot) {
      if (light.spot.inner_angle) {
        innerAngle = parseFloat(light.spot.inner_angle);
      }
      if (light.spot.outer_angle) {
        outerAngle = parseFloat(light.spot.outer_angle);
      }
      if (light.spot.falloff) {
        falloff = parseFloat(light.spot.falloff);
      }
    }

    // equation taken from
    // eslint-disable-next-line
    // https://docs.blender.org/manual/en/dev/render/blender_render/lighting/lights/light_attenuation.html
    const E = 1;
    const D = 1;
    const r = 1;
    const L = attLin;
    const Q = attQuad;
    const intensity = E*(D/(D+L*r))*(Math.pow(D,2)/(Math.pow(D,2)+Q*Math.pow(r,2)));

    if (light['@type'] === 'point') {
      type = 1;
    }
    if (light['@type'] === 'spot') {
      type = 2;
    }
    else if (light['@type'] === 'directional') {
      type = 3;
      direction = this.parse3DVector(light.direction);
    }
    const lightObj = this.scene.createLight(type, diffuse, intensity, pose,
      distance, castShadows, name, direction, specular,
      attConst, attLin, attQuad, innerAngle, outerAngle, falloff);

    return lightObj;
  };

  /**
   * Creates THREE light object according to properties of protobuf object
   * @param {object} pbObj - object which is parsed from a Protobuf string
   * @returns {THREE.Light} lightObj - THREE light object created
   * according to given properties. The type of light object is determined
   * according to light type
   */
  spawnLightFromProto = (light) => {
    // equation taken from
    // https://docs.blender.org/manual/en/dev/render/blender_render/lighting/lights/light_attenuation.html
    const E = 1;
    const D = 1;
    const r = 1;
    const L = light.attenuation_linear;
    const Q = light.attenuation_quadratic;
    const intensity = E*(D/(D+L*r))*(Math.pow(D,2)/(Math.pow(D,2)+Q*Math.pow(r,2)));

    const lightObj = this.scene.createLight(
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
      light.spot_falloff
    );
    return lightObj;
  };

  /**
   * Parses an object and spawns the given 3D object.
   * @param {object} obj - The object, obtained after parsing the SDF or from
   * a world message.
   * @param {object} options - Options to send to the creation process. It can include:
   *                 - enableLights - True to have lights visible when the object is created.
   *                                  False to create the lights, but set them to invisible (off).
   *                 - fuelName - Name of the resource in Fuel. Helps to match URLs to the correct path. Requires 'fuelOwner'.
   *                 - fuelOwner - Name of the resource's owner in Fuel. Helps to match URLs to the correct path. Requires 'fuelName'.
   * @returns {THREE.Object3D} object - 3D object which is created from the
   * given object.
   */
  spawnFromObj = (obj, options) => {
    if (obj.model) {
      return this.spawnModelFromSDF(obj, options);
    }
    else if (obj.light) {
      return this.spawnLight(obj);
    }
    else if (obj.world) {
      return this.spawnWorldFromSDF(obj, options);
    }
  };

  /**
   * Parses SDF XML string or SDF XML DOM object and return the created Object3D
   * @param {object} sdf - It is either SDF XML string or SDF XML DOM object
   * @returns {THREE.Object3D} object - 3D object which is created from the
   * given SDF.
   */
  spawnFromSDF = (sdf) => {
    const sdfObj = this.parseSDF(sdf);
    return this.spawnFromObj(sdfObj, {
      enableLights: true
    });
  };

  /**
   * Creates 3D object from parsed model SDF
   * @param {object} sdfObj - parsed SDF object
   * @param {object} options - Options to send to the creation process. It can include:
   *                 - enableLights - True to have lights visible when the object is created.
   *                                  False to create the lights, but set them to invisible (off).
   *                 - fuelName - Name of the resource in Fuel. Helps to match URLs to the correct path. Requires 'fuelOwner'.
   *                 - fuelOwner - Name of the resource's owner in Fuel. Helps to match URLs to the correct path. Requires 'fuelName'.
   * @returns {THREE.Object3D} modelObject - 3D object which is created
   * according to SDF model object.
   */
  spawnModelFromSDF = (sdfObj, options) => {
    // create the model
    var modelObj = new Object3D();
    modelObj.name = sdfObj.model['name'] || sdfObj.model['@name'];
    modelObj.uniqueName = this.createUniqueName(sdfObj.model);

    if (options['scopedName'] !== undefined) {
      modelObj.scopedName = options.scopedName;
    } else {
      modelObj.scopedName = modelObj.name;
    }

    options.scopedName = modelObj.scopedName;

    let pose;
    let linkObj;

    if (sdfObj.model.pose) {
      pose = this.parsePose(sdfObj.model.pose);
      this.scene.setPose(modelObj, pose.position, pose.orientation);
    }

    //convert link object to link array
    if (sdfObj.model.link) {
      if (!(sdfObj.model.link instanceof Array)) {
        sdfObj.model.link = [sdfObj.model.link];
      }

      for (let i = 0; i < sdfObj.model.link.length; ++i) {
        linkObj = this.createLink(sdfObj.model.link[i], options);
        if (linkObj) {
          modelObj.add(linkObj);
        }
      }
    }

    //convert nested model objects to model array
    if (sdfObj.model.model) {
      if (!(sdfObj.model.model instanceof Array)) {
        sdfObj.model.model = [sdfObj.model.model];
      }
      for (let i = 0; i < sdfObj.model.model.length; ++i) {
        options.scopedName = this.createScopedName(sdfObj.model.model[i], modelObj.scopedName);
        const tmpModelObj = {model:sdfObj.model.model[i]};
        const nestedModelObj = this.spawnModelFromSDF(tmpModelObj, options);
        if (nestedModelObj) {
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

      sdfObj.model.include.forEach((includedModel) => {
        this.includeModel(includedModel, modelObj);
      });
    }

    return modelObj;
  };

  /**
   * Creates 3D object from parsed world SDF
   * @param {object} sdfObj - parsed SDF object
   * @param {object} options - Options to send to the creation process. It can include:
   *                 - enableLights - True to have lights visible when the object is created.
   *                                  False to create the lights, but set them to invisible (off).
   *                 - fuelName - Name of the resource in Fuel. Helps to match URLs to the correct path. Requires 'fuelOwner'.
   *                 - fuelOwner - Name of the resource's owner in Fuel. Helps to match URLs to the correct path. Requires 'fuelName'.
   * @returns {THREE.Object3D} worldObject - 3D object which is created
   * according to SDF world object.
   */
  spawnWorldFromSDF = (sdfObj, options) => {
    const worldObj = new Object3D();
    worldObj.name = this.createUniqueName(sdfObj.world);

    // remove default sun before adding objects
    // we will let the world file create its own light
    const sun = this.scene.getByName('sun');
    if (sun) {
      this.scene.remove(sun);
    }

    // parse models
    if (sdfObj.world.model) {
      // convert object to array
      if (!(sdfObj.world.model instanceof Array)) {
        sdfObj.world.model = [sdfObj.world.model];
      }

      for (let j = 0; j < sdfObj.world.model.length; ++j) {
        const tmpModelObj = {model: sdfObj.world.model[j]};
        const modelObj = this.spawnModelFromSDF(tmpModelObj, options);
        worldObj.add(modelObj);
      }
    }

    // parse lights
    if (sdfObj.world.light) {
      // convert object to array
      if (!(sdfObj.world.light instanceof Array)) {
        sdfObj.world.light = [sdfObj.world.light];
      }

      for (let k = 0; k < sdfObj.world.light.length; ++k) {
        const lightObj = this.spawnLight(sdfObj.world.light[k]);
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

      sdfObj.world.include.forEach((includedModel) => {
        this.includeModel(includedModel, worldObj);
      });
    }

    return worldObj;
  };
}
