/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { Position } from '@elastic/charts';
import {
  ExpressionFunction,
  ArgumentType,
} from '../../../../../../src/legacy/core_plugins/interpreter/public';

export interface LegendConfig {
  isVisible: boolean;
  position: Position;
}

type LegendConfigResult = LegendConfig & { type: 'lens_xy_legendConfig' };

export const legendConfig: ExpressionFunction<
  'lens_xy_legendConfig',
  null,
  LegendConfig,
  LegendConfigResult
> = {
  name: 'lens_xy_legendConfig',
  aliases: [],
  type: 'lens_xy_legendConfig',
  help: `Configure the xy chart's legend`,
  context: {
    types: ['null'],
  },
  args: {
    isVisible: {
      types: ['boolean'],
      help: 'Specifies whether or not the legend is visible.',
    },
    position: {
      types: ['string'],
      options: [Position.Top, Position.Right, Position.Bottom, Position.Left],
      help: 'Specifies the legend position.',
    },
  },
  fn: function fn(_context: unknown, args: LegendConfig) {
    return {
      type: 'lens_xy_legendConfig',
      ...args,
    };
  },
};

interface AxisConfig {
  title: string;
  hide?: boolean;
}

const axisConfig: { [key in keyof AxisConfig]: ArgumentType<AxisConfig[key]> } = {
  title: {
    types: ['string'],
    help: 'The axis title',
  },
  hide: {
    types: ['boolean'],
    default: false,
    help: 'Show / hide axis',
  },
};

export interface YState extends AxisConfig {
  accessors: string[];
}

export interface XConfig extends AxisConfig {
  accessor: string;
}

type XConfigResult = XConfig & { type: 'lens_xy_xConfig' };

export const xConfig: ExpressionFunction<'lens_xy_xConfig', null, XConfig, XConfigResult> = {
  name: 'lens_xy_xConfig',
  aliases: [],
  type: 'lens_xy_xConfig',
  help: `Configure the xy chart's x axis`,
  context: {
    types: ['null'],
  },
  args: {
    ...axisConfig,
    accessor: {
      types: ['string'],
      help: 'The column to display on the x axis.',
    },
  },
  fn: function fn(_context: unknown, args: XConfig) {
    return {
      type: 'lens_xy_xConfig',
      ...args,
    };
  },
};

type LayerConfigResult = LayerArgs & { type: 'lens_xy_layer' };

export const layerConfig: ExpressionFunction<
  'lens_xy_layer',
  null,
  LayerArgs,
  LayerConfigResult
> = {
  name: 'lens_xy_layer',
  aliases: [],
  type: 'lens_xy_layer',
  help: `Configure a layer in the xy chart`,
  context: {
    types: ['null'],
  },
  args: {
    ...axisConfig,
    layerId: {
      types: ['string'],
      help: '',
    },
    xAccessor: {
      types: ['string'],
      help: '',
    },
    seriesType: {
      types: ['string'],
      options: ['bar', 'line', 'area', 'bar_stacked', 'area_stacked'],
      help: 'The type of chart to display.',
    },
    splitAccessor: {
      types: ['string'],
      help: 'The column to split by',
      multi: false,
    },
    accessors: {
      types: ['string'],
      help: 'The columns to display on the y axis.',
      multi: true,
    },
    columnToLabel: {
      types: ['string'],
      help: 'JSON key-value pairs of column ID to label',
    },
  },
  fn: function fn(_context: unknown, args: LayerArgs) {
    return {
      type: 'lens_xy_layer',
      ...args,
    };
  },
};

export type SeriesType = 'bar' | 'line' | 'area' | 'bar_stacked' | 'area_stacked';

export type LayerConfig = AxisConfig & {
  layerId: string;
  xAccessor: string;
  accessors: string[];
  seriesType: SeriesType;
  splitAccessor: string;
};

export type LayerArgs = LayerConfig & {
  columnToLabel?: string; // Actually a JSON key-value pair
};

// Arguments to XY chart expression, with computed properties
export interface XYArgs {
  xTitle: string;
  yTitle: string;
  legend: LegendConfig;
  layers: LayerArgs[];
  isHorizontal: boolean;
}

// Persisted parts of the state
export interface XYState {
  legend: LegendConfig;
  layers: LayerConfig[];
  isHorizontal: boolean;
}

export type State = XYState;
export type PersistableState = XYState;