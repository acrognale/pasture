import type React from 'react';

export type HostId = string;
export type DockId = 'editor' | 'utility';
export type PanelKindId = string;
export type PanelInstanceId = string;
export type PanelGroupId = string;
export type SplitId = string;

export type PanelScope = 'conversation' | 'workspace' | 'app';

export type PanelKindDefinition<Params = unknown, State = unknown> = {
  kindId: PanelKindId;
  scope: PanelScope;
  title: (params: Params, state: State | null) => string;
  icon?: React.ComponentType<{ className?: string }>;
  dedupeKey?: (params: Params) => string;
  Component: React.ComponentType<PanelComponentProps>;
  serializeState?: (state: State) => unknown;
  deserializeState?: (json: unknown) => State;
};

export type PanelComponentProps = {
  instanceId: PanelInstanceId;
};

export type SplitDirection = 'row' | 'column';

export type DockLayoutNode =
  | {
      type: 'group';
      groupId: PanelGroupId;
      tabs: PanelInstanceId[];
      activeTabId: PanelInstanceId | null;
    }
  | {
      type: 'split';
      splitId: SplitId;
      direction: SplitDirection;
      sizes: number[];
      children: DockLayoutNode[];
    };

export type HostLayoutNode =
  | {
      type: 'dock';
      dockId: DockId;
    }
  | {
      type: 'split';
      splitId: SplitId;
      direction: SplitDirection;
      sizes: number[];
      children: HostLayoutNode[];
    };
