import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createElementIdRegistry,
  type DuplicateBehavior,
  type ElementIdRegistry,
  ElementIdRegistryContext,
  type OptionalElementId,
  THROW,
  useElementId,
  WARN,
} from './index';
import { type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.stubGlobal('console', {
  ...console,
  warn: vi.fn(),
});

vi.mock('./BaseRegistry', () => ({
  default: class MockBaseRegistry extends Set {
    static instances: MockBaseRegistry[] = [];
    constructor(...args: any[]) {
      super(...args);
      MockBaseRegistry.instances.push(this);
    }
    add = vi.fn((v: any) => super.add(v));
    delete = vi.fn((v: any) => super.delete(v));
    has = vi.fn((v: any) => super.has(v));
  },
}));

type BaseRegistry = typeof import('./BaseRegistry').default; // Imports original type, NOT the mock
type MockBaseRegistry = BaseRegistry & { instances: InstanceType<BaseRegistry>[] };
let MockedBaseRegistry: MockBaseRegistry;

interface RenderUseElementIdProps {
  id: OptionalElementId;
  required?: boolean;
}

type RegistryOrBehavior = ElementIdRegistry | DuplicateBehavior | false;

const getRegistry = (registryOrBehavior: RegistryOrBehavior) =>
  registryOrBehavior === false
    ? null
    : registryOrBehavior === THROW || registryOrBehavior === WARN
      ? createElementIdRegistry(registryOrBehavior)
      : registryOrBehavior;

/**
 * Render the `useElementId` hook to the DOM; optionally within a new or referenced registry, or none at all.
 * @param registryOrBehavior When the value is:
 *  - An `ElementIdRegistry`, it will be referenced.
 *  - A `DuplicateBehavior`, it will create an `ElementIdRegistry` using it.
 *  - `false`, there will be no encapsulating `ElementIdRegistry`.
 */
const renderUseElementId = (
  registryOrBehavior: RegistryOrBehavior,
  initialProps: RenderUseElementIdProps
) => {
  const registry = getRegistry(registryOrBehavior);
  return renderHook(
    ({ id, required }) => useElementId(id, required as any), // Ugh
    {
      initialProps,
      wrapper:
        (registry &&
          (({ children }: { children: ReactNode }) => (
            <ElementIdRegistryContext.Provider value={registry}>
              {children}
            </ElementIdRegistryContext.Provider>
          ))) ||
        undefined,
    }
  );
};

/**
 * Render the `useElementId` hook statically (as a string for SSR/SSG) to the DOM;
 * optionally within a new or referenced registry, or none at all.
 * @param registryOrBehavior When the value is:
 *  - An `ElementIdRegistry`, it will be referenced.
 *  - A `DuplicateBehavior`, it will create an `ElementIdRegistry` using it.
 *  - `false`, there will be no encapsulating `ElementIdRegistry`.
 */
const renderUseElementIdStatic = (
  registryOrBehavior: RegistryOrBehavior,
  props: RenderUseElementIdProps
) => {
  const registry = getRegistry(registryOrBehavior);
  const TestComponent = ({ id, required }: RenderUseElementIdProps) => {
    useElementId(id, required as any); // Ugh
    return null;
  };
  return renderToStaticMarkup(
    registry ? (
      <ElementIdRegistryContext.Provider value={registry}>
        <TestComponent {...props} />
      </ElementIdRegistryContext.Provider>
    ) : (
      <TestComponent {...props} />
    )
  );
};

/**
 * Render the `useElementId` hook using both `renderUseElementId` and `renderUseElementIdStatic`, consecutively.
 */
const eachRenderUseElementId = (
  callback: (render: typeof renderUseElementId | typeof renderUseElementIdStatic) => void
) =>
  [renderUseElementId, renderUseElementIdStatic].forEach(render => {
    callback(render);
    reset();
  });

/**
 * Reset between tests.
 */
const reset = () => {
  vi.clearAllMocks();
  MockedBaseRegistry.instances.length = 0;
};

const ID1 = 'some-id';
const ID2 = 'another-id';

beforeAll(async () => {
  MockedBaseRegistry = (await import('./BaseRegistry')).default as MockBaseRegistry;
});

beforeEach(reset);

it('throws an error when there is no encapsulating Provider', () =>
  eachRenderUseElementId(render => expect(() => render(false, { id: ID1 })).toThrowError()));

describe('mount', () => {
  it('adds an ID to the registry', () =>
    eachRenderUseElementId(render => {
      render(THROW, { id: ID1 });
      const [baseRegistry] = MockedBaseRegistry.instances;
      expect(baseRegistry.add).toHaveBeenCalledExactlyOnceWith(ID1);
    }));

  [null, undefined].forEach(id =>
    it(`does not add a ${id} ID to the registry`, () =>
      eachRenderUseElementId(render => {
        render(THROW, { id });
        const [baseRegistry] = MockedBaseRegistry.instances;
        expect(baseRegistry.add).not.toHaveBeenCalled();
      }))
  );

  it('throws an error when a required ID has no value', () =>
    eachRenderUseElementId(render => {
      // Used WARN to avoid confusion with duplicate behavior
      expect(() => render(WARN, { id: null, required: true })).toThrow(TypeError);
      const [baseRegistry] = MockedBaseRegistry.instances;
      expect(baseRegistry.add).not.toHaveBeenCalled();
      expect(baseRegistry.delete).not.toHaveBeenCalled();
    }));

  describe('duplicate behavior', () => {
    it('logs a warning when an ID is a duplicate', () =>
      eachRenderUseElementId(render => {
        const registry = createElementIdRegistry(WARN);
        render(registry, { id: ID1 });
        expect(console.warn).not.toHaveBeenCalled();
        render(registry, { id: ID1 });
        expect(console.warn).toHaveBeenCalledOnce();
        const [baseRegistry] = MockedBaseRegistry.instances;
        expect(baseRegistry.add).toHaveBeenCalledTimes(1);
        expect(baseRegistry.delete).not.toHaveBeenCalled();
      }));

    it('throws an error when an ID is a duplicate', () =>
      eachRenderUseElementId(render => {
        const registry = createElementIdRegistry(THROW);
        expect(() => render(registry, { id: ID1 })).not.toThrowError();
        expect(() => render(registry, { id: ID1 })).toThrow(Error);
        const [baseRegistry] = MockedBaseRegistry.instances;
        expect(baseRegistry.add).toHaveBeenCalledTimes(1);
        // Throw occurs before the commit phase, so cleanup/unmount does not occur
        expect(baseRegistry.delete).not.toHaveBeenCalled();
      }));

    it('does not treat IDs in separate registries as duplicates', () =>
      eachRenderUseElementId(render => {
        expect(() => render(THROW, { id: ID1 })).not.toThrowError();
        expect(() => render(THROW, { id: ID1 })).not.toThrowError();
        render(WARN, { id: ID1 });
        render(WARN, { id: ID1 });
        expect(console.warn).not.toHaveBeenCalled();
        expect(MockedBaseRegistry.instances).toHaveLength(4);
        MockedBaseRegistry.instances.forEach(registry =>
          expect(registry.add).toHaveBeenCalledExactlyOnceWith(ID1)
        );
      }));
  });
});

// DOM-only
describe('unmount', () => {
  it('removes an ID from the registry', () => {
    const { unmount } = renderUseElementId(THROW, { id: ID1 });
    const [baseRegistry] = MockedBaseRegistry.instances;
    expect(baseRegistry.add).toHaveBeenCalledExactlyOnceWith(ID1);
    unmount();
    expect(baseRegistry.delete).toHaveBeenCalledExactlyOnceWith(ID1);
    expect(baseRegistry.delete).toHaveBeenCalledTimes(1);
    expect(baseRegistry.add).toHaveBeenCalledTimes(1);
  });

  [null, undefined].forEach(id =>
    it(`does not attempt to remove an ID replaced with ${id} from the registry`, () => {
      const { unmount } = renderUseElementId(THROW, { id });
      unmount();
      const [baseRegistry] = MockedBaseRegistry.instances;
      expect(baseRegistry.delete).not.toHaveBeenCalled();
    })
  );
});

// DOM-only
describe('value change', () => {
  it('replaces an ID in the registry', () => {
    const { rerender } = renderUseElementId(THROW, { id: ID1 });
    const [baseRegistry] = MockedBaseRegistry.instances;
    expect(baseRegistry.add).toHaveBeenCalledExactlyOnceWith(ID1);
    rerender({ id: ID2 });
    expect(baseRegistry.delete).toHaveBeenCalledExactlyOnceWith(ID1);
    expect(baseRegistry.add).toHaveBeenLastCalledWith(ID2);
    rerender({ id: null });
    expect(baseRegistry.delete).toHaveBeenLastCalledWith(ID2);
    expect(baseRegistry.delete).toHaveBeenCalledTimes(2);
    expect(baseRegistry.add).toHaveBeenCalledTimes(2);
  });

  [null, undefined].forEach(id =>
    it(`throws an error when a required ID is changed to ${id}`, () => {
      const required = true;
      // Used WARN to avoid confusion with duplicate behavior
      const { rerender } = renderUseElementId(WARN, { id: ID1, required });
      expect(() => rerender({ id, required })).toThrow(TypeError);
      const [baseRegistry] = MockedBaseRegistry.instances;
      expect(baseRegistry.add).toHaveBeenCalledOnce();
      expect(baseRegistry.delete).toHaveBeenCalledOnce();
    })
  );

  describe('duplicate behavior', () => {
    it('logs a warning when an ID is a duplicate', () => {
      const registry = createElementIdRegistry(WARN);
      renderUseElementId(registry, { id: ID1 });
      const { rerender } = renderUseElementId(registry, { id: ID2 });
      rerender({ id: ID1 });
      expect(console.warn).toHaveBeenCalledOnce();
      const [baseRegistry] = MockedBaseRegistry.instances;
      expect(baseRegistry.add).toHaveBeenCalledTimes(2);
      expect(baseRegistry.delete).not.toHaveBeenCalled();
    });

    it('throws an error when an ID is a duplicate', () => {
      const registry = createElementIdRegistry(THROW);
      renderUseElementId(registry, { id: ID1 });
      const { rerender } = renderUseElementId(registry, { id: ID2 });
      expect(() => rerender({ id: ID1 })).toThrow(Error);
      const [baseRegistry] = MockedBaseRegistry.instances;
      expect(baseRegistry.add).toHaveBeenCalledTimes(2);
      expect(baseRegistry.delete).toHaveBeenCalledOnce(); // Throw causes cleanup/unmount
    });

    it('does not treat IDs in separate registries as duplicates', () => {
      type ReRender = ReturnType<typeof renderUseElementId>['rerender'];
      let rerender1!: ReRender;
      let rerender2!: ReRender;
      let rerender3!: ReRender;
      let rerender4!: ReRender;
      expect(
        () => ({ rerender: rerender1 } = renderUseElementId(THROW, { id: ID1 }))
      ).not.toThrowError();
      expect(
        () => ({ rerender: rerender2 } = renderUseElementId(THROW, { id: ID1 }))
      ).not.toThrowError();
      expect(
        () => ({ rerender: rerender3 } = renderUseElementId(WARN, { id: ID1 }))
      ).not.toThrowError();
      expect(
        () => ({ rerender: rerender4 } = renderUseElementId(WARN, { id: ID1 }))
      ).not.toThrowError();
      expect(MockedBaseRegistry.instances).toHaveLength(4);
      MockedBaseRegistry.instances.forEach(baseRegistry =>
        expect(baseRegistry.add).toHaveBeenCalledExactlyOnceWith(ID1)
      );
      expect(() => rerender1({ id: ID2 })).not.toThrowError();
      expect(() => rerender2({ id: ID2 })).not.toThrowError();
      rerender3({ id: ID2 });
      rerender4({ id: ID2 });
      expect(console.warn).not.toHaveBeenCalled();
      MockedBaseRegistry.instances.forEach(baseRegistry => {
        expect(baseRegistry.delete).toHaveBeenLastCalledWith(ID1);
        expect(baseRegistry.add).toHaveBeenLastCalledWith(ID2);
        expect(baseRegistry.add).toHaveBeenCalledTimes(2);
      });
    });
  });
});
