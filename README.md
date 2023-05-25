# Gzweb

Gzweb is a library that allows web clients to render models and worlds, as well as visualize and communicate with a running [Gazebo](https://gazebosim.org/home) simulation using the Websocket launcher plugin.

# Usage

Gzweb is available on NPM. Web clients can install it using:

```
npm install gzweb
```

Then, you can see The `AssetViewer` class if you want to render static models or worlds, or the `SceneManager` class if you want to render a running Gazebo simulation.

# Development

## Setup

You need the following:
- Node version 18.
- NPM version 8.

You can use [NVM](https://github.com/nvm-sh/nvm) to switch between versions easily. With it, you can then do:

```
nvm install 18
nvm use 18
node -v && npm -v # Your versions will be correct.
```

After this, install dependencies with:

```
npm install
```

## Test

Run the tests using

```
npm run test
```

## Build

Once you have your dependencies installed, you can run:

```
npm run build
```

## Local development

If you are working on changes on `gzweb` and want to try them in an application, then you can setup a `link` using these steps.

1. In the root of the `gzweb` sources run
    ```
    npm link
    ```

2. This should create a symlink to the `gzweb` folder in the global node path, which can be found using `npm root -g`.

3. Connect the downstream application to the `gzweb` symlink using
    ```
    npm link gzweb
    ```

4. In the downstream application's `node_modules` directory you should see a corresponding symlink to `gzweb`.

5. All you have to do now is run `npm run build`.
