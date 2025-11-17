import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '~/components/ui/button';

import { ConversationPaneHeader } from '../ConversationPaneHeader';

const meta: Meta<typeof ConversationPaneHeader> = {
  title: 'Components/Conversation/ConversationPaneHeader',
  component: ConversationPaneHeader,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof ConversationPaneHeader>;

export const Default: Story = {
  args: {
    workspacePath: '/Users/john/projects/my-app',
  },
};

export const LongPath: Story = {
  args: {
    workspacePath:
      '/Users/john/Documents/Development/Projects/Web/my-awesome-application',
  },
};

export const ShortPath: Story = {
  args: {
    workspacePath: '/tmp/test',
  },
};

export const WindowsPath: Story = {
  args: {
    workspacePath: 'C:\\Users\\john\\projects\\my-app',
  },
};

export const WithActions: Story = {
  args: {
    workspacePath: '/Users/john/projects/my-app',
    actions: (
      <>
        <Button variant="ghost" size="sm">
          Settings
        </Button>
        <Button variant="default" size="sm">
          Share
        </Button>
      </>
    ),
  },
};

export const WithSingleAction: Story = {
  args: {
    workspacePath: '/Users/john/projects/my-app',
    actions: (
      <Button variant="outline" size="sm">
        Export
      </Button>
    ),
  },
};

export const NestedPath: Story = {
  args: {
    workspacePath: '/Users/john/code/company/frontend/packages/ui-library',
  },
};

export const HomeDirectory: Story = {
  args: {
    workspacePath: '/Users/john',
  },
};

export const RootDirectory: Story = {
  args: {
    workspacePath: '/',
  },
};

export const AllVariations: Story = {
  render: () => (
    <div className="flex flex-col gap-1">
      <div className="text-xs text-muted-foreground px-6 py-2">
        Default (no actions):
      </div>
      <ConversationPaneHeader workspacePath="/Users/john/projects/my-app" />

      <div className="text-xs text-muted-foreground px-6 py-2 mt-4">
        With actions:
      </div>
      <ConversationPaneHeader
        workspacePath="/Users/john/projects/my-app"
        actions={
          <>
            <Button variant="ghost" size="sm">
              Settings
            </Button>
            <Button variant="default" size="sm">
              Share
            </Button>
          </>
        }
      />

      <div className="text-xs text-muted-foreground px-6 py-2 mt-4">
        Long path:
      </div>
      <ConversationPaneHeader workspacePath="/Users/john/Documents/Development/Projects/Web/my-awesome-application-with-a-very-long-name" />

      <div className="text-xs text-muted-foreground px-6 py-2 mt-4">
        Windows path:
      </div>
      <ConversationPaneHeader workspacePath="C:\\Users\\john\\Documents\\Projects\\MyApp" />
    </div>
  ),
};

export const InConversationContext: Story = {
  render: () => (
    <div className="h-screen flex flex-col bg-background">
      <ConversationPaneHeader
        workspacePath="/Users/john/projects/my-app"
        actions={
          <Button variant="ghost" size="sm">
            Settings
          </Button>
        }
      />
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Conversation content would go here
      </div>
    </div>
  ),
};
