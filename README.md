# react-element-id [![NPM Version][npm-image]][npm-url] ![Build Status][ghactions-image] [![Coverage Status][codecov-image]][codecov-url]

> A React context & hook for managing and asserting the uniqueness of explicitly defined DOM `id`s.

The hook performs the following operations automatically:

- Adds the ID to the provided registry on mount.
- Removes the ID from the provided registry on unmount.
- Replaces the ID in the provided registry when its value changes.
- Either throws an error or logs a warning when a duplicate ID is found within the provided registry.
- Optionally throws an error for a _required_ ID if it was not given a value.

> [!IMPORTANT]
> If your app integrates multiple `Document`s, you'll need to create and provide a registry for each since their `id`s do not overlap.

## Consumer Usage

To install:

```shell
npm i react-element-id
```

To import into your SPA:

```js
import { createElementIdRegistry, ElementIdRegistryContext, WARN } from 'react-element-id';

// This will not directly break your app if a duplicate is found at runtime
const registry = createElementIdRegistry(WARN);

renderToDOM(
  <ElementIdRegistryContext.Provider value={registry}>
    <App />
  </ElementIdRegistryContext.Provider>
);
```

To import into your SSR/SSG MPA:

```js
import { createElementIdRegistry, ElementIdRegistryContext, THROW } from 'react-element-id';

// This will intentionally fail your build when a duplicate is found
const registry = createElementIdRegistry(THROW);

renderToString(
  <ElementIdRegistryContext.Provider value={registry}>
    <App />
  </ElementIdRegistryContext.Provider>
);
```

To import into your components:

```js
import { useElementId } from 'react-element-id';

const MyComponent = ({ id }) => {
  useElementId(id);
  return <div id={id} />;
};

export default () => (
  <>
    <MyComponent id="duplicate" />
    <MyComponent id="duplicate" /> {/* error */}
  </>
);
```

## Development Usage

### Production Build

```shell
npm run build
```

### Testing

The test suite can perform a _single run_:

```shell
npm test
```

… or indefinitely as files are changed:

```shell
npm run test:watch
```

[npm-image]: https://img.shields.io/npm/v/react-element-id
[npm-url]: https://npmjs.org/react-element-id
[ghactions-image]: https://img.shields.io/github/actions/workflow/status/stevenvachon/react-element-id/test.yml
[codecov-image]: https://img.shields.io/codecov/c/github/stevenvachon/react-element-id
[codecov-url]: https://app.codecov.io/github/stevenvachon/react-element-id
