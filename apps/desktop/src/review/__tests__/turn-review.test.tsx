import type { TranscriptTurnDiff } from '@pasture/transcript-ui';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockCodex } from '~/testing/codex';
import { renderWithProviders } from '~/testing/harness';

import { TurnReviewProvider } from '../TurnReviewContext';
import { TurnReviewPane } from '../TurnReviewPane';
import { reviewCommentStore } from '../commentsStore';
import { makeTurnReviewKey } from '../reviewKeys';

const WORKSPACE_PATH = '/tmp/workspace';

const iso = (value: string) => new Date(value).toISOString();

const makeTurnDiff = (
  overrides: Partial<TranscriptTurnDiff> = {}
): TranscriptTurnDiff => ({
  eventId: overrides.eventId ?? 'evt-1',
  timestamp: overrides.timestamp ?? iso('2024-01-01T00:00:00Z'),
  unifiedDiff: overrides.unifiedDiff ?? '',
  turnNumber: overrides.turnNumber ?? 1,
  turnId: overrides.turnId,
  headSnapshotId: overrides.headSnapshotId,
});

const SIMPLE_UNIFIED_DIFF = [
  'diff --git a/app/main.ts b/app/main.ts',
  '--- a/app/main.ts',
  '+++ b/app/main.ts',
  '@@ -1,3 +1,4 @@',
  ' import { something } from "x";',
  '-console.log("old value");',
  '+console.log("new value");',
  '+console.log("another line");',
].join('\n');

describe('Turn review pane integration', () => {
  it('allows adding comments and submitting consolidated feedback', async () => {
    const history: TranscriptTurnDiff[] = [
      makeTurnDiff({
        eventId: 'evt-1',
        turnId: 'turn-1',
        turnNumber: 1,
        unifiedDiff: SIMPLE_UNIFIED_DIFF,
      }),
    ];
    const latestDiff = history[0] ?? null;

    const onRequestFeedback = vi.fn();
    const onClose = vi.fn();

    reviewCommentStore.getState().actions.reset();

    renderWithProviders(
      <TurnReviewProvider
        conversationId="conversation-1"
        latestDiff={latestDiff}
        history={history}
      >
        <TurnReviewPane
          workspacePath={WORKSPACE_PATH}
          onRequestFeedback={onRequestFeedback}
          onClose={onClose}
        />
      </TurnReviewProvider>
    );

    const reviewKey = makeTurnReviewKey({
      conversationId: 'conversation-1',
      baseEventId: null,
      targetEventId: 'turn-1',
    });

    act(() => {
      reviewCommentStore.getState().actions.addComment({
        reviewKey,
        filePath: 'app/main.ts',
        side: 'modified',
        lineNumber: 2,
        text: 'Please update this line',
        navigation: {
          mode: 'turn',
          workspacePath: WORKSPACE_PATH,
          conversationId: 'conversation-1',
          reviewKey,
          baseEventId: null,
          targetEventId: 'turn-1',
          filePath: 'app/main.ts',
          oldPath: null,
          newPath: null,
          commentableLines: [2],
        },
      });
    });

    // Comment thread is rendered and header shows updated count
    await screen.findByText('1 comment');

    const submitButton = screen.getByRole('button', { name: /submit/i });
    expect(submitButton).toBeEnabled();

    await userEvent.click(submitButton);

    expect(onRequestFeedback).toHaveBeenCalledTimes(1);
    const prompt = onRequestFeedback.mock.calls[0]?.[0] as string;

    expect(prompt).toMatch(/Here is my consolidated review of turn 1/i);
    expect(prompt).toMatch(/app\/main\.ts/);
    expect(prompt).toMatch(/Please update this line/);
    expect(prompt).toMatch(/line 2/);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders an empty review state when no diff is available', () => {
    renderWithProviders(
      <TurnReviewProvider
        conversationId="conversation-empty"
        latestDiff={null}
        history={[]}
      >
        <TurnReviewPane workspacePath={WORKSPACE_PATH} />
      </TurnReviewProvider>
    );

    expect(
      screen.getByText(
        /Awaiting agent changes for this turn\. Diffs will appear here once available\./i
      )
    ).toBeInTheDocument();

    const submitButton = screen.getByRole('button', { name: /submit/i });
    expect(submitButton).toBeDisabled();
  });

  it('requests a range diff when snapshots are available and prefers it over the fallback diff', async () => {
    const fallbackDiff = [
      'diff --git a/fallback.txt b/fallback.txt',
      '--- a/fallback.txt',
      '+++ b/fallback.txt',
      '@@ -1 +1 @@',
      '-old fallback line',
      '+new fallback line',
    ].join('\n');

    const rangeDiff = [
      'diff --git a/range.txt b/range.txt',
      '--- a/range.txt',
      '+++ b/range.txt',
      '@@ -1 +1 @@',
      '-old range line',
      '+range diff content',
    ].join('\n');

    const history: TranscriptTurnDiff[] = [
      makeTurnDiff({
        eventId: 'evt-1',
        turnId: 'turn-1',
        turnNumber: 1,
        unifiedDiff: fallbackDiff,
        timestamp: iso('2024-01-01T00:00:00Z'),
      }),
      makeTurnDiff({
        eventId: 'evt-2',
        turnId: 'turn-2',
        turnNumber: 2,
        unifiedDiff: fallbackDiff,
        timestamp: iso('2024-01-01T01:00:00Z'),
      }),
    ];
    const latestDiff = history[1] ?? null;

    mockCodex.stub.listTurnSnapshots.mockResolvedValue({
      disabled: false,
      baseCommitId: 'base-commit',
      snapshots: [
        { eventId: 'turn-1', commitId: 'c1' },
        { eventId: 'turn-2', commitId: 'c2' },
      ],
    });

    mockCodex.stub.getTurnDiffRange.mockResolvedValue({
      unifiedDiff: rangeDiff,
    });

    renderWithProviders(
      <TurnReviewProvider
        conversationId="conversation-range"
        latestDiff={latestDiff}
        history={history}
      >
        <TurnReviewPane workspacePath={WORKSPACE_PATH} />
      </TurnReviewProvider>
    );

    await waitFor(() => {
      expect(mockCodex.stub.getTurnDiffRange).toHaveBeenCalled();
    });

    expect(mockCodex.stub.getTurnDiffRange).toHaveBeenCalledWith({
      conversationId: 'conversation-range',
      baseEventId: null,
      targetEventId: 'turn-2',
    });

    await screen.findByRole('button', { name: /range\.txt/i });
    expect(screen.queryByRole('button', { name: /fallback\.txt/i })).toBeNull();
  });

  it('refetches diffs when the range selection changes', async () => {
    const initialRangeDiff = [
      'diff --git a/start.txt b/start.txt',
      '--- a/start.txt',
      '+++ b/start.txt',
      '@@ -1 +1 @@',
      '-old range line',
      '+range diff from workspace start',
    ].join('\n');

    const updatedRangeDiff = [
      'diff --git a/turn2.txt b/turn2.txt',
      '--- a/turn2.txt',
      '+++ b/turn2.txt',
      '@@ -1 +1 @@',
      '-old range line',
      '+range diff from turn 2',
    ].join('\n');

    const history: TranscriptTurnDiff[] = [
      makeTurnDiff({
        eventId: 'evt-1',
        turnId: 'turn-1',
        turnNumber: 1,
        timestamp: iso('2024-01-01T00:00:00Z'),
      }),
      makeTurnDiff({
        eventId: 'evt-2',
        turnId: 'turn-2',
        turnNumber: 2,
        timestamp: iso('2024-01-01T01:00:00Z'),
      }),
      makeTurnDiff({
        eventId: 'evt-3',
        turnId: 'turn-3',
        turnNumber: 3,
        timestamp: iso('2024-01-01T02:00:00Z'),
      }),
    ];
    const latestDiff = history[2] ?? null;

    mockCodex.stub.listTurnSnapshots.mockResolvedValue({
      disabled: false,
      baseCommitId: 'base-commit',
      snapshots: [
        { eventId: 'turn-1', commitId: 'c1' },
        { eventId: 'turn-2', commitId: 'c2' },
        { eventId: 'turn-3', commitId: 'c3' },
      ],
    });

    mockCodex.stub.getTurnDiffRange
      .mockResolvedValueOnce({
        unifiedDiff: initialRangeDiff,
      })
      .mockResolvedValueOnce({
        unifiedDiff: updatedRangeDiff,
      });

    renderWithProviders(
      <TurnReviewProvider
        conversationId="conversation-range-selection"
        latestDiff={latestDiff}
        history={history}
      >
        <TurnReviewPane workspacePath={WORKSPACE_PATH} />
      </TurnReviewProvider>
    );

    await waitFor(() => {
      expect(mockCodex.stub.getTurnDiffRange).toHaveBeenCalledTimes(1);
    });

    expect(mockCodex.stub.getTurnDiffRange).toHaveBeenLastCalledWith({
      conversationId: 'conversation-range-selection',
      baseEventId: null,
      targetEventId: 'turn-3',
    });

    await screen.findByRole('button', { name: /start\.txt/i });

    const baseButton = screen.getByRole('button', {
      name: /workspace start/i,
    });
    await userEvent.click(baseButton);

    const turnTwoOption = await screen.findByText('Turn 2');
    await userEvent.click(turnTwoOption);

    await waitFor(() => {
      expect(mockCodex.stub.getTurnDiffRange).toHaveBeenCalledTimes(2);
    });

    expect(mockCodex.stub.getTurnDiffRange).toHaveBeenLastCalledWith({
      conversationId: 'conversation-range-selection',
      baseEventId: 'turn-2',
      targetEventId: 'turn-3',
    });

    await screen.findByRole('button', { name: /turn2\.txt/i });
    expect(screen.queryByRole('button', { name: /start\.txt/i })).toBeNull();
  });

  it('refetches diffs when the target turn selection changes', async () => {
    const turn3RangeDiff = [
      'diff --git a/turn3.txt b/turn3.txt',
      '--- a/turn3.txt',
      '+++ b/turn3.txt',
      '@@ -1 +1 @@',
      '-old range line',
      '+range diff for turn 3',
    ].join('\n');

    const turn2RangeDiff = [
      'diff --git a/turn2.txt b/turn2.txt',
      '--- a/turn2.txt',
      '+++ b/turn2.txt',
      '@@ -1 +1 @@',
      '-old range line',
      '+range diff for turn 2',
    ].join('\n');

    const history: TranscriptTurnDiff[] = [
      makeTurnDiff({
        eventId: 'evt-1',
        turnId: 'turn-1',
        turnNumber: 1,
        timestamp: iso('2024-01-01T00:00:00Z'),
      }),
      makeTurnDiff({
        eventId: 'evt-2',
        turnId: 'turn-2',
        turnNumber: 2,
        timestamp: iso('2024-01-01T01:00:00Z'),
      }),
      makeTurnDiff({
        eventId: 'evt-3',
        turnId: 'turn-3',
        turnNumber: 3,
        timestamp: iso('2024-01-01T02:00:00Z'),
      }),
    ];
    const latestDiff = history[2] ?? null;

    mockCodex.stub.listTurnSnapshots.mockResolvedValue({
      disabled: false,
      baseCommitId: 'base-commit',
      snapshots: [
        { eventId: 'turn-1', commitId: 'c1' },
        { eventId: 'turn-2', commitId: 'c2' },
        { eventId: 'turn-3', commitId: 'c3' },
      ],
    });

    mockCodex.stub.getTurnDiffRange
      .mockResolvedValueOnce({
        unifiedDiff: turn3RangeDiff,
      })
      .mockResolvedValueOnce({
        unifiedDiff: turn2RangeDiff,
      });

    renderWithProviders(
      <TurnReviewProvider
        conversationId="conversation-target-selection"
        latestDiff={latestDiff}
        history={history}
      >
        <TurnReviewPane workspacePath={WORKSPACE_PATH} />
      </TurnReviewProvider>
    );

    await waitFor(() => {
      expect(mockCodex.stub.getTurnDiffRange).toHaveBeenCalledTimes(1);
    });

    expect(mockCodex.stub.getTurnDiffRange).toHaveBeenLastCalledWith({
      conversationId: 'conversation-target-selection',
      baseEventId: null,
      targetEventId: 'turn-3',
    });

    await screen.findByRole('button', { name: /turn3\.txt/i });

    const turnButton = screen.getByRole('button', {
      name: /Turn 3/i,
    });
    await userEvent.click(turnButton);

    const turnTwoOption = await screen.findByText('Turn 2');
    await userEvent.click(turnTwoOption);

    await waitFor(() => {
      expect(mockCodex.stub.getTurnDiffRange).toHaveBeenCalledTimes(2);
    });

    expect(mockCodex.stub.getTurnDiffRange).toHaveBeenLastCalledWith({
      conversationId: 'conversation-target-selection',
      baseEventId: null,
      targetEventId: 'turn-2',
    });

    await screen.findByRole('button', { name: /turn2\.txt/i });
    expect(screen.queryByRole('button', { name: /turn3\.txt/i })).toBeNull();
  });
});
