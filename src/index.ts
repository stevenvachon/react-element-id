import BaseRegistry from './BaseRegistry';
import { createContext, useContext, useEffect, useRef } from 'react';

export const THROW = 'throw' as const;
export const WARN = 'warn' as const;

export type DuplicateBehavior = typeof THROW | typeof WARN;
export type ElementId = string;
export type OptionalElementId = ElementId | null | undefined;

export interface ElementIdRegistry {
  addId: (id: ElementId) => boolean;
  removeId: (id: OptionalElementId) => boolean;
}

export const ElementIdRegistryContext = createContext<ElementIdRegistry | null>(null);

/**
 * Creates a new registry for a `Document`'s IDs.
 */
export const createElementIdRegistry = (
  duplicateBehavior: DuplicateBehavior
): ElementIdRegistry => {
  const ids = new BaseRegistry();

  return {
    addId: id => {
      if (ids.has(id)) {
        const message = `useElementId: Element \`id\` "${id}" already exists within its Document.`;
        if (duplicateBehavior === WARN) console.warn(message);
        if (duplicateBehavior === THROW) throw new Error(message);
        return false;
      }
      ids.add(id);
      return true;
    },
    removeId: id => {
      if (!id) return false;
      return ids.delete(id);
    },
  };
};

/**
 * Registers an element ID and asserts its uniqueness within the provider's registry.
 */
export const useElementId: {
  (id: ElementId, required: true): void;
  (id: OptionalElementId, required?: false): void;
} = (id, required = false) => {
  const registry = useContext(ElementIdRegistryContext);
  if (!registry) {
    throw new Error(
      'useElementId must be used within `<ElementIdRegistry.Provider registry={...}>`.'
    );
  }

  const prevIdRef = useRef<ElementId>(null);

  if (typeof id !== 'string' || id.length === 0) {
    if (required) {
      throw new TypeError('useElementId: `id` must be a non-empty string.');
    }
    registry.removeId(prevIdRef.current);
    prevIdRef.current = null;
  } else if (id !== prevIdRef.current && registry.addId(id)) {
    registry.removeId(prevIdRef.current);
    prevIdRef.current = id;
  }

  // Non-SSR/SSG
  useEffect(() => {
    return () => {
      registry.removeId(prevIdRef.current);
    };
  }, [registry]);
};
