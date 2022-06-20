import { getDescendants } from './Globals';
import { Scene } from './Scene';
import { FileLoader, Group, Material, Mesh, Object3D } from 'three';
import { OBJLoader } from '../loaders/OBJLoader';
import { MTLLoader, MaterialCreator } from '../loaders/MTLLoader';

export class GzObjLoader {
  private scene: Scene;
  private submesh: string;
  private centerSubmesh: boolean;
  private findResourceCb: any;
  private onLoad: any;
  private uri: string = '';
  private baseUrl: string = '';
  private files: string[] = [];
  private usingRawFiles: boolean = false;
  private objLoader: OBJLoader = new OBJLoader();
  private mtlLoader: MTLLoader = new MTLLoader();
  private container: Group;

  /**
   * Load OBJ meshes
   *
   * @constructor
   *
   * @param {GZ3D.Scene} _scene - The scene to load into
   * @param {string} _uri - mesh uri which is used by mtlloader and the objloader
   * to load both the mesh file and the mtl file using XMLHttpRequests.
   * @param {} _submesh
   * @param {} _centerSubmesh
   * @param {function(resource)} _findResourceCb - A function callback that can be used to help
   * @param {function} _onLoad
   * @param {array} _files -optional- the obj [0] and the mtl [1] files as strings
   * to be parsed by the loaders, if provided the uri will not be used just
   * as a url, no XMLHttpRequest will be made.
   */
  constructor(_scene: Scene, _uri: string, _submesh: string,
    _centerSubmesh: boolean, _findResourceCb: any,
    _onLoad: any, _onError: any, _files?: string[]) {
    // Keep parameters
    this.scene = _scene;
    this.submesh = _submesh;
    this.centerSubmesh = _centerSubmesh;
    this.findResourceCb = _findResourceCb;
    this.onLoad = _onLoad;
    this.uri = _uri;
    if (_files) {
      this.files = _files!;

      // True if raw files were provided
      this.usingRawFiles = this.files.length === 2 &&
                           this.files[0] !== undefined &&
                           this.files[1] !== undefined;
    }
  
 
    // Loaders
    this.mtlLoader.setCrossOrigin('');
  
    if (this.scene.requestHeader) {
      this.objLoader.setRequestHeader(this.scene.requestHeader);
      this.mtlLoader.setRequestHeader(this.scene.requestHeader);
    }
  
    // Assume .mtl is in the same path as .obj
    if (!this.usingRawFiles)
    {
      var baseUrl = this.uri.substr(0, this.uri.lastIndexOf('/') + 1);
      this.mtlLoader.setResourcePath(baseUrl);
      this.mtlLoader.setPath(baseUrl);
    }
  }

  /**
   * Load Obj file
   */
  public load(): void {
    var that = this;
  
    // If no raw files are provided, make HTTP request
    if (!this.usingRawFiles) {
      this.objLoader.load(this.uri,
        // onLoad
        function(_container: Group) {
          that.onObjLoaded(_container);
        },
        // onProgres
        function(_progress: any) {
          // Ignore
        },
        function(_error: any) {
          // Use the find resource callback to get the mesh
          that.findResourceCb(that.uri, function(mesh: any) {
            that.onObjLoaded(that.objLoader.parse(mesh));
          });
        }
      );
    }
    // Otherwise load from raw file
    else
    {
      var container = this.objLoader.parse(this.files[0]);
      this.onObjLoaded(container);
    }
  }

  /**
   * Callback when loading is successfully completed
   */
  private loadComplete()
  {
    let obj: Group = this.container;
    this.scene.meshes[this.uri] = obj;
    obj = obj.clone();
    this.scene.useSubMesh(obj, this.submesh, this.centerSubmesh);
  
    obj.name = this.uri;
    this.onLoad(obj);
  }

  /**
   * Callback when loading is successfully completed
   * @param {MTLLoaderMaterialCreator} _mtlCreator - Returned by MTLLoader.parse
   */
  private applyMaterial(_mtlCreator: MaterialCreator) {
    let allChildren: Object3D[] = [];
    getDescendants(this.container, allChildren);
  
    for (let j = 0; j < allChildren.length; ++j)
    {
      let child: Object3D = allChildren[j];
      if (child && child.hasOwnProperty('material')) {
        let childMesh: Mesh = <Mesh>child;
        if ((<Material>childMesh.material).name) {
          childMesh.material = _mtlCreator.create(
            (<Material>childMesh.material).name);
        } else if (Array.isArray(childMesh.material)) {
          for (var k = 0; k < childMesh.material.length; ++k) {
            childMesh.material[k] = _mtlCreator.create(
              childMesh.material[k].name);
          }
        }
      }
    }
  
    this.loadComplete();
  }

  /**
   * Callback when raw .mtl file has been loaded
   *
   * Assumptions:
   *     * Both .obj and .mtl files are under the /meshes dir
   *     * Textures are under the /materials/textures dir
   *
   * Three texture filename patterns are handled. A single .mtl file may
   * have instances of all of these.
   * 1. Path relative to the meshes folder, which should always start with
   *    ../materials/textures/
   * 2. Gazebo URI in the model:// format, referencing another model
   *    in the same path as the one being loaded
   * 2. Just the image filename without a path
   * @param {string} _text - MTL file as string
   */
  private loadMTL(_text: string) {
    if (!_text) {
      return;
    }
  
    // Handle model:// URI
    if (_text.indexOf('model://') > 0) {
      // If there's no path, remove model://
      if (!this.mtlLoader.path || this.mtlLoader.path.length === 0) {
        _text = _text.replace(/model:\/\//g, '');
      } else if (this.mtlLoader.path.indexOf('/meshes/') < 0) {
        console.error('Failed to resolve texture URI. MTL file directory [' +
            this.mtlLoader.path +
            '] not supported, it should be in a /meshes directory');
        console.error(_text);
        return;
      } else {
        // Get models path from .mtl file path
        // This assumes the referenced model is in the same path as the model
        // being loaded. So this may fail if there are models being loaded
        // from various paths
        var path = this.mtlLoader.path;
        path = path.substr(0, path.lastIndexOf('/meshes'));
        path = path.substr(0, path.lastIndexOf('/') + 1);
  
        // Search and replace
        _text = _text.replace(/model:\/\//g, path);
      }
    }
  
    // Handle case in which the image filename is given without a path
    // We expect the texture to be under /materials/textures
    var lines = _text.split('\n');
  
    if (lines.length === 0) {
      console.error('Empty or no MTL file');
      return;
    }
  
    var newText = '';
    for (var i in lines) {
      var line = lines[i];
  
      if (line === undefined || line.indexOf('#') === 0) {
        continue;
      }
  
      // Skip lines without texture filenames
      if (line.indexOf('map_Ka') < 0 && line.indexOf('map_Kd') < 0) {
        newText += line += '\n';
        continue;
      }
  
      // Skip lines which already have /materials/textures
      if (line.indexOf('/materials/textures') > 0 && !this.usingRawFiles) {
        newText += line += '\n';
        continue;
      }
  
      // Remove ../ from raw files
      if (line.indexOf('../materials/textures') > 0 && this.usingRawFiles) {
        line = line.replace('../', '');
        newText += line += '\n';
        continue;
      }
  
      // Add path to filename
      var p = this.mtlLoader.path || '';
      p = p.substr(0, p.lastIndexOf('meshes'));
  
      line = line.replace('map_Ka ', 'map_Ka ' + p + 'materials/textures/');
      line = line.replace('map_Kd ', 'map_Kd ' + p + 'materials/textures/');
  
      newText += line += '\n';
    }
  
    this.applyMaterial(this.mtlLoader.parse(newText, null));
  }

  /**
   * Callback when OBJ file has been loaded, proceeds to load MTL.
   * @param {obj} _container - Loaded OBJ.
   */
  private onObjLoaded(_container: Group) {
    this.container = _container;
  
    // Callback when MTL has been loaded
    // Linter doesn't like `that` being used inside a loop, so we move it outside
    var that = this;

    if ((this.container as any).materialLibraries.length === 0) {
      // return if there are no materials to be applied
      this.loadComplete();
      return;
    }
  
    // Load all MTL files
    if (!this.usingRawFiles) {
      for (var i=0; i < (this.container as any).materialLibraries.length; ++i) {
        // Load raw .mtl file
        let mtlPath: string = (this.container as any).materialLibraries[i];
  
        var fileLoader = new FileLoader(this.mtlLoader.manager);
        fileLoader.setPath(this.mtlLoader.path);
        fileLoader.setRequestHeader(this.mtlLoader.requestHeader);
        fileLoader.load(mtlPath, 
                        // onLoad
                        function(_text: string | ArrayBuffer) {
                          if (typeof _text === 'string') { 
                            that.loadMTL(_text as string);
                          } else {
                            console.error('Unable to load file', mtlPath);
                          }
                        });
      }
    }
    // Use provided MTL file
    else {
      this.loadMTL(this.files[1]);
    }
  }
}
