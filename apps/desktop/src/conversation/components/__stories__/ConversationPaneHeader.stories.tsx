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

export const WithSingleAction: Story = {
  args: {
    actions: (
      <Button variant="outline" size="sm">
        Review changes
      </Button>
    ),
  },
};

export const WithMultipleActions: Story = {
  args: {
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

export const InConversationContext: Story = {
  render: () => (
    <div className="h-screen flex flex-col bg-background">
      <ConversationPaneHeader
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
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Conversation content would go here
      </div>
    </div>
  ),
};
