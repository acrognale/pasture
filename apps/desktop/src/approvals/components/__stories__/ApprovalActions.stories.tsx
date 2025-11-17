import type { Meta, StoryObj } from '@storybook/react-vite';

import { ApprovalActions } from '../ApprovalActions';

const meta: Meta<typeof ApprovalActions> = {
  title: 'Components/Approval/ApprovalActions',
  component: ApprovalActions,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    decision: {
      control: 'select',
      options: ['pending', 'approved', 'approved_for_session', 'rejected'],
    },
    approvalType: {
      control: 'select',
      options: ['exec', 'patch'],
    },
    isActive: {
      control: 'boolean',
    },
    queueSize: {
      control: { type: 'number', min: 0, max: 10 },
    },
    isPending: {
      control: 'boolean',
    },
  },
  args: {
    onApprove: () => {},
    onApproveForSession: () => {},
    onReject: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof ApprovalActions>;

export const ExecPendingActive: Story = {
  args: {
    decision: 'pending',
    approvalType: 'exec',
    isActive: true,
    queueSize: 1,
    isPending: false,
  },
};

export const ExecPendingWithQueue: Story = {
  args: {
    decision: 'pending',
    approvalType: 'exec',
    isActive: true,
    queueSize: 3,
    isPending: false,
  },
};

export const ExecPendingSubmitting: Story = {
  args: {
    decision: 'pending',
    approvalType: 'exec',
    isActive: true,
    queueSize: 1,
    isPending: true,
  },
};

export const ExecPendingNotActive: Story = {
  args: {
    decision: 'pending',
    approvalType: 'exec',
    isActive: false,
    queueSize: 2,
    isPending: false,
  },
};

export const ExecPendingNoQueue: Story = {
  args: {
    decision: 'pending',
    approvalType: 'exec',
    isActive: false,
    queueSize: 0,
    isPending: false,
  },
};

export const ExecApproved: Story = {
  args: {
    decision: 'approved',
    approvalType: 'exec',
    isActive: false,
    queueSize: 0,
    isPending: false,
  },
};

export const ExecApprovedForSession: Story = {
  args: {
    decision: 'approved_for_session',
    approvalType: 'exec',
    isActive: false,
    queueSize: 0,
    isPending: false,
  },
};

export const ExecRejected: Story = {
  args: {
    decision: 'rejected',
    approvalType: 'exec',
    isActive: false,
    queueSize: 0,
    isPending: false,
  },
};

export const PatchPendingActive: Story = {
  args: {
    decision: 'pending',
    approvalType: 'patch',
    isActive: true,
    queueSize: 1,
    isPending: false,
  },
};

export const PatchApproved: Story = {
  args: {
    decision: 'approved',
    approvalType: 'patch',
    isActive: false,
    queueSize: 0,
    isPending: false,
  },
};

export const PatchRejected: Story = {
  args: {
    decision: 'rejected',
    approvalType: 'patch',
    isActive: false,
    queueSize: 0,
    isPending: false,
  },
};

export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-6 bg-background max-w-2xl">
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          Command Approval - Active
        </h3>
        <div className="p-4 bg-card rounded-lg border border-border">
          <ApprovalActions
            decision="pending"
            approvalType="exec"
            isActive={true}
            queueSize={1}
            isPending={false}
            onApprove={() => {}}
            onApproveForSession={() => {}}
            onReject={() => {}}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          Command Approval - With Queue
        </h3>
        <div className="p-4 bg-card rounded-lg border border-border">
          <ApprovalActions
            decision="pending"
            approvalType="exec"
            isActive={true}
            queueSize={5}
            isPending={false}
            onApprove={() => {}}
            onApproveForSession={() => {}}
            onReject={() => {}}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          Command Approval - Submitting
        </h3>
        <div className="p-4 bg-card rounded-lg border border-border">
          <ApprovalActions
            decision="pending"
            approvalType="exec"
            isActive={true}
            queueSize={1}
            isPending={true}
            onApprove={() => {}}
            onApproveForSession={() => {}}
            onReject={() => {}}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          Command Approved
        </h3>
        <div className="p-4 bg-card rounded-lg border border-border">
          <ApprovalActions
            decision="approved"
            approvalType="exec"
            isActive={false}
            queueSize={0}
            isPending={false}
            onApprove={() => {}}
            onApproveForSession={() => {}}
            onReject={() => {}}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          Command Approved for Session
        </h3>
        <div className="p-4 bg-card rounded-lg border border-border">
          <ApprovalActions
            decision="approved_for_session"
            approvalType="exec"
            isActive={false}
            queueSize={0}
            isPending={false}
            onApprove={() => {}}
            onApproveForSession={() => {}}
            onReject={() => {}}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          Command Rejected
        </h3>
        <div className="p-4 bg-card rounded-lg border border-border">
          <ApprovalActions
            decision="rejected"
            approvalType="exec"
            isActive={false}
            queueSize={0}
            isPending={false}
            onApprove={() => {}}
            onApproveForSession={() => {}}
            onReject={() => {}}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          Patch Approval - Active
        </h3>
        <div className="p-4 bg-card rounded-lg border border-border">
          <ApprovalActions
            decision="pending"
            approvalType="patch"
            isActive={true}
            queueSize={1}
            isPending={false}
            onApprove={() => {}}
            onReject={() => {}}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">Patch Approved</h3>
        <div className="p-4 bg-card rounded-lg border border-border">
          <ApprovalActions
            decision="approved"
            approvalType="patch"
            isActive={false}
            queueSize={0}
            isPending={false}
            onApprove={() => {}}
            onReject={() => {}}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">Patch Rejected</h3>
        <div className="p-4 bg-card rounded-lg border border-border">
          <ApprovalActions
            decision="rejected"
            approvalType="patch"
            isActive={false}
            queueSize={0}
            isPending={false}
            onApprove={() => {}}
            onReject={() => {}}
          />
        </div>
      </div>
    </div>
  ),
};
