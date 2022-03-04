const path = require('path');

module.exports = {
  entry: './src/main.js',
  output: {
    filename: 'gz3d.js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      name: 'GZ3D',
      type: 'umd',
    },
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: ['babel-loader'],
      }
    ]
  },
};