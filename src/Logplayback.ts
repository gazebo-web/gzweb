import initSqlJs, { Database, SqlJsStatic, Statement } from "@foxglove/sql.js";

export class Logplayback {

  constructor(private sqlWasmFilename: string) {
    console.log('meta', sqlWasmFilename);
    /*const res = await fetch(
      new URL("@foxglove/sql.js/dist/sql-wasm.wasm", import.meta.url).toString(),
    );
   */
    fetch(
      new URL(sqlWasmFilename, import.meta.url).toString())
      .then((response) => {
        console.log('Got ', response);
      });
  }

}
