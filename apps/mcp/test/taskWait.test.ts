// room_task wait / resume / review receipts (ported from the hosted
// deployment's #747 and #855). The room's server keeps the wait on the board;
// this package forwards the action and tells the agent how to keep listening.
import { describe, expect, it } from 'vitest';
import { RUNNING_JOB_LISTEN_MS, runningJobWaitHint, STDIO_SERVER_INSTRUCTIONS, toLegacyCall } from '../src/tools.js';
import { acknowledgeTaskReview, resumeTask, waitTask } from '../src/roomApi.js';

describe('room_task wait actions', () => {
  it('routes wait, block, resume, ack and review_start to their handlers', () => {
    expect(toLegacyCall('room_task', { code: 'C', action: 'wait', id: 'T-1' })).toMatchObject({ name: 'room_task_wait', args: { id: 'T-1' } });
    expect(toLegacyCall('room_task', { code: 'C', action: 'block', id: 'T-1' }).name).toBe('room_task_wait');
    expect(toLegacyCall('room_task', { code: 'C', action: 'resume', id: 'T-1' }).name).toBe('room_task_resume');
    expect(toLegacyCall('room_task', { code: 'C', action: 'ack', id: 'T-1' })).toMatchObject({ name: 'room_task_ack', args: { started: false } });
    expect(toLegacyCall('room_task', { code: 'C', action: 'review_start', id: 'T-1' })).toMatchObject({ name: 'room_task_ack', args: { started: true } });
  });

  it('posts the room API actions the hosted server understands', async () => {
    const calls: unknown[] = [];
    const client = { post: async (body: unknown) => { calls.push(body); return { board: { tasks: [] }, task: { id: 'T-1' } }; } } as never;
    await waitTask(client, 'C', 'T-1', 'Codex', 'cc', { scope: 'owner', reasonCode: 'running_job', reason: 'Crawl running', resumeWhen: 'Script exits' });
    await resumeTask(client, 'C', 'T-1', 'Codex', 'cc', 'Crawl finished with 120 rows');
    await acknowledgeTaskReview(client, 'C', 'T-2', 'Codex', 'cc', true, 'n-1');
    expect(calls).toEqual([
      { action: 'taskWait', code: 'C', id: 'T-1', name: 'Codex', client: 'cc', scope: 'owner', reasonCode: 'running_job', reason: 'Crawl running', resumeWhen: 'Script exits' },
      { action: 'taskResume', code: 'C', id: 'T-1', name: 'Codex', client: 'cc', resolution: 'Crawl finished with 120 rows' },
      { action: 'taskReviewAck', code: 'C', id: 'T-2', name: 'Codex', client: 'cc', started: true, notificationId: 'n-1' },
    ]);
  });

  it('keeps a running-job wait listening in short windows instead of ending the turn', () => {
    const hint = runningJobWaitHint('ABC-DEF-GHJ', 'T-37', true);
    expect(RUNNING_JOB_LISTEN_MS).toBe(60_000);
    expect(hint).toContain('timeoutMs: 60000');
    expect(hint).toContain('room_task resume for T-37');
    expect(hint).toContain('do not submit partial evidence');
    expect(runningJobWaitHint('ABC-DEF-GHJ', 'T-38', false)).not.toContain('timeoutMs');
  });

  it('tells every agent how to wait instead of dropping out', () => {
    expect(STDIO_SERVER_INSTRUCTIONS).toContain('room_task wait');
    expect(STDIO_SERVER_INSTRUCTIONS).toContain('reasonCode running_job');
    expect(STDIO_SERVER_INSTRUCTIONS).toContain('do not submit partial evidence');
  });
});
