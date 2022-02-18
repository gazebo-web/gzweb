/**
 * Fuel Server is in charge of making requests to the Fuel backend.
 */
export class FuelServer {
  host;
  version;
  requestHeader = {};

  /**
   * Creates an instance of Fuel Server.
   *
   * @param {string} host - The Server host url.
   * @param {string} version - The version used.
   */
  constructor(host, version) {
    this.host = host;
    this.version = version;
  }

  /**
   * Get the list of files a model or world has.
   *
   * @param {string} uri - The uri of the model or world.
   * @param {function} callback - The callback to use once the files are ready.
   */
  getFiles = (uri, callback) => {
    // Helper function to parse the file tree of the response into an array of file paths.
    // The file tree from the Server consists of file elements that contain a name, a path
    // and children (if they are a folder).
    const prepareURLs = (fileTree, baseUrl) => {
      const parsedFiles = [];

      // Helper function to extract the files from the file tree.
      // Folder elements have children, while files don't.
      const extractFile = (el) => {
        if (!el.children) {
          // Avoid config files as they are not used.
          if (el.name.endsWith('.config')) {
            return;
          }

          const url = baseUrl + el.path;
          parsedFiles.push(url);
        } else {
          for (let i = 0; i < el.children.length; i++) {
            extractFile(el.children[i]);
          }
        }
      };

      for (let i = 0; i < fileTree.length; i++) {
        // Avoid the thumbnails folder.
        if (fileTree[i].name === 'thumbnails') {
          continue;
        }

        // Loop through files to extract files from folders.
        extractFile(fileTree[i]);
      }
      return parsedFiles;
    };

    // We still handle the response in a callback.
    // TODO(germanmas): We should update and use async/await instead throughout the library.
    const filesUrl = `${uri.trim()}/tip/files`;
    const headers = new Headers(this.requestHeader);
    fetch(filesUrl, { headers })
      .then(res => res.json())
      .then(json => {
        const files = prepareURLs(json['file_tree'], filesUrl);
        callback(files);
      })
      .catch(error => console.error(error));
  };

  /**
   * Read an SDF file from a url.
   * @param {string} url - full URL to an SDF file.
   * @param {function} callback - The callback to use once the file is ready.
   */
  getSDF = (url, callback) => {
    // The request is asynchronous. To avoid disrupting the current workflow too much, we use a callback.
    // TODO(germanmas): We should update and use async/await instead throughout the library.
    const headers = new Headers(this.requestHeader);
    headers.append('Content-Type', 'text/xml');

    fetch(url, { headers })
      .then(response => response.text())
      .then(str => callback(str))
      .catch(error => console.error(error));
  };

  /**
   * Set a request header for internal requests.
   *
   * @param {string} header - The header to send in the request.
   * @param {string} value - The value to set to the header.
   */
  setRequestHeader = (header, value) => {
    this.requestHeader = { [header]: value };
  };
}
