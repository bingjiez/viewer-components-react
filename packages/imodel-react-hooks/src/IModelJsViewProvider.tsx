/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import {
  DecorateContext,
  Decorator,
  IModelApp,
  Marker,
  Viewport,
} from "@bentley/imodeljs-frontend";
import React, { useCallback, useEffect, useMemo, useRef } from "react";

import { makeContextWithProviderRequired } from "./utils";

/**
 * @internal the MarkerDecorationContext is for internal use only and
 * does not guarantee a stable api
 */
export interface MarkerDecorationContext {
  decoration: Decorator;
  register: (m: Marker) => void;
  unregister: (m: Marker) => void;
  refreshPosition: (m: Marker) => void;
  enqueueViewInvalidation: () => void;
}

export const MarkerDecorationContext =
  makeContextWithProviderRequired<MarkerDecorationContext>(
    "MarkerDecorationContext"
  );

const isViewportValidForDecorations = (v: Viewport) =>
  "invalidateDecorations" in v;

/** @internal */
export class MarkerDecoration implements Decorator {
  private _markersRef: readonly Marker[];
  public viewFilter: (vp: Viewport) => boolean;

  public constructor(
    markersRef: readonly Marker[],
    inViewFilter?: (vp: Viewport) => boolean
  ) {
    this._markersRef = markersRef;
    this.viewFilter = inViewFilter ?? isViewportValidForDecorations;
  }

  public decorate(context: DecorateContext): void {
    if (this.viewFilter(context.viewport)) {
      this._markersRef.forEach((m) => m.addDecoration(context));
    }
  }
}

export interface IModelJsViewProviderProps extends React.PropsWithChildren<{}> {
  viewFilter?: (vp: Viewport) => boolean;
}

export const IModelJsViewProvider = ({
  children,
  viewFilter,
}: IModelJsViewProviderProps) => {
  const markers = useRef<Marker[]>([]);

  const decoratorInstance = useMemo(
    () => new MarkerDecoration(markers.current, viewFilter),
    [markers]
  );

  useEffect(() => {
    if (viewFilter) {
      decoratorInstance.viewFilter = viewFilter;
    }
  }, [viewFilter]);

  useEffect(() => {
    IModelApp.viewManager.addDecorator(decoratorInstance);
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    () => () => IModelApp.viewManager.dropDecorator(decoratorInstance);
  }, [decoratorInstance]);

  const enqueueViewInvalidation = useCallback(
    () =>
      setTimeout(() => {
        for (const vp of IModelApp.viewManager)
          if (viewFilter?.(vp) ?? true) vp.invalidateDecorations();
      }),
    []
  );

  const register = useCallback((toAdd: Marker) => {
    markers.current.push(toAdd);
  }, []);

  /** NOTE: might make this strong ordering optional in the future for
   * performance reasons but it should be fine so doing it always for now.
   * A better implementation would be a separate "registered set" and "order list"
   * and the order list can be push only and cleared at the end of the tree render
   */
  const refreshPosition = useCallback((toRefresh: Marker) => {
    const index = markers.current.findIndex((m) => m === toRefresh);
    if (index > -1) {
      markers.current.splice(index, 1);
      markers.current.unshift(toRefresh);
    }
  }, []);

  const unregister = useCallback((toRemove: Marker) => {
    const index = markers.current.findIndex((m) => m === toRemove);
    if (index > -1) {
      markers.current.splice(index, 1);
      enqueueViewInvalidation();
    }
  }, []);

  const contextState = useMemo(
    () => ({
      decoration: decoratorInstance,
      register,
      unregister,
      enqueueViewInvalidation,
      refreshPosition,
    }),
    [
      decoratorInstance,
      register,
      unregister,
      enqueueViewInvalidation,
      refreshPosition,
    ]
  );

  //clear order list before rendering?

  return (
    <MarkerDecorationContext.Provider value={contextState}>
      {children}
    </MarkerDecorationContext.Provider>
  );
};
