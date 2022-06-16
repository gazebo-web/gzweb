export class FuelServer {
  private host: string;
  private version: string;
  private requestHeader = {};

  /**
  * FuelServer is in charge of making requests to the Fuel servers.
  * @param {string} host - The Server host url.
  * @param {string} version - The version used.
  **/
  constructor(host: string, version: string) {
    this.host = host;
    this.version = version;
    this.requestHeader = {};
  }

  /**
   * Get the list of files a model or world has.
   * @param {string} uri - The uri of the model or world.
   * @param {function} callback - The callback to use once the files are ready.
   */
  public getFiles(uri: string, callback: any): void {
    // Note: jshint is ignored as we use fetch API here instead of a XMLHttpRequest.
    // We still handle the response in a callback.
    // TODO(germanmas): We should update and use async/await instead throughout the library.
    const filesUrl = `${uri.trim()}/tip/files`;
  
    // Make the request to get the files.
    fetch(filesUrl, { headers: this.requestHeader })
      .then(res => res.json())
      .then(json => {
        const files = prepareURLs(json['file_tree'], filesUrl);
        callback(files);
      })
      .catch(error => console.error(error));
  
    // Helper function to parse the file tree of the response into an array of
    // file paths. The file tree from the Server consists of file elements
    // that contain a name, a path and children (if they are a folder).
    function prepareURLs(fileTree: any, baseUrl: string): string[] {
      let parsedFiles: string[] = [];
  
      for (var i = 0; i < fileTree.length; i++) {
        // Avoid the thumbnails folder.
        if (fileTree[i].name === 'thumbnails') {
          continue;
        }
  
        // Loop through files to extract files from folders.
        extractFile(fileTree[i]);
      }
      return parsedFiles;
  
      // Helper function to extract the files from the file tree.
      // Folder elements have children, while files don't.
      function extractFile(el: any): void {
        if (!el.children) {
          // Avoid config files as they are not used.
          if (el.name.endsWith('.config')) {
            return;
          }
  
          var url = baseUrl + el.path;
          parsedFiles.push(url);
        } else {
          for (var j = 0; j < el.children.length; j++) {
            extractFile(el.children[j]);
          }
        }
      }
    }
  }

  /**
   * Set a request header for internal requests.
   *
   * @param {string} header - The header to send in the request.
   * @param {string} value - The value to set to the header.
   */
  public setRequestHeader(header: string, value: string): void {
    this.requestHeader = { [header]: value };
  }
}
