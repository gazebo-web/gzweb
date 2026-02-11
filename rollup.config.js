// rollup.config.js
// import typescript from '@rollup/plugin-typescript';
import { terser } from "rollup-plugin-terser";
import babel from "@rollup/plugin-babel";
// import { nodeResolve } from '@rollup/plugin-node-resolve';
//import commonjs from '@rollup/plugin-commonjs';

let builds = [
  // Module
  {
    input: "tsc-out/src/gzweb.js",
    plugins: [],
    external: [
      "eventemitter2",
      "jszip",
      "protobufjs",
      "rxjs",
      "three",
      "three-nebula",
      "fast-xml-parser",
    ],
    output: [
      {
        format: "esm",
        name: "gzweb",
        file: "dist/gzweb.module.js",
        globals: {
          eventemitter2: "eventemitter2",
          protobufjs: "protobufjs",
          rxjs: "rxjs",
          three: "THREE",
          jszip: "JSZip",
          "fast-xml-parser": "fast-xml-parser",
        },
      },
    ],
  },

  // UMD unminified
  {
    input: "tsc-out/src/gzweb.js",
    plugins: [
      /*commonjs(),
      nodeResolve({
        browser: true,
      }),*/
      babel({
        babelHelpers: "bundled",
        exclude: "node_modules/**",
        compact: false,
      }),
    ],
    external: [
      "eventemitter2",
      "jszip",
      "protobufjs",
      "rxjs",
      "three",
      "three-nebula",
      "fast-xml-parser",
    ],
    output: [
      {
        format: "umd",
        name: "gzweb",
        file: "dist/gzweb.js",
        globals: {
          eventemitter2: "eventemitter2",
          protobufjs: "protobufjs",
          rxjs: "rxjs",
          three: "THREE",
          jszip: "JSZip",
          "three-nebula": "three-nebula",
          "fast-xml-parser": "fast-xml-parser",
        },
      },
    ],
  },

  // UMD minified
  {
    input: "tsc-out/src/gzweb.js",
    plugins: [
      /*commonjs(),
      nodeResolve({
        browser: true,
      }),*/
      babel({
        babelHelpers: "bundled",
        exclude: "node_modules/**",
      }),
      terser(),
    ],
    external: [
      "eventemitter2",
      "jszip",
      "protobufjs",
      "rxjs",
      "three",
      "three-nebula",
      "fast-xml-parser",
    ],
    output: [
      {
        format: "umd",
        name: "gzweb",
        file: "dist/gzweb.min.js",
        globals: {
          eventemitter2: "eventemitter2",
          protobufjs: "protobufjs",
          rxjs: "rxjs",
          three: "THREE",
          jszip: "JSZip",
          "three-nebula": "three-nebula",
          "fast-xml-parser": "fast-xml-parser",
        },
      },
    ],
  },
];

export default builds;
//{
//  input: 'tsc-out/src/gzweb.js',
//  external: [
//    'eventemitter2',
//    'protobufjs',
//    'rxjs',
//    'three',
//  ],
//  output: [
//    {
//      file: 'dist/gzweb.js',
//      format: 'umd',
//      name: 'gzweb',
//      sourcemap: 'inline',
//      globals: {
//        eventemitter2: 'eventemitter2',
//        protobufjs: 'protobufjs',
//        rxjs: 'rxjs',
//        three: 'three'
//      }
//    },
//    {
//      file: 'dist/gzweb.min.js',
//      format: 'umd',
//      name: 'gzweb',
//      plugins: [terser()],
//      globals: {
//        eventemitter2: 'eventemitter2',
//        protobufjs: 'protobufjs',
//        rxjs: 'rxjs',
//        three: 'three'
//      }
//    }
//  ],
//
//  plugins: [
//    /*commonjs(),
//    nodeResolve({
//      browser: true,
//    }),*/
//    babel({
//      babelHelpers: 'bundled',
//      exclude: 'node_modules/**'
//    })
//  ]
//};
