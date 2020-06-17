# Gz3D

A ThreeJS-based library used to render SDF models and worlds.

## Setup

You need the following:
- Node version 12.
- NPM version 6.

You can use [NVM](https://github.com/nvm-sh/nvm) to switch between versions easily. With it, you can then do:

```
nvm install 12
nvm use 12
node -v && npm -v # Your versions will be correct.
```

After this, install dependencies with:

```
npm install
```

## Build

Once you have your dependencies installed, you can run:

```
npm run build
```

The output library will be in the `/dist` directory. `gz3d.js` is good for developing purposes, as it's not minified. The minified version, `gz3d.min.js` should be used in production environments.
