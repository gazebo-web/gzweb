import { Loader, LoadingManager, LoaderUtils, FileLoader, TextureLoader, Texture } from 'three';
import { OBJLoader as ThreeOBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader';

/**
 * This is a custom implementation of an OBJLoader that uses both OBJLoader and MTLLoader
 * internally.
 *
 * It allows us to modify the materials and point them to the correct path.
 * This assumes both .obj and .mtl files are inside a ./meshes folder, and textures are
 * inside a ./materials/textures folder.
 *
 * This loader loads OBJ meshes alongside their MTL files.
 *
 * As other three Loaders, it extends the Loader class to maintain compatibility.
 */
export class OBJLoader extends Loader {
  constructor(manager) {
    super(manager);
    this.objLoader = new ThreeOBJLoader(manager);
    this.mtlLoader = new MTLLoader(manager);
  }

  load = (url, onLoad, onProgress, onError) => {
    const scope = this;
    const path = (scope.path === '') ? LoaderUtils.extractUrlBase(url) : scope.path;

    this.objLoader.setRequestHeader(this.requestHeader);
    this.objLoader.setWithCredentials(this.withCredentials);

    this.mtlLoader.setPath(path);
    this.mtlLoader.setRequestHeader(this.requestHeader);
    this.mtlLoader.setWithCredentials(this.withCredentials);

    const loader = new FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);

    loader.load(url, function(text) {
      try {
        const container = scope.parse(text);

        if (container.materialLibraries && container.materialLibraries.length > 0) {
          container.materialLibraries.forEach((material) => {
            const loader = new FileLoader(scope.mtlLoader.manager);
            loader.setPath(scope.mtlLoader.path);
            loader.setRequestHeader(scope.mtlLoader.requestHeader);
            loader.load(material, (txt) => {
              // Modify the texture path in the MTL text obtained.
              // Note: We assume .mtl and .obj are in the same ./meshes folder and textures are
              // located at a ./materials/textures folder.
              let newTxt = '';
              const lines = txt.split('\n');

              if (lines.length === 0) {
                return;
              }

              for (let i in lines) {
                let line = lines[i];

                if (line === undefined || line.indexOf('#') === 0) {
                  continue;
                }

                if (!line.includes('map_Ka') && !line.includes('map_Kd')) {
                  newTxt += `${line}\n`;
                  continue;
                }

                let path = scope.mtlLoader.path;
                path = path.substring(0, path.lastIndexOf('meshes'));
                line = line.replace('map_Ka ', `map_Ka ${path}materials/textures/`);
                line = line.replace('map_Kd ', `map_Kd ${path}materials/textures/`);

                newTxt += `${line}\n`;
              }

              const mtlCreator = scope.mtlLoader.parse(newTxt);

              // Change the texture loader, if the requestHeader is present.
              // Texture Loaders use an Image Loader internally, instead of a File Loader.
              // Image Loader uses an img tag, and their src request doesn't accept custom headers.
              // See https://github.com/mrdoob/three.js/issues/10439
              if (scope.requestHeader && Object.keys(scope.requestHeader).length > 0) {
                const manager = new LoadingManager();
                const textureLoader = new TextureLoader(scope.manager);

                mtlCreator.setManager(manager);

                // Sets a handler for any extension to use the texture loader.
                manager.addHandler(/.([A-Z]*)$/i, textureLoader);

                textureLoader.load = (url, onLoad, onProgress, onError) => {
                  const image = document.createElementNS( 'http://www.w3.org/1999/xhtml', 'img' );
                  const texture = new Texture();

                  const fileLoader = new FileLoader(scope.manager);
                  fileLoader.setRequestHeader(scope.mtlLoader.requestHeader);
                  fileLoader.setResponseType('blob');

                  // Once the image is loaded, we need to revoke the ObjectURL.
                  image.onload = function() {
                    image.onload = null;
                    URL.revokeObjectURL(image.src);
                    if (onLoad) {
                      onLoad(image);
                    }
                    texture.image = image;
                    texture.needsUpdate = true;
                    scope.manager.itemEnd(url);
                  };

                  image.onerror = onError;

                  fileLoader.load(
                    url,
                    (blob) => {
                      image.src = URL.createObjectURL(blob);
                    },
                    onProgress,
                    onError
                  );

                  scope.manager.itemStart(url);
                  return texture;
                };
              }

              container.traverse((child) => {
                if (child !== container && child.material) {
                  if (child.material.name) {
                    child.material = mtlCreator.create(child.material.name);
                  } else if (Array.isArray(child.material)) {
                    for (let i = 0; i < child.material.length; i++) {
                      child.material[i] = mtlCreator.create(child.material[i].name);
                    }
                  }
                }
              });

              // Once the materials are created, proceed with the callback.
              onLoad(container);
            });
          });
        } else {
          onLoad(container);
        }
      } catch (e) {
        if (onError) {
          onError(e);
        } else {
          console.error(e);
        }
        scope.manager.itemError(url);

      }
    }, onProgress, onError);
  };

  parse = (text) => {
    return this.objLoader.parse(text);
  };
}
